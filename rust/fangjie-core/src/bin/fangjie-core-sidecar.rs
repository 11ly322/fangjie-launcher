//! JSON-lines sidecar used by the Electron main process.
//!
//! Protocol: one JSON request per line on stdin, one JSON response per line on
//! stdout. The process is long-lived so repair plans and receipts stay in
//! memory for preview -> confirm -> apply -> rollback.

use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use fangjie_core::crash_diagnosis::{self, CrashDiagnosisReport};
use fangjie_core::download_source::{DownloadConfig, SourceRegistry};
use fangjie_core::error::{CoreError, CoreResult};
use fangjie_core::flight_recorder::{self, ChartSeries};
use fangjie_core::instance_manager::{
    copy_instance_data, export_mod_list_for, save_template_for, set_mods_enabled_for,
    InstanceTemplate, ModEnableChange,
};
use fangjie_core::model::Instance;
use fangjie_core::mod_scanner::{ModScanReport, ModScanner};
use fangjie_core::modpack_importer::apply_mrpack;
use fangjie_core::plugin_api::{validate_manifest, PluginManifest, PluginValidation};
use fangjie_core::update_manager::{check_manifest, verify_asset, UpdateAsset, UpdateManifest};
use fangjie_core::repair_engine::{
    RepairEngine, RepairOptions, RepairPlan, RepairReceipt,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Deserialize)]
