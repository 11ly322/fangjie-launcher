use std::io::Write;
use std::path::Path;

use fangjie_core::backend::Backend;
use fangjie_core::crash_diagnosis::{diagnose, ActionKind};
use fangjie_core::download_source::{
    DownloadConfig, FixtureSource, ResolvedMod, SourceRegistry,
};
use fangjie_core::flight_recorder::{FlightRecorder, FrameSample};
use fangjie_core::instance_manager::InstanceManager;
use fangjie_core::model::{write_instance, Instance, Loader};
use fangjie_core::mod_scanner::ModScanner;
use fangjie_core::plugin_api::{
    validate_manifest, PluginKind, PluginManifest, Permission,
};
use fangjie_core::repair_engine::{RepairEngine, RepairOptions};
use tempfile::TempDir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn create_instance(temp: &TempDir) -> Instance {
    let root = temp.path().join("instances").join("test");
    let game_dir = root.join(".minecraft");
    std::fs::create_dir_all(game_dir.join("mods")).unwrap();
    std::fs::create_dir_all(game_dir.join("logs")).unwrap();
    std::fs::create_dir_all(game_dir.join("crash-reports")).unwrap();
    let instance = Instance {
        id: "test".into(),
        name: "Test".into(),
        root,
        game_dir,
        game_version: "1.20.1".into(),
        loader: Loader::Fabric,
        loader_version: Some("0.15.0".into()),
        java_path: None,
        memory_mb: 4096,
        jvm_args: vec!["-XX:+UseG1GC".into()],
        width: Some(1280),
        height: Some(720),
    };
    write_instance(&instance).unwrap();
    instance
}

