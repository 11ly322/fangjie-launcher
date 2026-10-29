use serde::{Deserialize, Serialize};

use crate::model::Instance;
use crate::mod_scanner::{ConflictSeverity, ModScanReport};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    ResolveMissingDependencies,
    DisableConflictingMods,
    SetJavaPath,
    IncreaseMemory,
    ResetConfig,
    RepairLoader,
    ReviewResourcePacks,
    UpdateGraphicsDriver,
    ManualReview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedAction {
    pub kind: ActionKind,
    pub label: String,
    pub automatic: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub source: String,
    pub line: Option<usize>,
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnosis {
    pub code: String,
    pub title: String,
    pub severity: Severity,
    pub confidence: u8,
    pub root_cause: String,
    pub evidence: Vec<Evidence>,
    pub suggested_actions: Vec<SuggestedAction>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CrashDiagnosisReport {
    pub diagnoses: Vec<Diagnosis>,
    pub scanned_at_unix: u64,
}

impl CrashDiagnosisReport {
    pub fn primary(&self) -> Option<&Diagnosis> {
        self.diagnoses.first()
    }

    pub fn codes(&self) -> Vec<&str> {
        self.diagnoses.iter().map(|item| item.code.as_str()).collect()
    }
}

struct Rule {
    code: &'static str,
    title: &'static str,
    patterns: &'static [&'static str],
    root_cause: &'static str,
    severity: Severity,
    actions: &'static [(ActionKind, &'static str, bool)],
}

