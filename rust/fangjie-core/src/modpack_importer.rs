use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};

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