fn write_jar(path: &Path, entries: &[(&str, &str)]) {
    let file = std::fs::File::create(path).unwrap();
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    for (name, content) in entries {
        zip.start_file(*name, options).unwrap();
        zip.write_all(content.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
}

fn fabric_mod(id: &str, deps: &[(&str, &str)]) -> String {
    let depends = deps
        .iter()
        .map(|(id, version)| format!(r#""{id}": "{version}""#))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        r#"{{"schemaVersion":1,"id":"{id}","version":"1.0.0","name":"{id}","depends":{{{depends}}}}}"#
    )
}

fn crash_cases() -> Vec<(&'static str, &'static str)> {
    vec![
        ("missing_dependency", "Missing or unsupported mandatory dependencies: examplemod requires any version of fabric-api"),
        ("duplicate_mods", "Duplicate mods found for mod id examplemod in mods/a.jar and mods/b.jar"),
        ("optifine_render_conflict", "OptiFine and Sodium are both installed and conflict"),
        ("java_version_mismatch", "java.lang.UnsupportedClassVersionError: class file version 65.0"),
        ("out_of_memory", "java.lang.OutOfMemoryError: Java heap space"),
        ("loader_version_mismatch", "Incompatible mod set! fabricloader requires version 0.16"),
        ("config_corruption", "com.google.gson.JsonParseException: Failed to parse config"),
        ("resource_pack_missing", "Failed to load resource pack: missing pack.mcmeta"),
        ("mixin_apply_failure", "Mixin apply failed for examplemod"),
    ]
}

#[test]
fn detects_requested_crash_classes() {
    for (expected, log) in crash_cases() {
        let report = diagnose(log, None, None);
        assert!(
            report.codes().contains(&expected),
            "expected {expected}, got {:?} from {log}",
            report.codes()
        );
        let diagnosis = report
            .diagnoses
            .iter()
            .find(|item| item.code == expected)
            .unwrap();
        assert!(!diagnosis.root_cause.is_empty());
        assert!(!diagnosis.suggested_actions.is_empty());
        assert!(diagnosis.evidence.iter().any(|evidence| !evidence.excerpt.is_empty()));
    }
}

#[test]
fn missing_dependency_rule_points_at_automatic_repair() {
    let report = diagnose("requires any version of fabric-api", None, None);
    let diagnosis = report
        .diagnoses
        .iter()
        .find(|item| item.code == "missing_dependency")
        .unwrap();
    assert!(diagnosis
        .suggested_actions
        .iter()
        .any(|action| action.kind == ActionKind::ResolveMissingDependencies && action.automatic));
}

#[test]
fn scanner_finds_missing_dependency_duplicate_and_conflict() {
    let temp = TempDir::new().unwrap();
    let instance = create_instance(&temp);
    let mods = instance.mods_dir();
    write_jar(
        &mods.join("dependent.jar"),
        &[("fabric.mod.json", &fabric_mod("dependent", &[("missinglib", ">=1.0")]))],
    );
    write_jar(
        &mods.join("dup-a.jar"),
        &[("fabric.mod.json", &fabric_mod("duplicated", &[]))],
    );
    write_jar(
        &mods.join("dup-b.jar"),
        &[("fabric.mod.json", &fabric_mod("duplicated", &[]))],
    );
    write_jar(
        &mods.join("optifine.jar"),
        &[("fabric.mod.json", &fabric_mod("optifine", &[]))],
    );
    write_jar(
        &mods.join("sodium.jar"),
        &[("fabric.mod.json", &fabric_mod("sodium", &[]))],
    );
    write_jar(
        &mods.join("api.jar"),
        &[("fabric.mod.json", &fabric_mod("fabric-api", &[]))],
    );

    let report = ModScanner::scan(&instance).unwrap();
    assert_eq!(report.mods.len(), 6);
    assert!(
        report
            .missing_dependencies
            .iter()
            .any(|dep| dep.dependency_id == "missinglib")
    );
    assert!(report.duplicates.iter().any(|dup| dup.mod_id == "duplicated"));
    assert!(report
        .conflicts
        .iter()
        .any(|conflict| conflict.code == "optifine_render_conflict"));
}

#[test]
fn repair_preview_apply_and_rollback_never_mutate_before_confirmation() {
    let temp = TempDir::new().unwrap();
    let instance = create_instance(&temp);
    write_jar(
        &instance.mods_dir().join("dependent.jar"),
        &[("fabric.mod.json", &fabric_mod("dependent", &[("fabric-api", ">=0.90")]))],
    );
    let scan = ModScanner::scan(&instance).unwrap();
    let diagnosis = diagnose("", None, Some(&scan));
    let fixture = FixtureSource::default();
    let resolved = ResolvedMod {
        project_id: "fabric-api".into(),
        version_id: "1".into(),
        name: "Fabric API".into(),
        file_name: "fabric-api.jar".into(),
        download_url: "fixture://fabric-api".into(),
        sha1: None,
        dependencies: vec![],
    };
    fixture.add("fabric-api", resolved, b"fixture jar".to_vec());
    let config = DownloadConfig {
        default_source: "fixture".into(),
        ..Default::default()
    };
    let mut sources = SourceRegistry::new(config).unwrap();
    sources.register(std::sync::Arc::new(fixture));
    let engine = RepairEngine::new();
    let options = RepairOptions {
        source_id: Some("fixture".into()),
        disable_conflicts: true,
        ..Default::default()
    };
    let plan = engine
        .preview(&instance, &diagnosis, &scan, &options, &sources)
        .unwrap();
    assert!(plan.diff.iter().any(|entry| entry.kind == fangjie_core::DiffKind::Create));
    assert!(plan
        .warnings
        .iter()
        .all(|warning| !warning.contains("目标文件")));
    assert!(!instance.mods_dir().join("fabric-api.jar").exists());

    let error = engine.apply(&plan.id, false, &sources).unwrap_err();
    assert!(matches!(error, fangjie_core::CoreError::ConfirmationRequired));
    assert!(!instance.mods_dir().join("fabric-api.jar").exists());

    let receipt = engine.apply(&plan.id, true, &sources).unwrap();
    assert!(instance.mods_dir().join("fabric-api.jar").exists());
    assert!(receipt.backup_dir.join("receipt.json").exists());

    let rolled_back = engine.rollback(&receipt.repair_id).unwrap();
    assert_eq!(rolled_back.repair_id, receipt.repair_id);
    assert!(!instance.mods_dir().join("fabric-api.jar").exists());
}

#[test]
fn repair_config_java_and_memory_are_backed_up_and_rollbackable() {
    let temp = TempDir::new().unwrap();
    let instance = create_instance(&temp);
    let config_file = instance.game_dir.join("options.txt");
    std::fs::write(&config_file, "corrupt = :::").unwrap();
    let scan = ModScanner::scan(&instance).unwrap();
    let diagnosis = diagnose("com.google.gson.JsonParseException: broken", None, Some(&scan));
    let sources = SourceRegistry::new(DownloadConfig::default()).unwrap();
    let engine = RepairEngine::new();
    let java = temp.path().join("jdk-21").join("bin").join("java.exe");
    let options = RepairOptions {
        java_path: Some(java.clone()),
        memory_mb: Some(8192),
        config_relative: Some("options.txt".into()),
        config_replacement: Some("fov:0.5\n".into()),
        disable_conflicts: true,
        ..Default::default()
    };
    let plan = engine
        .preview(&instance, &diagnosis, &scan, &options, &sources)
        .unwrap();
    assert!(plan.actions.len() >= 3);
    let receipt = engine.apply(&plan.id, true, &sources).unwrap();
    assert_eq!(std::fs::read_to_string(&config_file).unwrap(), "fov:0.5\n");
    let updated = fangjie_core::model::read_instance(&instance.manifest_path()).unwrap();
    assert_eq!(updated.memory_mb, 8192);
    assert_eq!(updated.java_path, Some(java));

    engine.rollback(&receipt.repair_id).unwrap();
    assert_eq!(std::fs::read_to_string(&config_file).unwrap(), "corrupt = :::");
    let restored = fangjie_core::model::read_instance(&instance.manifest_path()).unwrap();
    assert_eq!(restored.memory_mb, 4096);
    assert_eq!(restored.java_path, None);
}

#[test]
fn conflict_disable_is_backed_up_and_restored() {
    let temp = TempDir::new().unwrap();
    let instance = create_instance(&temp);
    write_jar(
        &instance.mods_dir().join("optifine.jar"),
        &[("fabric.mod.json", &fabric_mod("optifine", &[]))],
    );
    write_jar(
        &instance.mods_dir().join("sodium.jar"),
        &[("fabric.mod.json", &fabric_mod("sodium", &[]))],
    );
    let scan = ModScanner::scan(&instance).unwrap();
    let diagnosis = diagnose("OptiFine and Sodium conflict", None, Some(&scan));
    let sources = SourceRegistry::new(DownloadConfig::default()).unwrap();
    let engine = RepairEngine::new();
    let plan = engine
        .preview(
            &instance,
            &diagnosis,
            &scan,
            &RepairOptions {
                disable_conflicts: true,
                ..Default::default()
            },
            &sources,
        )
        .unwrap();
    let receipt = engine.apply(&plan.id, true, &sources).unwrap();
    assert!(!instance.mods_dir().join("optifine.jar").exists());
    assert!(instance.mods_dir().join("optifine.jar.disabled").exists());
    engine.rollback(&receipt.repair_id).unwrap();
    assert!(instance.mods_dir().join("optifine.jar").exists());
    assert!(!instance.mods_dir().join("optifine.jar.disabled").exists());
}

#[test]
fn instance_copy_is_deep_and_does_not_pollute_source() {
    let temp = TempDir::new().unwrap();
    let instance = create_instance(&temp);
    write_jar(
        &instance.mods_dir().join("sample.jar"),
        &[("fabric.mod.json", &fabric_mod("sample", &[]))],
    );
    let manager = InstanceManager::new(temp.path());
    let copy = manager.copy_instance("test", "Copy").unwrap();
    assert_ne!(copy.id, instance.id);
    assert_eq!(copy.name, "Copy");
    assert!(copy.game_dir.join("mods").join("sample.jar").exists());
    assert!(instance.game_dir.join("mods").join("sample.jar").exists());
    std::fs::write(instance.game_dir.join("mods").join("source-only.txt"), "x").unwrap();
    assert!(!copy.game_dir.join("mods").join("source-only.txt").exists());
    let exported = manager.export_mod_list(&copy.id).unwrap();
    assert_eq!(exported.mods.len(), 1);
}

#[test]
fn batch_mod_toggle_is_isolated_to_instance() {
    let temp = TempDir::new().unwrap();
    let instance = create_instance(&temp);
    write_jar(
        &instance.mods_dir().join("a.jar"),
        &[("fabric.mod.json", &fabric_mod("mod-a", &[]))],
    );
    write_jar(
        &instance.mods_dir().join("b.jar"),
        &[("fabric.mod.json", &fabric_mod("mod-b", &[]))],
    );
    let manager = InstanceManager::new(temp.path());
    let report = manager
        .set_mods_enabled(
            "test",
            &[fangjie_core::instance_manager::ModEnableChange {
                file_name: "a.jar".into(),
                enabled: false,
            }],
        )
        .unwrap();
    assert!(report.mods.iter().any(|item| item.file_name == "a.jar.disabled" && !item.enabled));
    assert!(instance.mods_dir().join("a.jar.disabled").exists());
    assert!(instance.mods_dir().join("b.jar").exists());

    let report = manager
        .set_mods_enabled(
            "test",
            &[fangjie_core::instance_manager::ModEnableChange {
                file_name: "a.jar.disabled".into(),
                enabled: true,
            }],
        )
        .unwrap();
    assert!(report.mods.iter().any(|item| item.file_name == "a.jar" && item.enabled));
}

#[test]
fn offline_registry_blocks_network_paths() {
    let registry = SourceRegistry::new(DownloadConfig {
        offline: true,
        ..Default::default()
    })
    .unwrap();
    let error = registry
        .resolve_dependency(Some("modrinth"), "fabric-api", "1.20.1", Loader::Fabric)
        .unwrap_err();
    assert!(matches!(error, fangjie_core::CoreError::Offline(_)));
    registry.set_offline(false);
    assert!(!registry.is_offline());
}

#[test]
fn flight_recorder_writes_csv_and_chart_series() {
    let temp = TempDir::new().unwrap();
    let path = temp.path().join("flight.csv");
    let recorder = FlightRecorder::new(&path);
    recorder.start().unwrap();
    recorder
        .record(FrameSample {
            timestamp_ms: 1000,
            fps: 120.0,
            one_percent_low_fps: 90.0,
            frame_time_ms: 8.3,
        })
        .unwrap();
    recorder
        .record(FrameSample {
            timestamp_ms: 2000,
            fps: 110.0,
            one_percent_low_fps: 80.0,
            frame_time_ms: 9.0,
        })
        .unwrap();
    recorder.stop();
    let chart = recorder.chart_series();
    assert_eq!(chart.fps.len(), 2);
    assert_eq!(chart.fps[1], [1.0, 110.0]);
    let csv = std::fs::read_to_string(&path).unwrap();
    assert!(csv.contains("timestamp_ms,fps,one_percent_low_fps,frame_time_ms"));
}

#[test]
fn plugin_manifest_has_version_and_permissions() {
    let valid = PluginManifest {
        id: "com.example.crash-helper".into(),
        name: "Crash Helper".into(),
        version: "1.2.3".into(),
        api_version: "1.0.0".into(),
        kind: PluginKind::CrashAnalyzer,
        permissions: vec![Permission::ReadLogs],
    };
    let validation = validate_manifest(&valid).unwrap();
    assert!(validation.warnings.is_empty());

    let mut invalid = valid.clone();
    invalid.api_version = "2.0.0".into();
    assert!(validate_manifest(&invalid).is_err());

    let mut missing_permissions = valid;
    missing_permissions.permissions.clear();
    assert_eq!(validate_manifest(&missing_permissions).unwrap().warnings.len(), 1);
}

#[test]
fn backend_diagnoses_from_instance_logs() {
    let temp = TempDir::new().unwrap();
    let instance = create_instance(&temp);
    std::fs::write(
        instance.logs_dir().join("latest.log"),
        "java.lang.OutOfMemoryError: Java heap space",
    )
    .unwrap();
    let backend = Backend::new(temp.path(), DownloadConfig::default()).unwrap();
    let bundle = backend.diagnose("test").unwrap();
    assert!(bundle.diagnosis.codes().contains(&"out_of_memory"));
    assert!(bundle.log_lines >= 1);
}
