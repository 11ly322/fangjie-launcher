use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::error::{CoreError, CoreResult};
use crate::model::{Loader, ModDependency};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadConfig {
    pub default_source: String,
    pub offline: bool,
    /// Optional HTTP proxy, e.g. `http://127.0.0.1:7890`.
    pub proxy: Option<String>,
    /// Future mirror chain. The Modrinth source still defaults to the official
    /// public API; no launcher-owned server is used.
    pub mirrors: Vec<String>,
}

impl Default for DownloadConfig {
    fn default() -> Self {
        Self {
            default_source: "modrinth".to_string(),
            offline: false,
            proxy: None,
            mirrors: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub query: String,
    pub game_version: String,
    pub loader: Loader,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModCandidate {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedMod {
    pub project_id: String,
    pub version_id: String,
    pub name: String,
    pub file_name: String,
    pub download_url: String,
    pub sha1: Option<String>,
    pub dependencies: Vec<ModDependency>,
}

pub trait DownloadSource: Send + Sync {
    fn id(&self) -> &str;
    fn search(&self, options: &SearchOptions) -> CoreResult<Vec<ModCandidate>>;
    fn resolve_dependency(
        &self,
        dependency_id: &str,
        game_version: &str,
        loader: Loader,
    ) -> CoreResult<ResolvedMod>;
    fn download(&self, resolved: &ResolvedMod, destination: &Path) -> CoreResult<()>;
}

#[derive(Clone)]
pub struct SourceRegistry {
    sources: HashMap<String, Arc<dyn DownloadSource>>,
    default_source: String,
    config: DownloadConfig,
}

impl SourceRegistry {
    pub fn new(config: DownloadConfig) -> CoreResult<Self> {
        let mut sources: HashMap<String, Arc<dyn DownloadSource>> = HashMap::new();
        let modrinth = ModrinthSource::new(config.proxy.clone(), config.mirrors.clone())?;
        sources.insert("modrinth".to_string(), Arc::new(modrinth));
        Ok(Self {
            default_source: config.default_source.clone(),
            sources,
            config,
        })
    }

    pub fn register(&mut self, source: Arc<dyn DownloadSource>) {
        self.sources.insert(source.id().to_string(), source);
    }

    pub fn config(&self) -> &DownloadConfig {
        &self.config
    }

    pub fn source(&self, id: Option<&str>) -> CoreResult<Arc<dyn DownloadSource>> {
        let id = id.unwrap_or(&self.default_source);
        self.sources
            .get(id)
            .cloned()
            .ok_or_else(|| CoreError::NotFound(format!("download source {id}")))
    }

    pub fn search(
        &self,
        source_id: Option<&str>,
        options: &SearchOptions,
    ) -> CoreResult<Vec<ModCandidate>> {
        self.source(source_id)?.search(options)
    }

    pub fn resolve_dependency(
        &self,
        source_id: Option<&str>,
        dependency_id: &str,
        game_version: &str,
        loader: Loader,
    ) -> CoreResult<ResolvedMod> {
        if self.config.offline {
            return Err(CoreError::Offline(format!(
                "cannot resolve {dependency_id} while offline"
            )));
        }
        self.source(source_id)?
            .resolve_dependency(dependency_id, game_version, loader)
    }

    pub fn download(
        &self,
        source_id: Option<&str>,
        resolved: &ResolvedMod,
        destination: &Path,
    ) -> CoreResult<()> {
        if self.config.offline {
            return Err(CoreError::Offline(format!(
                "cannot download {} while offline",
                resolved.file_name
            )));
        }
        self.source(source_id)?.download(resolved, destination)
    }
}

pub struct ModrinthSource {
    agent: ureq::Agent,
    base_url: String,
}

impl ModrinthSource {
    pub fn new(proxy: Option<String>, mirrors: Vec<String>) -> CoreResult<Self> {
        let mut builder = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(12))
            .timeout_read(Duration::from_secs(45))
            .user_agent("fangjie-core/0.1 (crash-diagnostics)");
        if let Some(proxy) = proxy {
            let proxy = ureq::Proxy::new(&proxy)
                .map_err(|error| CoreError::InvalidInput(format!("invalid proxy: {error}")))?;
            builder = builder.proxy(proxy);
        }
        let base_url = mirrors
            .first()
            .cloned()
            .unwrap_or_else(|| "https://api.modrinth.com/v2".to_string());
        Ok(Self {
            agent: builder.build(),
            base_url: base_url.trim_end_matches('/').to_string(),
        })
    }

    fn get_json(&self, url: &str) -> CoreResult<serde_json::Value> {
        let response = self.agent.get(url).call()?;
        if response.status() != 200 {
            return Err(CoreError::Network(format!(
                "HTTP {} from {}",
                response.status(),
                url
            )));
        }
        serde_json::from_reader(response.into_reader()).map_err(CoreError::from)
    }
}

impl DownloadSource for ModrinthSource {
    fn id(&self) -> &str {
        "modrinth"
    }

    fn search(&self, options: &SearchOptions) -> CoreResult<Vec<ModCandidate>> {
        let facets = serde_json::json!([
            ["project_type:mod"],
            [format!("versions:{}", options.game_version)],
            [format!("categories:{}", options.loader.as_str())]
        ]);
        let url = format!(
            "{}/search?query={}&limit={}&facets={}",
            self.base_url,
            urlencoding::encode(&options.query),
            options.limit.clamp(1, 50),
            urlencoding::encode(&facets.to_string())
        );
        let value = self.get_json(&url)?;
        let hits = value
            .get("hits")
            .and_then(|hits| hits.as_array())
            .ok_or_else(|| CoreError::Network("Modrinth search response had no hits".into()))?;
        Ok(hits
            .iter()
            .filter_map(|hit| {
                Some(ModCandidate {
                    project_id: hit.get("project_id")?.as_str()?.to_string(),
                    slug: hit.get("slug")?.as_str()?.to_string(),
                    title: hit.get("title")?.as_str()?.to_string(),
                    description: hit
                        .get("description")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    downloads: hit.get("downloads").and_then(|value| value.as_u64()).unwrap_or(0),
                    icon_url: hit
                        .get("icon_url")
                        .and_then(|value| value.as_str())
                        .map(str::to_string),
                })
            })
            .collect())
    }

    fn resolve_dependency(
        &self,
        dependency_id: &str,
        game_version: &str,
        loader: Loader,
    ) -> CoreResult<ResolvedMod> {
        let options = SearchOptions {
            query: dependency_id.to_string(),
            game_version: game_version.to_string(),
            loader,
            limit: 8,
        };
        let candidates = self.search(&options)?;
        let candidate = candidates
            .into_iter()
            .find(|candidate| {
                candidate.slug.eq_ignore_ascii_case(dependency_id)
                    || candidate.title.eq_ignore_ascii_case(dependency_id)
            })
            .ok_or_else(|| {
                CoreError::NotFound(format!(
                    "no Modrinth project matched dependency {dependency_id}"
                ))
            })?;

        let versions_url = format!(
            "{}/project/{}/version?game_versions={}&loaders={}",
            self.base_url,
            urlencoding::encode(&candidate.project_id),
            urlencoding::encode(&format!("[\"{game_version}\"]")),
            urlencoding::encode(&format!("[\"{}\"]", loader.as_str()))
        );
        let versions = self.get_json(&versions_url)?;
        let versions = versions
            .as_array()
            .ok_or_else(|| CoreError::Network("invalid version list".into()))?;
        let version = versions
            .first()
            .ok_or_else(|| CoreError::NotFound(format!("no compatible version for {dependency_id}")))?;
        let files = version
            .get("files")
            .and_then(|files| files.as_array())
            .ok_or_else(|| CoreError::Network("version has no files".into()))?;
        let file = files
            .iter()
            .find(|file| file.get("primary").and_then(|value| value.as_bool()) == Some(true))
            .or_else(|| files.first())
            .ok_or_else(|| CoreError::NotFound(format!("no file for {dependency_id}")))?;
        let dependencies = version
            .get("dependencies")
            .and_then(|deps| deps.as_array())
            .map(|deps| {
                deps.iter()
                    .filter_map(|dep| {
                        let id = dep.get("project_id")?.as_str()?.to_string();
                        let kind = dep
                            .get("dependency_type")
                            .and_then(|value| value.as_str())
                            .unwrap_or("required");
                        Some(ModDependency {
                            id,
                            requirement: None,
                            mandatory: kind == "required",
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(ResolvedMod {
            project_id: candidate.project_id,
            version_id: version
                .get("id")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
            name: version
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or(candidate.title.as_str())
                .to_string(),
            file_name: file
                .get("filename")
                .and_then(|value| value.as_str())
                .ok_or_else(|| CoreError::Network("file has no filename".into()))?
                .to_string(),
            download_url: file
                .get("url")
                .and_then(|value| value.as_str())
                .ok_or_else(|| CoreError::Network("file has no URL".into()))?
                .to_string(),
            sha1: file
                .get("hashes")
                .and_then(|hashes| hashes.get("sha1"))
                .and_then(|value| value.as_str())
                .map(str::to_string),
            dependencies,
        })
    }

    fn download(&self, resolved: &ResolvedMod, destination: &Path) -> CoreResult<()> {
        let response = self.agent.get(&resolved.download_url).call()?;
        if response.status() != 200 {
            return Err(CoreError::Network(format!(
                "HTTP {} downloading {}",
                response.status(),
                resolved.file_name
            )));
        }
        let mut bytes = Vec::new();
        response.into_reader().read_to_end(&mut bytes)?;
        if let Some(expected) = &resolved.sha1 {
            let actual = format!("{:x}", Sha1::digest(&bytes));
            if !actual.eq_ignore_ascii_case(expected) {
                return Err(CoreError::Network(format!(
                    "SHA1 mismatch for {}: expected {expected}, got {actual}",
                    resolved.file_name
                )));
            }
        }
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temporary = destination.with_extension("download");
        std::fs::write(&temporary, bytes)?;
        std::fs::rename(temporary, destination)?;
        Ok(())
    }
}

#[derive(Default)]
pub struct FixtureSource {
    entries: Mutex<HashMap<String, (ResolvedMod, Vec<u8>)>>,
}

impl FixtureSource {
    pub fn add(&self, dependency_id: &str, resolved: ResolvedMod, bytes: Vec<u8>) {
        self.entries
            .lock()
            .expect("fixture source poisoned")
            .insert(dependency_id.to_string(), (resolved, bytes));
    }
}

impl DownloadSource for FixtureSource {
    fn id(&self) -> &str {
        "fixture"
    }

    fn search(&self, options: &SearchOptions) -> CoreResult<Vec<ModCandidate>> {
        Ok(self
            .entries
            .lock()
            .expect("fixture source poisoned")
            .keys()
            .filter(|id| id.to_lowercase().contains(&options.query.to_lowercase()))
            .map(|id| ModCandidate {
                project_id: id.clone(),
                slug: id.clone(),
                title: id.clone(),
                description: String::new(),
                downloads: 0,
                icon_url: None,
            })
            .collect())
    }

    fn resolve_dependency(
        &self,
        dependency_id: &str,
        _game_version: &str,
        _loader: Loader,
    ) -> CoreResult<ResolvedMod> {
        self.entries
            .lock()
            .expect("fixture source poisoned")
            .get(dependency_id)
            .map(|(resolved, _)| resolved.clone())
            .ok_or_else(|| CoreError::NotFound(format!("fixture dependency {dependency_id}")))
    }

    fn download(&self, resolved: &ResolvedMod, destination: &Path) -> CoreResult<()> {
        let bytes = self
            .entries
            .lock()
            .expect("fixture source poisoned")
            .values()
            .find(|(entry, _)| entry.file_name == resolved.file_name)
            .map(|(_, bytes)| bytes.clone())
            .ok_or_else(|| CoreError::NotFound(resolved.file_name.clone()))?;
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(destination, bytes)?;
        Ok(())
    }
}
