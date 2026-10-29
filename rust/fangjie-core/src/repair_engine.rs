use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::crash_diagnosis::{ActionKind, CrashDiagnosisReport};
use crate::download_source::{ResolvedMod, SourceRegistry};
use crate::error::{CoreError, CoreResult};
use crate::model::{write_instance, Instance};
use crate::mod_scanner::{jar_path, ModScanReport};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffKind {
    Create,
    Modify,
    Rename,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffEntry {
    pub path: String,
    pub kind: DiffKind,
    pub before: Option<String>,
    pub after: Option<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RepairAction {
    DownloadMod {
        dependency_id: String,
        source_id: String,
        resolved: ResolvedMod,
        target_file: String,
    },
    DisableMod {
        file_name: String,
        reason: String,
    },
    SetJavaPath {
        path: String,
    },
    SetMemory {
        memory_mb: u32,
    },
    ResetConfig {
        relative_path: String,
        replacement: Option<String>,
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairPlan {
    pub id: String,
    pub instance_id: String,
    pub instance: Instance,
    pub actions: Vec<RepairAction>,
    pub diff: Vec<DiffEntry>,
    pub warnings: Vec<String>,
    pub created_at_unix: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RepairOptions {
    pub java_path: Option<PathBuf>,
    pub memory_mb: Option<u32>,
    /// Relative to the instance game directory, e.g. `options.txt`.
    pub config_relative: Option<String>,
    pub config_replacement: Option<String>,
    pub source_id: Option<String>,
    pub disable_conflicts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChangeRecord {
    Created {
        path: PathBuf,
    },
    Modified {
        path: PathBuf,
        backup: PathBuf,
    },
    Renamed {
        original: PathBuf,
        disabled: PathBuf,
        backup: PathBuf,
    },
    Reset {
        path: PathBuf,
        backup: PathBuf,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairReceipt {
    pub repair_id: String,
    pub plan_id: String,
    pub instance_id: String,
    pub backup_dir: PathBuf,
    pub changes: Vec<ChangeRecord>,
    pub created_at_unix: u64,
}

pub struct RepairEngine {
    plans: Mutex<HashMap<String, RepairPlan>>,
    receipts: Mutex<HashMap<String, RepairReceipt>>,
}

impl Default for RepairEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl RepairEngine {
    pub fn new() -> Self {
        Self {
            plans: Mutex::new(HashMap::new()),
            receipts: Mutex::new(HashMap::new()),
        }
    }

    pub fn preview(
        &self,
        instance: &Instance,
        diagnosis: &CrashDiagnosisReport,
        scan: &ModScanReport,
        options: &RepairOptions,
        sources: &SourceRegistry,
    ) -> CoreResult<RepairPlan> {
        let mut actions = Vec::new();
        let mut diff = Vec::new();
        let mut warnings = Vec::new();
        let mut disabled = HashSet::new();

        if diagnosis
            .diagnoses
            .iter()
            .any(|item| item.suggested_actions.iter().any(|action| action.kind == ActionKind::ResolveMissingDependencies))
            || !scan.missing_dependencies.is_empty()
        {
            for dependency in scan.mandatory_missing() {
                let resolved = match sources.resolve_dependency(
                    options.source_id.as_deref(),
                    &dependency.dependency_id,
                    &instance.game_version,
                    instance.loader,
                ) {
                    Ok(resolved) => resolved,
                    Err(error) => {
                        warnings.push(format!(
                            "无法解析前置 {}（{}）：{error}",
                            dependency.dependency_id, dependency.mod_file
                        ));
                        continue;
                    }
                };
                let target = instance.mods_dir().join(&resolved.file_name);
                if target.exists() {
                    warnings.push(format!(
                        "前置 {} 的目标文件 {} 已存在，跳过下载",
                        dependency.dependency_id, resolved.file_name
                    ));
                    continue;
                }
                diff.push(DiffEntry {
                    path: format!("mods/{}", resolved.file_name),
                    kind: DiffKind::Create,
                    before: None,
                    after: Some(format!("下载 {}（{}）", resolved.name, resolved.download_url)),
                    summary: format!("补齐缺失前置 {}", dependency.dependency_id),
                });
                actions.push(RepairAction::DownloadMod {
                    dependency_id: dependency.dependency_id.clone(),
                    source_id: options.source_id.clone().unwrap_or_else(|| "modrinth".into()),
                    resolved,
                    target_file: target
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default()
                        .to_string(),
                });
            }
        }

        if options.disable_conflicts {
            for conflict in &scan.conflicts {
                for file_name in conflict_disable_files(conflict, instance, scan) {
                    if !disabled.insert(file_name.clone()) {
                        continue;
                    }
                    if jar_path(instance, &file_name).is_err() {
                        continue;
                    }
                    diff.push(DiffEntry {
                        path: format!("mods/{file_name}"),
                        kind: DiffKind::Rename,
                        before: Some("enabled".into()),
                        after: Some(format!("{file_name}.disabled")),
                        summary: format!("{}：{}", conflict.code, conflict.suggestion),
                    });
                    actions.push(RepairAction::DisableMod {
                        file_name,
                        reason: conflict.suggestion.clone(),
                    });
                }
            }
        } else if !scan.conflicts.is_empty() {
            warnings.push("扫描发现冲突，但修复选项中未启用自动禁用。".into());
        }

        if let Some(path) = &options.java_path {
            let before = instance
                .java_path
                .as_ref()
                .map(|path| path.display().to_string());
            diff.push(DiffEntry {
                path: "instance.json".into(),
                kind: DiffKind::Modify,
                before,
                after: Some(path.display().to_string()),
                summary: "修正实例 Java 路径".into(),
            });
            actions.push(RepairAction::SetJavaPath {
                path: path.display().to_string(),
            });
        }

        if let Some(memory) = options.memory_mb {
            diff.push(DiffEntry {
                path: "instance.json".into(),
                kind: DiffKind::Modify,
                before: Some(instance.memory_mb.to_string()),
                after: Some(memory.to_string()),
                summary: "调整最大堆内存".into(),
            });
            actions.push(RepairAction::SetMemory { memory_mb: memory });
        }

        if diagnosis
            .diagnoses
            .iter()
            .any(|item| item.code == "config_corruption")
        {
            match &options.config_relative {
                Some(relative) => {
                    let target = instance.path_inside_game(Path::new(relative))?;
                    if !target.exists() {
                        warnings.push(format!("配置文件 {relative} 不存在，跳过重置"));
                    } else {
                        let before = std::fs::read_to_string(&target)
                            .ok()
                            .map(|text| text.chars().take(2000).collect());
                        diff.push(DiffEntry {
                            path: relative.clone(),
                            kind: DiffKind::Modify,
                            before,
                            after: Some(
                                options
                                    .config_replacement
                                    .clone()
                                    .unwrap_or_else(|| "（恢复默认内容）".into()),
                            ),
                            summary: "备份并重置损坏配置".into(),
                        });
                        actions.push(RepairAction::ResetConfig {
                            relative_path: relative.clone(),
                            replacement: options.config_replacement.clone(),
                            reason: "配置解析失败".into(),
                        });
                    }
                }
                None => warnings.push(
                    "检测到配置损坏，但未指定要重置的配置相对路径；请在预览选项中提供 config_relative。"
                        .into(),
                ),
            }
        }

        if actions.is_empty() {
            warnings.push("没有可自动执行的修复动作；请查看诊断建议。".into());
        }

        let plan = RepairPlan {
            id: Uuid::new_v4().to_string(),
            instance_id: instance.id.clone(),
            instance: instance.clone(),
            actions,
            diff,
            warnings,
            created_at_unix: now_unix(),
        };
        self.plans
            .lock()
            .expect("repair plans poisoned")
            .insert(plan.id.clone(), plan.clone());
        Ok(plan)
    }

    pub fn get_plan(&self, plan_id: &str) -> Option<RepairPlan> {
        self.plans
            .lock()
            .expect("repair plans poisoned")
            .get(plan_id)
            .cloned()
    }

    pub fn apply(
        &self,
        plan_id: &str,
        confirmed: bool,
        sources: &SourceRegistry,
    ) -> CoreResult<RepairReceipt> {
        if !confirmed {
            return Err(CoreError::ConfirmationRequired);
        }
        let plan = self
            .plans
            .lock()
            .expect("repair plans poisoned")
            .get(plan_id)
            .cloned()
            .ok_or_else(|| CoreError::PlanNotFound(plan_id.to_string()))?;
        let repair_id = Uuid::new_v4().to_string();
        let backup_dir = plan
            .instance
            .root
            .join(".fangjie")
            .join("backups")
            .join(&repair_id);
        std::fs::create_dir_all(&backup_dir)?;

        let mut receipt = RepairReceipt {
            repair_id: repair_id.clone(),
            plan_id: plan_id.to_string(),
            instance_id: plan.instance_id.clone(),
            backup_dir: backup_dir.clone(),
            changes: Vec::new(),
            created_at_unix: now_unix(),
        };

        let mut working_instance = plan.instance.clone();
        let mut manifest_backup: Option<PathBuf> = None;
        let mut manifest_modified = false;

        let result = (|| -> CoreResult<()> {
            for action in &plan.actions {
                match action {
                    RepairAction::DownloadMod {
                        source_id,
                        resolved,
                        target_file,
                        ..
                    } => {
                        let target = plan
                            .instance
                            .path_inside_game(Path::new("mods").join(target_file).as_path())?;
                        if target.exists() {
                            return Err(CoreError::Conflict(format!(
                                "target already exists: {}",
                                target.display()
                            )));
                        }
                        if let Some(parent) = target.parent() {
                            std::fs::create_dir_all(parent)?;
                        }
                        sources.download(Some(source_id), resolved, &target)?;
                        receipt.changes.push(ChangeRecord::Created { path: target });
                    }
                    RepairAction::DisableMod { file_name, .. } => {
                        let original = jar_path(&plan.instance, file_name)?;
                        let disabled = original.with_extension("jar.disabled");
                        if !original.exists() {
                            return Err(CoreError::NotFound(original.display().to_string()));
                        }
                        if disabled.exists() {
                            return Err(CoreError::Conflict(format!(
                                "disabled target already exists: {}",
                                disabled.display()
                            )));
                        }
                        let backup = backup_path(&backup_dir, &plan.instance.root, &original)?;
                        copy_to_backup(&original, &backup)?;
                        std::fs::rename(&original, &disabled)?;
                        receipt.changes.push(ChangeRecord::Renamed {
                            original,
                            disabled,
                            backup,
                        });
                    }
                    RepairAction::SetJavaPath { path } => {
                        let manifest = working_instance.manifest_path();
                        if manifest_backup.is_none() {
                            let backup =
                                backup_path(&backup_dir, &working_instance.root, &manifest)?;
                            copy_to_backup(&manifest, &backup)?;
                            manifest_backup = Some(backup);
                        }
                        working_instance.java_path = Some(PathBuf::from(path));
                        manifest_modified = true;
                    }
                    RepairAction::SetMemory { memory_mb } => {
                        let manifest = working_instance.manifest_path();
                        if manifest_backup.is_none() {
                            let backup =
                                backup_path(&backup_dir, &working_instance.root, &manifest)?;
                            copy_to_backup(&manifest, &backup)?;
                            manifest_backup = Some(backup);
                        }
                        working_instance.memory_mb = *memory_mb;
                        manifest_modified = true;
                    }
                    RepairAction::ResetConfig {
                        relative_path,
                        replacement,
                        ..
                    } => {
                        let target = plan.instance.path_inside_game(Path::new(relative_path))?;
                        if !target.exists() {
                            return Err(CoreError::NotFound(target.display().to_string()));
                        }
                        let backup = backup_path(&backup_dir, &plan.instance.root, &target)?;
                        copy_to_backup(&target, &backup)?;
                        std::fs::write(&target, replacement.as_deref().unwrap_or_default())?;
                        receipt.changes.push(ChangeRecord::Reset {
                            path: target,
                            backup,
                        });
                    }
                }
            }
            if manifest_modified {
                let manifest = working_instance.manifest_path();
                let backup = manifest_backup.expect("manifest modified requires a backup");
                write_instance(&working_instance)?;
                receipt.changes.push(ChangeRecord::Modified {
                    path: manifest,
                    backup,
                });
            }
            Ok(())
        })();

        if let Err(error) = result {
            let _ = self.rollback_changes(&receipt);
            return Err(error);
        }
        std::fs::write(
            backup_dir.join("receipt.json"),
            serde_json::to_string_pretty(&receipt)?,
        )?;
        self.receipts
            .lock()
            .expect("repair receipts poisoned")
            .insert(repair_id, receipt.clone());
        Ok(receipt)
    }

    pub fn rollback(&self, repair_id: &str) -> CoreResult<RepairReceipt> {
        let receipt = self
            .receipts
            .lock()
            .expect("repair receipts poisoned")
            .get(repair_id)
            .cloned()
            .ok_or_else(|| CoreError::ReceiptNotFound(repair_id.to_string()))?;
        self.rollback_changes(&receipt)?;
        self.receipts
            .lock()
            .expect("repair receipts poisoned")
            .remove(repair_id);
        Ok(receipt)
    }

    fn rollback_changes(&self, receipt: &RepairReceipt) -> CoreResult<()> {
        for change in receipt.changes.iter().rev() {
            match change {
                ChangeRecord::Created { path } => {
                    if path.exists() {
                        std::fs::remove_file(path)?;
                    }
                }
                ChangeRecord::Modified { path, backup } => {
                    copy_to_backup(backup, path)?;
                }
                ChangeRecord::Renamed {
                    original,
                    disabled,
                    backup,
                } => {
                    if disabled.exists() {
                        std::fs::rename(disabled, original)?;
                    } else {
                        copy_to_backup(backup, original)?;
                    }
                }
                ChangeRecord::Reset { path, backup } => {
                    copy_to_backup(backup, path)?;
                }
            }
        }
        Ok(())
    }
}

fn conflict_disable_files(
    conflict: &crate::mod_scanner::ModConflict,
    instance: &Instance,
    scan: &ModScanReport,
) -> Vec<String> {
    if conflict.code == "duplicate_mod" {
        return conflict.mods.iter().skip(1).cloned().collect();
    }
    if conflict.code == "mixed_loader_jars" {
        return scan
            .mods
            .iter()
            .filter(|item| item.enabled)
            .filter(|item| {
                item.loader
                    .as_deref()
                    .is_some_and(|loader| !loader.eq_ignore_ascii_case(instance.loader.as_str()))
            })
            .map(|item| item.file_name.clone())
            .collect();
    }
    if conflict.code == "optifine_render_conflict" {
        return scan
            .mods
            .iter()
            .filter(|item| item.enabled && item.mod_id.eq_ignore_ascii_case("optifine"))
            .map(|item| item.file_name.clone())
            .collect();
    }
    conflict.mods.iter().skip(1).cloned().collect()
}

fn backup_path(backup_dir: &Path, instance_root: &Path, original: &Path) -> CoreResult<PathBuf> {
    let relative = original
        .strip_prefix(instance_root)
        .map_err(|_| CoreError::UnsafePath(original.to_path_buf()))?;
    let path = backup_dir.join("files").join(relative);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(path)
}

fn copy_to_backup(source: &Path, destination: &Path) -> CoreResult<()> {
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(source, destination)?;
    Ok(())
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}
