use std::collections::{BTreeMap, BTreeSet};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use zip::ZipArchive;

use crate::error::{CoreError, CoreResult};
use crate::model::{Instance, ModDependency};

const BUILTIN_DEPENDENCIES: &[&str] = &[
    "minecraft",
    "java",
    "fabricloader",
    "fabric_loader",
    "forge",
    "neoforge",
    "quilt_loader",
    "fml",
    "javafml",
    "lowcodefml",
    "mixinextras",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedMod {
    pub file_name: String,
    pub enabled: bool,
    pub mod_id: String,
    pub name: String,
    pub version: Option<String>,
    pub loader: Option<String>,
    pub manifest_title: Option<String>,
    pub dependencies: Vec<ModDependency>,
    pub provides: Vec<String>,
    pub sha1: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingDependency {
    pub mod_file: String,
    pub mod_id: String,
    pub dependency_id: String,
    pub requirement: Option<String>,
    pub mandatory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateMods {
    pub mod_id: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModConflict {
    pub code: String,
    pub title: String,
    pub mods: Vec<String>,
    pub severity: ConflictSeverity,
    pub suggestion: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConflictSeverity {
    Warning,
    Error,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModScanReport {
    pub mods: Vec<ScannedMod>,
    pub missing_dependencies: Vec<MissingDependency>,
    pub duplicates: Vec<DuplicateMods>,
    pub conflicts: Vec<ModConflict>,
    pub warnings: Vec<String>,
}

impl ModScanReport {
    pub fn active_mod_ids(&self) -> BTreeSet<String> {
        self.mods
            .iter()
            .filter(|item| item.enabled)
            .flat_map(|item| {
                std::iter::once(item.mod_id.clone()).chain(item.provides.iter().cloned())
            })
            .collect()
    }

    pub fn mandatory_missing(&self) -> impl Iterator<Item = &MissingDependency> {
        self.missing_dependencies.iter().filter(|dep| dep.mandatory)
    }
}

#[derive(Debug, Default)]
struct JarMetadata {
    id: Option<String>,
    name: Option<String>,
    version: Option<String>,
    loader: Option<String>,
    manifest_title: Option<String>,
    dependencies: Vec<ModDependency>,
    provides: Vec<String>,
}

pub struct ModScanner;

impl ModScanner {
    pub fn scan(instance: &Instance) -> CoreResult<ModScanReport> {
        let mods_dir = instance.mods_dir();
        if !mods_dir.exists() {
            return Ok(ModScanReport::default());
        }
        let mut report = ModScanReport::default();
        for entry in std::fs::read_dir(&mods_dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string();
            if !file_name.ends_with(".jar") && !file_name.ends_with(".jar.disabled") {
                continue;
            }
            let enabled = file_name.ends_with(".jar");
            let sha1 = sha1_file(&path)?;
            let metadata = match read_jar_metadata(&path) {
                Ok(metadata) => metadata,
                Err(error) => {
                    report
                        .warnings
                        .push(format!("{file_name}: 无法读取模组元数据: {error}"));
                    JarMetadata::default()
                }
            };
            let fallback_id = file_name
                .trim_end_matches(".disabled")
                .trim_end_matches(".jar")
                .to_string();
            report.mods.push(ScannedMod {
                file_name,
                enabled,
                mod_id: metadata.id.unwrap_or(fallback_id),
                name: metadata.name.unwrap_or_else(|| "未知模组".to_string()),
                version: metadata.version,
                loader: metadata.loader,
                manifest_title: metadata.manifest_title,
                dependencies: metadata.dependencies,
                provides: metadata.provides,
                sha1,
            });
        }
        report.mods.sort_by(|a, b| a.file_name.cmp(&b.file_name));
        detect_duplicates(&mut report);
        detect_missing(&mut report);
        detect_conflicts(&mut report);
        Ok(report)
    }
}

fn detect_duplicates(report: &mut ModScanReport) {
    let mut by_id: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut by_hash: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for item in report.mods.iter().filter(|item| item.enabled) {
        by_id
            .entry(item.mod_id.to_lowercase())
            .or_default()
            .push(item.file_name.clone());
        by_hash
            .entry(item.sha1.clone())
            .or_default()
            .push(item.file_name.clone());
    }
    for (mod_id, files) in by_id {
        if files.len() > 1 {
            report.duplicates.push(DuplicateMods {
                mod_id: mod_id.clone(),
                files: files.clone(),
            });
            report.conflicts.push(ModConflict {
                code: "duplicate_mod".into(),
                title: format!("重复模组：{mod_id}"),
                mods: files,
                severity: ConflictSeverity::Error,
                suggestion: "保留一个版本并禁用其余 JAR。".into(),
            });
        }
    }
    for files in by_hash.into_values() {
        if files.len() > 1 {
            report.warnings.push(format!(
                "以下 JAR 内容完全相同，可能被重复放入 mods：{}",
                files.join(", ")
            ));
        }
    }
}

fn detect_missing(report: &mut ModScanReport) {
    let installed = report.active_mod_ids();
    let mut seen = BTreeSet::new();
    let mut missing = Vec::new();
    for item in report.mods.iter().filter(|item| item.enabled) {
        for dep in &item.dependencies {
            let dependency = dep.id.to_lowercase();
            if BUILTIN_DEPENDENCIES.contains(&dependency.as_str())
                || installed.contains(&dependency)
            {
                continue;
            }
            let key = format!("{}:{}", item.file_name, dependency);
            if !seen.insert(key) {
                continue;
            }
            missing.push(MissingDependency {
                mod_file: item.file_name.clone(),
                mod_id: item.mod_id.clone(),
                dependency_id: dep.id.clone(),
                requirement: dep.requirement.clone(),
                mandatory: dep.mandatory,
            });
        }
    }
    report.missing_dependencies = missing;
}

fn detect_conflicts(report: &mut ModScanReport) {
    let active: Vec<&ScannedMod> = report.mods.iter().filter(|item| item.enabled).collect();
    let has = |id: &str| {
        active
            .iter()
            .any(|item| item.mod_id.eq_ignore_ascii_case(id) || item.provides.iter().any(|p| p.eq_ignore_ascii_case(id)))
    };
    let files_for = |id: &str| {
        active
            .iter()
            .filter(|item| item.mod_id.eq_ignore_ascii_case(id))
            .map(|item| item.file_name.clone())
            .collect::<Vec<_>>()
    };

    if has("optifine") && (has("sodium") || has("iris") || has("embeddium") || has("rubidium")) {
        let mut mods = files_for("optifine");
        for candidate in ["sodium", "iris", "embeddium", "rubidium"] {
            mods.extend(files_for(candidate));
        }
        report.conflicts.push(ModConflict {
            code: "optifine_render_conflict".into(),
            title: "OptiFine 与 Sodium/Iris 渲染冲突".into(),
            mods,
            severity: ConflictSeverity::Error,
            suggestion: "保留 OptiFine，或禁用 OptiFine 并使用 Sodium + Iris。".into(),
        });
    }

    if has("sodium") && has("embeddium") {
        let mut mods = files_for("sodium");
        mods.extend(files_for("embeddium"));
        report.conflicts.push(ModConflict {
            code: "renderer_overlap".into(),
            title: "Sodium 与 Embeddium 功能重叠".into(),
            mods,
            severity: ConflictSeverity::Error,
            suggestion: "只保留一个渲染优化模组。".into(),
        });
    }

    let loaders: BTreeSet<String> = active
        .iter()
        .filter_map(|item| item.loader.clone())
        .map(|loader| loader.to_lowercase())
        .collect();
    if loaders.contains("fabric") && loaders.contains("forge") {
        report.conflicts.push(ModConflict {
            code: "mixed_loader_jars".into(),
            title: "Fabric 与 Forge 模组混放".into(),
            mods: active
                .iter()
                .filter(|item| {
                    item.loader
                        .as_deref()
                        .is_some_and(|loader| loader.eq_ignore_ascii_case("fabric") || loader.eq_ignore_ascii_case("forge"))
                })
                .map(|item| item.file_name.clone())
                .collect(),
            severity: ConflictSeverity::Error,
            suggestion: "按实例加载器保留对应版本，禁用另一加载器的 JAR。".into(),
        });
    }
}

fn read_jar_metadata(path: &Path) -> CoreResult<JarMetadata> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut metadata = JarMetadata::default();
    if let Some(manifest) = read_entry(&mut archive, "META-INF/MANIFEST.MF")? {
        metadata.manifest_title = manifest_value(&manifest, "Implementation-Title");
    }
    if let Some(raw) = read_entry(&mut archive, "fabric.mod.json")? {
        let value: serde_json::Value = serde_json::from_str(&raw)?;
        metadata.id = value.get("id").and_then(|v| v.as_str()).map(str::to_string);
        metadata.name = value.get("name").and_then(|v| v.as_str()).map(str::to_string);
        metadata.version = value.get("version").and_then(|v| v.as_str()).map(str::to_string);
        metadata.loader = Some("fabric".into());
        metadata.dependencies = parse_dependency_object(value.get("depends"));
        metadata.provides = parse_string_or_array(value.get("provides"));
        return Ok(metadata);
    }
    if let Some(raw) = read_entry(&mut archive, "quilt.mod.json")? {
        let value: serde_json::Value = serde_json::from_str(&raw)?;
        let loader = value.get("quilt_loader").unwrap_or(&value);
        metadata.id = loader.get("id").and_then(|v| v.as_str()).map(str::to_string);
        metadata.name = loader
            .get("metadata")
            .and_then(|m| m.get("name"))
            .and_then(|v| v.as_str())
            .map(str::to_string);
        metadata.version = loader
            .get("version")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        metadata.loader = Some("quilt".into());
        metadata.dependencies = parse_quilt_dependencies(loader.get("depends"));
        return Ok(metadata);
    }
    for candidate in ["META-INF/neoforge.mods.toml", "META-INF/mods.toml"] {
        if let Some(raw) = read_entry(&mut archive, candidate)? {
            let value: toml::Value = toml::from_str(&raw)?;
            metadata.loader = Some(if candidate.contains("neoforge") {
                "neoforge".into()
            } else {
                "forge".into()
            });
            if let Some(mods) = value.get("mods").and_then(|v| v.as_array()) {
                if let Some(first) = mods.first() {
                    metadata.id = first.get("modId").and_then(|v| v.as_str()).map(str::to_string);
                    metadata.name = first
                        .get("displayName")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    metadata.version = first.get("version").and_then(|v| v.as_str()).map(str::to_string);
                }
            }
            metadata.dependencies = parse_forge_dependencies(value.get("dependencies"));
            return Ok(metadata);
        }
    }
    if let Some(raw) = read_entry(&mut archive, "mcmod.info")? {
        let value: serde_json::Value = serde_json::from_str(&raw)?;
        let first = value
            .as_array()
            .and_then(|items| items.first())
            .or_else(|| value.get("modList")?.as_array()?.first());
        if let Some(first) = first {
            metadata.id = first
                .get("modid")
                .or_else(|| first.get("modId"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            metadata.name = first.get("name").and_then(|v| v.as_str()).map(str::to_string);
            metadata.version = first.get("version").and_then(|v| v.as_str()).map(str::to_string);
            metadata.loader = Some("forge".into());
            metadata.dependencies = first
                .get("requiredMods")
                .and_then(|v| v.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|v| v.as_str())
                        .map(|id| ModDependency {
                            id: id.to_string(),
                            requirement: None,
                            mandatory: true,
                        })
                        .collect()
                })
                .unwrap_or_default();
        }
        return Ok(metadata);
    }
    Ok(metadata)
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str) -> CoreResult<Option<String>> {
    let Ok(mut entry) = archive.by_name(name) else {
        return Ok(None);
    };
    let mut raw = String::new();
    entry.read_to_string(&mut raw)?;
    Ok(Some(raw))
}

fn manifest_value(raw: &str, key: &str) -> Option<String> {
    raw.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case(key)
            .then(|| value.trim().to_string())
    })
}

fn parse_dependency_object(value: Option<&serde_json::Value>) -> Vec<ModDependency> {
    let Some(object) = value.and_then(|value| value.as_object()) else {
        return Vec::new();
    };
    object
        .iter()
        .map(|(id, requirement)| ModDependency {
            id: id.clone(),
            requirement: requirement.as_str().map(str::to_string),
            mandatory: true,
        })
        .collect()
}

fn parse_quilt_dependencies(value: Option<&serde_json::Value>) -> Vec<ModDependency> {
    let Some(array) = value.and_then(|value| value.as_array()) else {
        return Vec::new();
    };
    array
        .iter()
        .filter_map(|entry| {
            let id = entry.get("id")?.as_str()?.to_string();
            let requirement = entry.get("versions").and_then(|v| {
                v.as_str()
                    .map(str::to_string)
                    .or_else(|| v.as_array().and_then(|a| a.first()).and_then(|x| x.as_str()).map(str::to_string))
            });
            let optional = entry
                .get("optional")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            Some(ModDependency {
                id,
                requirement,
                mandatory: !optional,
            })
        })
        .collect()
}

fn parse_forge_dependencies(value: Option<&toml::Value>) -> Vec<ModDependency> {
    let Some(table) = value.and_then(|value| value.as_table()) else {
        return Vec::new();
    };
    let mut dependencies = Vec::new();
    for entries in table.values() {
        let Some(entries) = entries.as_array() else {
            continue;
        };
        for entry in entries {
            let id = entry
                .get("modId")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            if id.is_empty() {
                continue;
            }
            dependencies.push(ModDependency {
                id,
                requirement: entry
                    .get("versionRange")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                mandatory: entry
                    .get("mandatory")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(true),
            });
        }
    }
    dependencies
}

fn parse_string_or_array(value: Option<&serde_json::Value>) -> Vec<String> {
    match value {
        Some(serde_json::Value::String(value)) => vec![value.clone()],
        Some(serde_json::Value::Array(values)) => values
            .iter()
            .filter_map(|value| value.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

fn sha1_file(path: &Path) -> CoreResult<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha1::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn jar_path(instance: &Instance, file_name: &str) -> CoreResult<PathBuf> {
    instance.path_inside_game(Path::new("mods").join(file_name).as_path())
}

pub fn ensure_jar_file(instance: &Instance, file_name: &str) -> CoreResult<PathBuf> {
    let path = jar_path(instance, file_name)?;
    if !path.exists() {
        return Err(CoreError::NotFound(path.display().to_string()));
    }
    Ok(path)
}