struct Envelope {
    #[serde(default)]
    id: Option<String>,
    #[serde(flatten)]
    request: Request,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Request {
    Ping,
    Diagnose {
        instance: Instance,
    },
    Scan {
        instance: Instance,
    },
    PreviewRepair {
        instance: Instance,
        #[serde(default)]
        options: RepairOptions,
    },
    ApplyRepair {
        plan_id: String,
        confirmed: bool,
    },
    RollbackRepair {
        repair_id: String,
    },
    FlightSeries {
        csv_path: PathBuf,
    },
    SetModsEnabled {
        instance: Instance,
        changes: Vec<ModEnableChange>,
    },
    CopyInstance {
        source: Instance,
        instances_root: PathBuf,
        new_id: String,
        new_name: String,
    },
    ExportModList {
        instance: Instance,
    },
    SaveTemplate {
        instance: Instance,
        templates_root: PathBuf,
        template_id: String,
    },
    CheckUpdate {
        current_version: String,
        manifest: UpdateManifest,
    },
    VerifyUpdate {
        path: PathBuf,
        asset: UpdateAsset,
    },
    ValidatePlugin {
        manifest: PluginManifest,
    },
    ImportModpack {
        instance: Instance,
        archive_path: PathBuf,
    },
}

#[derive(Serialize)]
struct Response {
    id: Option<String>,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn ok(id: Option<String>, value: Value) -> Response {
    Response {
        id,
        ok: true,
        value: Some(value),
        error: None,
    }
}

fn fail(id: Option<String>, error: impl std::fmt::Display) -> Response {
    Response {
        id,
        ok: false,
        value: None,
        error: Some(error.to_string()),
    }
}

fn diagnose_parts(instance: &Instance) -> CoreResult<(CrashDiagnosisReport, ModScanReport, usize, bool)> {
    let log_path = instance.logs_dir().join("latest.log");
    let log_text = std::fs::read_to_string(log_path).unwrap_or_default();
    let crash_text = crash_diagnosis::latest_crash_report(instance);
    let scan = ModScanner::scan(instance)?;
    let diagnosis = crash_diagnosis::diagnose(&log_text, crash_text.as_deref(), Some(&scan));
    Ok((
        diagnosis,
        scan,
        log_text.lines().count(),
        crash_text.is_some(),
    ))
}

fn execute(
    request: Request,
    repairs: &mut RepairEngine,
    sources: &SourceRegistry,
) -> CoreResult<Value> {
    match request {
        Request::Ping => Ok(json!({
            "name": "fangjie-core-sidecar",
            "version": env!("CARGO_PKG_VERSION"),
        })),
        Request::Diagnose { instance } => {
            let (diagnosis, scan, log_lines, crash_report_found) = diagnose_parts(&instance)?;
            Ok(json!({
                "diagnosis": diagnosis,
                "scan": scan,
                "log_lines": log_lines,
                "crash_report_found": crash_report_found,
            }))
        }
        Request::Scan { instance } => Ok(serde_json::to_value(ModScanner::scan(&instance)?)?),
        Request::PreviewRepair { instance, options } => {
            let (diagnosis, scan, _, _) = diagnose_parts(&instance)?;
            let plan: RepairPlan = repairs.preview(&instance, &diagnosis, &scan, &options, sources)?;
            Ok(serde_json::to_value(plan)?)
        }
        Request::ApplyRepair { plan_id, confirmed } => {
            let receipt: RepairReceipt = repairs.apply(&plan_id, confirmed, sources)?;
            Ok(serde_json::to_value(receipt)?)
        }
        Request::RollbackRepair { repair_id } => {
            let receipt: RepairReceipt = repairs.rollback(&repair_id)?;
            Ok(serde_json::to_value(receipt)?)
        }
        Request::FlightSeries { csv_path } => {
            let samples = flight_recorder::read_csv(&csv_path)?;
            let series: ChartSeries = flight_recorder::chart_series_from_samples(&samples);
            Ok(json!({ "samples": samples, "series": series, "path": csv_path }))
        }
        Request::SetModsEnabled { instance, changes } => {
            Ok(serde_json::to_value(set_mods_enabled_for(&instance, &changes)?)?)
        }
        Request::CopyInstance {
            source,
            instances_root,
            new_id,
            new_name,
        } => Ok(serde_json::to_value(copy_instance_data(
            &source,
            &instances_root,
            &new_id,
            &new_name,
        )?)?),
        Request::SaveTemplate {
            instance,
            templates_root,
            template_id,
        } => {
            let template: InstanceTemplate =
                save_template_for(&instance, &templates_root, &template_id)?;
            Ok(serde_json::to_value(template)?)
        }
        Request::ExportModList { instance } => {
            Ok(serde_json::to_value(export_mod_list_for(&instance)?)?)
        }
        Request::CheckUpdate {
            current_version,
            manifest,
        } => Ok(serde_json::to_value(check_manifest(
            &current_version,
            manifest,
        )?)?),
        Request::VerifyUpdate { path, asset } => {
            verify_asset(&path, &asset)?;
            Ok(serde_json::json!({ "verified": true }))
        }
        Request::ImportModpack {
            instance,
            archive_path,
        } => Ok(serde_json::to_value(apply_mrpack(&instance, &archive_path)?)?),
        Request::ValidatePlugin { manifest } => {
            let validation: PluginValidation = validate_manifest(&manifest)
                .map_err(|error| CoreError::InvalidInput(error.to_string()))?;
            Ok(serde_json::to_value(validation)?)
        }
    }
}

fn main() {
    let sources = match SourceRegistry::new(DownloadConfig::default()) {
        Ok(sources) => sources,
        Err(error) => {
            eprintln!("fangjie-core-sidecar: cannot create download source: {error}");
            std::process::exit(2);
        }
    };
    let mut repairs = RepairEngine::new();
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                eprintln!("fangjie-core-sidecar: stdin error: {error}");
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Envelope>(&line) {
            Ok(envelope) => {
                let id = envelope.id.clone();
                match execute(envelope.request, &mut repairs, &sources) {
                    Ok(value) => ok(id, value),
                    Err(error) => fail(id, error),
                }
            }
            Err(error) => fail(None, format!("invalid request: {error}")),
        };
        if serde_json::to_writer(&mut stdout, &response).is_err() {
            break;
        }
        if writeln!(&mut stdout).is_err() || stdout.flush().is_err() {
            break;
        }
    }
}
