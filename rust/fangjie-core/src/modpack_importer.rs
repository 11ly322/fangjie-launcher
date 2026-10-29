use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::model::{normalize_path, Instance};
use crate::mod_scanner::ModScanner;
use sha1::{Digest, Sha1};
use zip::ZipArchive;

/// P1 interface only. Import is deliberately not wired into P0.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModpackFormat {
    ModrinthMrpack,
    CurseForgeZip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackFile {
    pub path: String,
    pub url: String,
    pub sha1: String,
    pub size: u64,
    #[serde(default)]
    pub client_required: bool,
    #[serde(default)]
    pub server_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackManifest {
    pub name: String,
    pub version: String,
    pub minecraft_version: String,
    pub loader: String,
    pub loader_version: String,
    pub files: Vec<ModpackFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackImportPlan {
    pub format: ModpackFormat,
    pub manifest: ModpackManifest,
    /// Paths outside the instance root are rejected by the importer.
    pub target_root: PathBuf,
}

pub trait ModpackImporter: Send + Sync {
    fn format(&self) -> ModpackFormat;
    fn detect(&self, archive: &Path) -> bool;
    fn read_manifest(&self, archive: &Path) -> CoreResult<ModpackManifest>;
    fn plan(&self, archive: &Path, instance_root: &Path) -> CoreResult<ModpackImportPlan>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackImportReport {
    pub name: String,
    pub version: String,
    pub downloaded: usize,
    pub overrides: usize,
    pub skipped: usize,
    pub warnings: Vec<String>,
}

fn read_json_file(archive: &mut ZipArchive<std::fs::File>, name: &str) -> CoreResult<serde_json::Value> {
    let mut entry = archive
        .by_name(name)
        .map_err(|_| CoreError::InvalidInput(format!("modpack is missing {name}")))?;
    let mut text = String::new();
    entry.read_to_string(&mut text)?;
    Ok(serde_json::from_str(&text)?)
}

fn safe_relative(path: &str) -> CoreResult<PathBuf> {
    let normalized = normalize_path(Path::new(path));
    if normalized.as_os_str().is_empty()
        || normalized.is_absolute()
        || normalized.components().any(|component| component == std::path::Component::ParentDir)
    {
        return Err(CoreError::UnsafePath(PathBuf::from(path)));
    }
    Ok(normalized)
}

pub fn read_mrpack(path: &Path) -> CoreResult<ModpackManifest> {
    let file = std::fs::File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let index = read_json_file(&mut archive, "modrinth.index.json")?;
    if index.get("formatVersion").and_then(|value| value.as_u64()) != Some(1) {
        return Err(CoreError::InvalidInput("unsupported .mrpack formatVersion".into()));
    }
    let deps = index.get("dependencies").and_then(|value| value.as_object());
    let minecraft = deps
        .and_then(|deps| deps.get("minecraft"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| CoreError::InvalidInput("modpack has no minecraft dependency".into()))?;
    let (loader, loader_version) = [
        ("fabric", "fabric-loader"),
        ("quilt", "quilt-loader"),
        ("neoforge", "neoforge"),
        ("forge", "forge"),
    ]
    .iter()
    .find_map(|(loader, key)| {
        deps.and_then(|deps| deps.get(*key))
            .and_then(|value| value.as_str())
            .map(|version| ((*loader).to_string(), version.to_string()))
    })
    .unwrap_or_else(|| ("vanilla".to_string(), String::new()));
    let files = index
        .get("files")
        .and_then(|value| value.as_array())
        .map(|files| {
            files
                .iter()
                .filter_map(|file| {
                    let path = file.get("path")?.as_str()?.to_string();
                    let downloads = file.get("downloads")?.as_array()?;
                    let url = downloads.first()?.as_str()?.to_string();
                    let env = file.get("env").cloned().unwrap_or_default();
                    let client = env.get("client").and_then(|value| value.as_str()).unwrap_or("required");
                    if client == "unsupported" {
                        return None;
                    }
                    Some(ModpackFile {
                        path,
                        url,
                        sha1: file
                            .get("hashes")
                            .and_then(|hashes| hashes.get("sha1"))
                            .and_then(|value| value.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        size: file.get("fileSize").and_then(|value| value.as_u64()).unwrap_or(0),
                        client_required: client == "required",
                        server_required: false,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(ModpackManifest {
        name: index.get("name").and_then(|value| value.as_str()).unwrap_or("Modpack").to_string(),
        version: index.get("versionId").and_then(|value| value.as_str()).unwrap_or("1.0.0").to_string(),
        minecraft_version: minecraft.to_string(),
        loader,
        loader_version,
        files,
    })
}

/// Minimal P1 .mrpack importer. It applies a pack to an existing instance so
/// the instance creation/loader install path stays in Electron. CurseForge zip
/// import is not implemented yet.
pub fn apply_mrpack(instance: &Instance, archive_path: &Path) -> CoreResult<ModpackImportReport> {
    let manifest = read_mrpack(archive_path)?;
    if !manifest.minecraft_version.eq_ignore_ascii_case(&instance.game_version) {
        return Err(CoreError::InvalidInput(format!(
            "modpack targets Minecraft {}, instance is {}",
            manifest.minecraft_version, instance.game_version
        )));
    }
    let before = ModScanner::scan(instance)?.mods.len();
    let file = std::fs::File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut downloaded = 0usize;
    let mut skipped = 0usize;
    let mut warnings = Vec::new();
    for item in &manifest.files {
        let relative = safe_relative(&item.path)?;
        let destination = instance.game_dir.join(&relative);
        if !destination.starts_with(&instance.game_dir) {
            return Err(CoreError::UnsafePath(destination));
        }
        if destination.exists() {
            skipped += 1;
            continue;
        }
        let response = ureq::get(&item.url).call()?;
        if response.status() != 200 {
            warnings.push(format!("{} returned HTTP {}", item.url, response.status()));
            continue;
        }
        let mut bytes = Vec::new();
        response.into_reader().read_to_end(&mut bytes)?;
        if item.size > 0 && bytes.len() as u64 != item.size {
            return Err(CoreError::InvalidInput(format!("size mismatch for {}", item.path)));
        }
        if !item.sha1.is_empty() {
            let actual = format!("{:x}", Sha1::digest(&bytes));
            if !actual.eq_ignore_ascii_case(&item.sha1) {
                return Err(CoreError::InvalidInput(format!("SHA1 mismatch for {}", item.path)));
            }
        }
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&destination, bytes)?;
        downloaded += 1;
    }
    let mut overrides = 0usize;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(name) = entry.enclosed_name() else { continue };
        let name = name.to_string_lossy().replace('\\', "/");
        if let Some(rest) = name.strip_prefix("overrides/") {
            if entry.is_dir() || rest.is_empty() {
                continue;
            }
            let relative = safe_relative(rest)?;
            let destination = instance.game_dir.join(relative);
            if !destination.starts_with(&instance.game_dir) {
                return Err(CoreError::UnsafePath(destination));
            }
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes)?;
            std::fs::write(&destination, bytes)?;
            overrides += 1;
        }
    }
    let after = ModScanner::scan(instance)?.mods.len();
    if after == before && !manifest.files.is_empty() {
        warnings.push("no new mods were detected after import".into());
    }
    Ok(ModpackImportReport {
        name: manifest.name,
        version: manifest.version,
        downloaded,
        overrides,
        skipped,
        warnings,
    })
}

pub fn detect_by_extension(path: &Path) -> CoreResult<ModpackFormat> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("mrpack") => Ok(ModpackFormat::ModrinthMrpack),
        Some("zip") => Ok(ModpackFormat::CurseForgeZip),
        _ => Err(CoreError::InvalidInput(
            "modpack must be .mrpack or .zip".into(),
        )),
    }
}