/// The first eight rules are the requested common crash classes. The last two
/// are low-cost additions that are common in modded instances.
const RULES: &[Rule] = &[
    Rule {
        code: "missing_dependency",
        title: "缺失前置模组",
        patterns: &[
            r"(?i)Missing or unsupported mandatory dependencies",
            r"(?i)requires (?:any version of )?[A-Za-z0-9_.-]+",
            r"(?i)NoClassDefFoundError",
            r"(?i)ClassNotFoundException",
            r"(?i)模组.*(?:前置|依赖).*(?:缺失|未安装)",
        ],
        root_cause: "某个模组的必需前置没有安装，或前置版本不满足要求。",
        severity: Severity::Critical,
        actions: &[(
            ActionKind::ResolveMissingDependencies,
            "扫描缺失前置并下载安装",
            true,
        )],
    },
    Rule {
        code: "duplicate_mods",
        title: "重复的模组",
        patterns: &[
            r"(?i)Duplicate mods found",
            r"(?i)duplicate mod id",
            r"(?i)found duplicate mod",
            r"(?i)重复.*模组",
        ],
        root_cause: "mods 目录中存在同一个 mod id 的多个 JAR，加载器无法决定使用哪个。",
        severity: Severity::Error,
        actions: &[(
            ActionKind::DisableConflictingMods,
            "保留一个版本并禁用其余副本",
            true,
        )],
    },
    Rule {
        code: "optifine_render_conflict",
        title: "OptiFine 与 Sodium/Iris 冲突",
        patterns: &[
            r"(?i)OptiFine.*(?:Sodium|Iris|Embeddium)",
            r"(?i)(?:Sodium|Iris|Embeddium).*OptiFine",
            r"(?i)optifine.*(?:sodium|iris)",
        ],
        root_cause: "OptiFine 与 Sodium/Iris 同时修改渲染管线，类和方法实现互斥。",
        severity: Severity::Error,
        actions: &[(
            ActionKind::DisableConflictingMods,
            "禁用 OptiFine，或禁用 Sodium/Iris",
            true,
        )],
    },
    Rule {
        code: "java_version_mismatch",
        title: "Java 版本不匹配",
        patterns: &[
            r"(?i)UnsupportedClassVersionError",
            r"(?i)class file version",
            r"(?i)requires Java\s*(?:17|21|22|23|24|25)",
            r"(?i)Java version.*(?:incompatible|not supported)",
            r"(?i)java\.lang\.UnsupportedClassVersionError",
        ],
        root_cause: "实例配置的 Java 版本低于模组或游戏版本要求。",
        severity: Severity::Critical,
        actions: &[(
            ActionKind::SetJavaPath,
            "切换到匹配的 Java 运行时",
            false,
        )],
    },
    Rule {
        code: "out_of_memory",
        title: "内存不足",
        patterns: &[
            r"(?i)java\.lang\.OutOfMemoryError",
            r"(?i)Java heap space",
            r"(?i)Direct buffer memory",
            r"(?i)GC overhead limit exceeded",
        ],
        root_cause: "分配的最大堆内存不足，或模组/资源包占用超过当前内存上限。",
        severity: Severity::Critical,
        actions: &[(
            ActionKind::IncreaseMemory,
            "提高实例内存并重试",
            true,
        )],
    },
    Rule {
        code: "loader_version_mismatch",
        title: "模组加载器版本不兼容",
        patterns: &[
            r"(?i)Incompatible mod set",
            r"(?i)fabricloader.*requires",
            r"(?i)neoforge.*requires",
            r"(?i)Mod file .* is for Minecraft",
            r"(?i)requires version .* of (?:forge|neoforge|fabric)",
            r"(?i)ModResolutionException",
        ],
        root_cause: "加载器、Minecraft 版本和模组声明的版本范围不一致。",
        severity: Severity::Error,
        actions: &[(
            ActionKind::RepairLoader,
            "检查并调整加载器或模组版本",
            false,
        )],
    },
    Rule {
        code: "config_corruption",
        title: "配置文件损坏",
        patterns: &[
            r"(?i)JsonParseException",
            r"(?i)MalformedJsonException",
            r"(?i)TOML parse error",
            r"(?i)Could not parse (?:config|configuration)",
            r"(?i)Invalid config",
            r"(?i)配置文件.*(?:损坏|解析失败)",
        ],
        root_cause: "实例配置文件包含无效 JSON/TOML，或写入中断导致内容不完整。",
        severity: Severity::Warning,
        actions: &[(
            ActionKind::ResetConfig,
            "备份并重置损坏的配置文件",
            true,
        )],
    },
    Rule {
        code: "resource_pack_missing",
        title: "资源包/数据包依赖缺失",
        patterns: &[
            r"(?i)Missing data pack",
            r"(?i)Failed to load (?:pack|resource pack)",
            r"(?i)pack\.mcmeta",
            r"(?i)Unknown recipe",
            r"(?i)Missing texture",
            r"(?i)资源包.*(?:缺失|加载失败)",
        ],
        root_cause: "资源包/数据包缺少 pack.mcmeta、依赖包，或与当前游戏版本不兼容。",
        severity: Severity::Warning,
        actions: &[(
            ActionKind::ReviewResourcePacks,
            "检查资源包/数据包完整性",
            false,
        )],
    },
    Rule {
        code: "mixin_apply_failure",
        title: "Mixin 注入失败",
        patterns: &[
            r"(?i)Mixin apply failed",
            r"(?i)MixinTransformerError",
            r"(?i)InvalidInjectionException",
            r"(?i)Mixin.*(?:failed|error)",
        ],
        root_cause: "模组 Mixin 与当前游戏/其他模组版本不匹配。",
        severity: Severity::Error,
        actions: &[(
            ActionKind::DisableConflictingMods,
            "禁用最近安装或冲突的模组",
            false,
        )],
    },
    Rule {
        code: "graphics_driver",
        title: "图形驱动/OpenGL 问题",
        patterns: &[
            r"(?i)GLFW error",
            r"(?i)Pixel format not accelerated",
            r"(?i)OpenGL.*(?:error|unsupported)",
            r"(?i)Failed to create (?:window|context)",
        ],
        root_cause: "显卡驱动、OpenGL 版本或窗口创建失败，不一定是模组问题。",
        severity: Severity::Warning,
        actions: &[(
            ActionKind::UpdateGraphicsDriver,
            "更新显卡驱动或切换渲染器",
            false,
        )],
    },
];

