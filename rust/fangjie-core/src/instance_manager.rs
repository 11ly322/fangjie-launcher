use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::error::{CoreError, CoreResult};
use crate::model::{read_instance, write_instance, Instance, Loader};
use crate::mod_scanner::{ModScanner, ScannedMod};

pub struct InstanceManager {
    root: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceTemplate {
    pub id: String,
    pub name: String,
    pub jvm_args: Vec<String>,
    pub memory_mb: u32,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub mod_files: Vec<String>,
    pub loader: Loader,
    pub game_version: String,
    pub created_at_unix: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModEnableChange {
    pub file_name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModListExport {
    pub instance_id: String,
    pub game_version: String,
    pub loader: String,
    pub mods: Vec<ExportedMod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedMod {
    pub file_name: String,
    pub mod_id: String,
    pub name: String,
    pub version: Option<String>,
    pub sha1: String,
}

impl InstanceManager {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn instance_dir(&self, id: &str) -> PathBuf {
        self.root.join("instances").join(id)
    }

    pub fn load(&self, id: &str) -> CoreResult<Instance> {
        let manifest = self.instance_dir(id).join("instance.json");
        if !manifest.exists() {
            return Err(CoreError::NotFound(format!("instance {id}")));
        }
        read_instance(&manifest)
    }

    pub fn list(&self) -> CoreResult<Vec<Instance>> {
        let dir = self.root.join("instances");
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut instances = Vec::new();
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            if let Some(id) = entry.file_name().to_str() {
                if let Ok(instance) = self.load(id) {
                    instances.push(instance);
                }
            }
        }
        instances.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(instances)
    }

    /// Deep-copy one instance into a new directory. The source instance is
    /// opened read-only, so copying can never mutate it.
    pub fn copy_instance(&self, source_id: &str, new_name: &str) -> CoreResult<Instance> {
        let source = self.load(source_id)?;
        copy_instance_data(
            &source,
            &self.root.join("instances"),
            &Uuid::new_v4().simple().to_string(),
            new_name
        )
    }

    pub fn save_template(&self, instance_id: &str, template_id: &str) -> CoreResult<InstanceTemplate> {
        let instance = self.load(instance_id)?;
        save_template_for(&instance, &self.root.join("templates"), template_id)
    }

    /// Batch toggle for a checkbox UI. Renames are applied in a single pass;
    /// a conflicting target causes the whole batch to fail before any change.
    pub fn set_mods_enabled(
        &self,
        instance_id: &str,
        changes: &[ModEnableChange],
    ) -> CoreResult<crate::mod_scanner::ModScanReport> {
        let instance = self.load(instance_id)?;
        set_mods_enabled_for(&instance, changes)
    }

    /// Apply non-destructive metadata only. Mod copying is intentionally left
    /// to the instance-creation flow so a template cannot alter an existing
    /// instance's mods unexpectedly.
    pub fn apply_template_metadata(
        &self,
        instance_id: &str,
        template: &InstanceTemplate,
    ) -> CoreResult<Instance> {
        let mut instance = self.load(instance_id)?;
        instance.jvm_args = template.jvm_args.clone();
        instance.memory_mb = template.memory_mb;
        instance.width = template.width;
        instance.height = template.height;
        write_instance(&instance)?;
        Ok(instance)
    }

    pub fn export_mod_list(&self, instance_id: &str) -> CoreResult<ModListExport> {
        let instance = self.load(instance_id)?;
        export_mod_list_for(&instance)
    }
}

/// Copy an instance tree into a fresh directory without mutating the source.
/// The destination id must be a safe single path segment.
pub fn copy_instance_data(
    source: &Instance,
    instances_root: &Path,
    new_id: &str,
    new_name: &str,
) -> CoreResult<Instance> {
    let cleaned_id = new_id.trim();
    if cleaned_id.is_empty()
        || cleaned_id.contains('/')
        || cleaned_id.contains('\\')
        || cleaned_id == "."
        || cleaned_id == ".."
    {
        return Err(CoreError::InvalidInput("invalid instance id".into()));
    }
    let new_root = instances_root.join(cleaned_id);
    if new_root.exists() {
        return Err(CoreError::Conflict(new_root.display().to_string()));
    }
    std::fs::create_dir_all(&new_root)?;
    if source.root.exists() {
        for entry in WalkDir::new(&source.root).into_iter().filter_map(Result::ok) {
            let relative = match entry.path().strip_prefix(&source.root) {
                Ok(relative) => relative,
                Err(_) => continue,
            };
            if relative
                .components()
                .any(|component| component.as_os_str() == ".fangjie")
            {
                continue;
            }
            let destination = new_root.join(relative);
            if entry.file_type().is_dir() {
                std::fs::create_dir_all(&destination)?;
            } else if entry.file_type().is_file() {
                if let Some(parent) = destination.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::copy(entry.path(), destination)?;
            }
        }
    }
    let game_relative = source
        .game_dir
        .strip_prefix(&source.root)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| PathBuf::from(".minecraft"));
    let mut copy = source.clone();
    copy.id = cleaned_id.to_string();
    copy.name = if new_name.trim().is_empty() {
        format!("{} 副本", source.name)
    } else {
        new_name.trim().to_string()
    };
    copy.root = new_root.clone();
    copy.game_dir = new_root.join(game_relative);
    if !copy.game_dir.exists() {
        copy_dir_contents(&source.game_dir, &copy.game_dir)?;
    }
    write_instance(&copy)?;
    Ok(copy)
}

pub fn save_template_for(
    instance: &Instance,
    templates_root: &Path,
    template_id: &str,
) -> CoreResult<InstanceTemplate> {
    let template_id = template_id.trim();
    if template_id.is_empty() || template_id.contains('/') || template_id.contains('\\') {
        return Err(CoreError::InvalidInput("invalid template id".into()));
    }
    let mods = ModScanner::scan(instance)?
        .mods
        .into_iter()
        .filter(|item| item.enabled)
        .map(|item| item.file_name)
        .collect();
    let template = InstanceTemplate {
        id: template_id.to_string(),
        name: format!("{} 模板", instance.name),
        jvm_args: instance.jvm_args.clone(),
        memory_mb: instance.memory_mb,
        width: instance.width,
        height: instance.height,
        mod_files: mods,
        loader: instance.loader,
        game_version: instance.game_version.clone(),
        created_at_unix: now_unix(),
    };
    std::fs::create_dir_all(templates_root)?;
    std::fs::write(
        templates_root.join(format!("{template_id}.json")),
        serde_json::to_string_pretty(&template)?,
    )?;
    Ok(template)
}

pub fn set_mods_enabled_for(
    instance: &Instance,
    changes: &[ModEnableChange],
) -> CoreResult<crate::mod_scanner::ModScanReport> {
    let mut planned = Vec::new();
    for change in changes {
        let current = instance.path_inside_game(Path::new("mods").join(&change.file_name).as_path())?;
        if change.enabled {
            if change.file_name.ends_with(".jar") {
                continue;
            }
            if !change.file_name.ends_with(".jar.disabled") {
                return Err(CoreError::InvalidInput(format!(
                    "not a mod jar: {}",
                    change.file_name
                )));
            }
            let target = current.with_file_name(
                change.file_name.trim_end_matches(".disabled").to_string(),
            );
            if target.exists() {
                return Err(CoreError::Conflict(target.display().to_string()));
            }
            planned.push((current, target));
        } else {
            if !change.file_name.ends_with(".jar") {
                continue;
            }
            let target = current.with_file_name(format!("{}.disabled", change.file_name));
            if target.exists() {
                return Err(CoreError::Conflict(target.display().to_string()));
            }
            planned.push((current, target));
        }
    }
    for (from, to) in planned {
        if !from.exists() {
            return Err(CoreError::NotFound(from.display().to_string()));
        }
        std::fs::rename(from, to)?;
    }
    ModScanner::scan(instance)
}

pub fn export_mod_list_for(instance: &Instance) -> CoreResult<ModListExport> {
    let scan = ModScanner::scan(instance)?;
    Ok(ModListExport {
        instance_id: instance.id.clone(),
        game_version: instance.game_version.clone(),
        loader: instance.loader.as_str().to_string(),
        mods: scan
            .mods
            .into_iter()
            .filter(|item| item.enabled)
            .map(exported_mod)
            .collect(),
    })
}

fn exported_mod(item: ScannedMod) -> ExportedMod {
    ExportedMod {
        file_name: item.file_name,
        mod_id: item.mod_id,
        name: item.name,
        version: item.version,
        sha1: item.sha1,
    }
}

fn copy_dir_contents(source: &Path, destination: &Path) -> CoreResult<()> {
    if !source.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(destination)?;
    for entry in WalkDir::new(source).into_iter().filter_map(Result::ok) {
        let relative = match entry.path().strip_prefix(source) {
            Ok(relative) => relative,
            Err(_) => continue,
        };
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}
