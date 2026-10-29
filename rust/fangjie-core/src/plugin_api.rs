use serde::{Deserialize, Serialize};

pub const PLUGIN_API_VERSION: &str = "1.0.0";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginKind {
    CrashAnalyzer,
    DownloadSource,
    AccountProvider,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    ReadLogs,
    ModifyMods,
    Network,
    ReadAccountMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    /// Contract version, currently `1.0.0`.
    pub api_version: String,
    pub kind: PluginKind,
    /// Explicit capabilities requested from the host.
    pub permissions: Vec<Permission>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginValidation {
    pub manifest: PluginManifest,
    pub warnings: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("invalid plugin version: {0}")]
    InvalidVersion(String),
    #[error("unsupported plugin API {found}; host supports {supported}")]
    UnsupportedApi { found: String, supported: String },
    #[error("plugin id must be a non-empty reverse-domain identifier")]
    InvalidId,
    #[error("plugin {plugin} lacks required permission {permission:?}")]
    MissingPermission {
        plugin: String,
        permission: Permission,
    },
}

/// Validate a plugin before it is registered. API compatibility is major/minor
/// based; patch releases are accepted.
pub fn validate_manifest(manifest: &PluginManifest) -> Result<PluginValidation, PluginError> {
    if !manifest.id.contains('.') || manifest.id.trim().is_empty() {
        return Err(PluginError::InvalidId);
    }
    let version = semver::Version::parse(&manifest.version)
        .map_err(|_| PluginError::InvalidVersion(manifest.version.clone()))?;
    let api = semver::Version::parse(&manifest.api_version)
        .map_err(|_| PluginError::InvalidVersion(manifest.api_version.clone()))?;
    let host = semver::Version::parse(PLUGIN_API_VERSION)
        .map_err(|_| PluginError::InvalidVersion(PLUGIN_API_VERSION.into()))?;
    if api.major != host.major || api.minor > host.minor {
        return Err(PluginError::UnsupportedApi {
            found: manifest.api_version.clone(),
            supported: PLUGIN_API_VERSION.into(),
        });
    }
    let mut warnings = Vec::new();
    if version.major == 0 {
        warnings.push("0.x plugin: API may change between minor releases".into());
    }
    if manifest.permissions.is_empty() {
        warnings.push("plugin requests no permissions".into());
    }
    Ok(PluginValidation {
        manifest: manifest.clone(),
        warnings,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashAnalysisContext {
    pub instance_id: String,
    pub game_version: String,
    pub loader: String,
    pub log_excerpt: String,
}

pub trait CrashAnalyzerPlugin: Send + Sync {
    fn manifest(&self) -> &PluginManifest;
    fn analyze(&self, context: &CrashAnalysisContext) -> Result<Vec<String>, String>;
}

pub trait DownloadSourcePlugin: Send + Sync {
    fn manifest(&self) -> &PluginManifest;
    fn source_id(&self) -> &str;
    fn base_url(&self) -> &str;
}

pub trait AccountProviderPlugin: Send + Sync {
    fn manifest(&self) -> &PluginManifest;
    fn provider_id(&self) -> &str;
    fn begin_login(&self) -> Result<String, String>;
}

#[derive(Default)]
pub struct PluginRegistry {
    manifests: Vec<PluginManifest>,
}

impl PluginRegistry {
    pub fn register(&mut self, manifest: PluginManifest) -> Result<PluginValidation, PluginError> {
        let validation = validate_manifest(&manifest)?;
        self.manifests.push(manifest);
        Ok(validation)
    }

    pub fn manifests(&self) -> &[PluginManifest] {
        &self.manifests
    }
}