pub fn diagnose(
    log_text: &str,
    crash_report: Option<&str>,
    scan: Option<&ModScanReport>,
) -> CrashDiagnosisReport {
    let mut diagnoses = Vec::new();
    let combined = format!(
        "{}\n{}",
        log_text,
        crash_report.unwrap_or_default()
    );
    for rule in RULES {
        let mut evidence = Vec::new();
        for pattern in rule.patterns {
            let Ok(regex) = regex::Regex::new(pattern) else {
                continue;
            };
            for (index, line) in combined.lines().enumerate() {
                if regex.is_match(line) {
                    evidence.push(Evidence {
                        source: if index < log_text.lines().count() {
                            "latest.log".into()
                        } else {
                            "crash-report".into()
                        },
                        line: Some(index + 1),
                        excerpt: line.trim().chars().take(320).collect(),
                    });
                    if evidence.len() >= 3 {
                        break;
                    }
                }
            }
            if evidence.len() >= 3 {
                break;
            }
        }
        if !evidence.is_empty() {
            diagnoses.push(Diagnosis {
                code: rule.code.into(),
                title: rule.title.into(),
                severity: rule.severity,
                confidence: 90,
                root_cause: rule.root_cause.into(),
                evidence,
                suggested_actions: rule
                    .actions
                    .iter()
                    .map(|(kind, label, automatic)| SuggestedAction {
                        kind: *kind,
                        label: (*label).into(),
                        automatic: *automatic,
                    })
                    .collect(),
            });
        }
    }

    if let Some(scan) = scan {
        add_scan_diagnoses(&mut diagnoses, scan);
    }
    diagnoses.sort_by(|a, b| {
        severity_rank(b.severity)
            .cmp(&severity_rank(a.severity))
            .then_with(|| b.confidence.cmp(&a.confidence))
    });
    diagnoses.dedup_by(|a, b| a.code == b.code);
    CrashDiagnosisReport {
        diagnoses,
        scanned_at_unix: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default(),
    }
}

fn add_scan_diagnoses(diagnoses: &mut Vec<Diagnosis>, scan: &ModScanReport) {
    if !scan.duplicates.is_empty() {
        diagnoses.push(Diagnosis {
            code: "duplicate_mods".into(),
            title: "重复的模组".into(),
            severity: Severity::Error,
            confidence: 98,
            root_cause: "mods 目录中存在重复 mod id。".into(),
            evidence: scan
                .duplicates
                .iter()
                .map(|item| Evidence {
                    source: "mod_scan".into(),
                    line: None,
                    excerpt: format!("{}: {}", item.mod_id, item.files.join(", ")),
                })
                .collect(),
            suggested_actions: vec![SuggestedAction {
                kind: ActionKind::DisableConflictingMods,
                label: "禁用重复副本".into(),
                automatic: true,
            }],
        });
    }
    if !scan.missing_dependencies.is_empty() {
        diagnoses.push(Diagnosis {
            code: "missing_dependency".into(),
            title: "缺失前置模组".into(),
            severity: Severity::Critical,
            confidence: 98,
            root_cause: "JAR 元数据声明了未安装的必需前置。".into(),
            evidence: scan
                .missing_dependencies
                .iter()
                .take(5)
                .map(|item| Evidence {
                    source: "mod_scan".into(),
                    line: None,
                    excerpt: format!(
                        "{} 需要 {}{}",
                        item.mod_file,
                        item.dependency_id,
                        item.requirement
                            .as_deref()
                            .map(|version| format!(" ({version})"))
                            .unwrap_or_default()
                    ),
                })
                .collect(),
            suggested_actions: vec![SuggestedAction {
                kind: ActionKind::ResolveMissingDependencies,
                label: "下载缺失前置".into(),
                automatic: true,
            }],
        });
    }
    for conflict in &scan.conflicts {
        diagnoses.push(Diagnosis {
            code: conflict.code.clone(),
            title: conflict.title.clone(),
            severity: match conflict.severity {
                ConflictSeverity::Error => Severity::Error,
                ConflictSeverity::Warning => Severity::Warning,
            },
            confidence: 99,
            root_cause: conflict.suggestion.clone(),
            evidence: vec![Evidence {
                source: "mod_scan".into(),
                line: None,
                excerpt: conflict.mods.join(", "),
            }],
            suggested_actions: vec![SuggestedAction {
                kind: ActionKind::DisableConflictingMods,
                label: "禁用冲突模组".into(),
                automatic: true,
            }],
        });
    }
}

fn severity_rank(severity: Severity) -> u8 {
    match severity {
        Severity::Critical => 4,
        Severity::Error => 3,
        Severity::Warning => 2,
        Severity::Info => 1,
    }
}

pub fn latest_crash_report(instance: &Instance) -> Option<String> {
    let mut reports: Vec<_> = std::fs::read_dir(instance.crash_reports_dir())
        .ok()?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "txt")
        })
        .collect();
    reports.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    reports
        .last()
        .and_then(|entry| std::fs::read_to_string(entry.path()).ok())
}
