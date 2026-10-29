use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModDependency {
    pub id: String,
    #[serde(default)]
    pub requirement: Option<String>,
    #[serde(default = "default_true")]
    pub mandatory: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Loader {
    Vanilla,
    Fabric,
    Quilt,
    Forge,
    NeoForge,
}

impl Loader {
    pub fn as_str(self) -> &'static str {
        match self {
            Loader::Vanilla => "vanilla",
            Loader::Fabric => "fabric",
            Loader::Quilt => "quilt",
            Loader::Forge => "forge",
            Loader::NeoForge => "neoforge",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub name: String,
    /// Instance root. It contains `instance.json` and the game directory.
    pub root: PathBuf,
    /// The `.minecraft` directory for this instance.
    pub game_dir: PathBuf,
    pub game_version: String,
    pub loader: Loader,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub java_path: Option<PathBuf>,
    #[serde(default = "default_memory")]
    pub memory_mb: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
}

fn default_memory() -> u32 {
    4096
}

impl Instance {
    pub fn manifest_path(&self) -> PathBuf {
        self.root.join("instance.json")
    }

    pub fn mods_dir(&self) -> PathBuf {
        self.game_dir.join("mods")
    }

    pub fn config_dir(&self) -> PathBuf {
        self.game_dir.join("config")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.game_dir.join("logs")
    }

    pub fn crash_reports_dir(&self) -> PathBuf {
        self.game_dir.join("crash-reports")
    }

    pub fn path_inside_game(&self, relative: &Path) -> CoreResult<PathBuf> {
        let joined = self.game_dir.join(relative);
        let normalized = normalize_path(&joined);
        let root = normalize_path(&self.game_dir);
        if !normalized.starts_with(&root) {
            return Err(CoreError::UnsafePath(joined));
        }
        Ok(joined)
    }
}

pub fn normalize_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                result.pop();
            }
            std::path::Component::CurDir => {}
            other => result.push(other.as_os_str()),
        }
    }
    result
}

pub fn read_instance(manifest: &Path) -> CoreResult<Instance> {
    let raw = std::fs::read_to_string(manifest)?;
    let mut instance: Instance = serde_json::from_str(&raw)?;
    if instance.root.as_os_str().is_empty() {
        instance.root = manifest
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| CoreError::InvalidInput("instance manifest has no parent".into()))?;
    }
    Ok(instance)
}

pub fn write_instance(instance: &Instance) -> CoreResult<()> {
    std::fs::create_dir_all(&instance.root)?;
    let raw = serde_json::to_string_pretty(instance)?;
    std::fs::write(instance.manifest_path(), raw)?;
    Ok(())
}
