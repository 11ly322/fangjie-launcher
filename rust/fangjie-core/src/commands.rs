use tauri::State;

use crate::backend::{BackendState, DiagnosisBundle};
use crate::flight_recorder::{ChartSeries, FrameSample};
use crate::instance_manager::{InstanceTemplate, ModListExport};
use crate::model::Instance;
use crate::mod_scanner::ModScanReport;
use crate::plugin_api::PluginValidation;
use crate::repair_engine::{RepairOptions, RepairPlan, RepairReceipt};

fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
pub fn list_instances(state: State<'_, BackendState>) -> Result<Vec<Instance>, String> {
    state.0.list_instances().map_err(err)
}

#[tauri::command]
pub fn diagnose_crash(
    state: State<'_, BackendState>,
    instance_id: String,
) -> Result<DiagnosisBundle, String> {
    state.0.diagnose(&instance_id).map_err(err)
}

#[tauri::command]
pub fn set_offline_mode(state: State<'_, BackendState>, enabled: bool) -> Result<bool, String> {
    state.0.set_offline_mode(enabled);
    Ok(state.0.is_offline())
}

#[tauri::command]
pub fn scan_instance_mods(
    state: State<'_, BackendState>,
    instance_id: String,
) -> Result<ModScanReport, String> {
    state.0.scan(&instance_id).map_err(err)
}

/// Builds the repair plan and diff. Does not mutate any file.
#[tauri::command]
pub fn preview_repair(
    state: State<'_, BackendState>,
    instance_id: String,
    options: RepairOptions,
) -> Result<RepairPlan, String> {
    state.0.preview_repair(&instance_id, &options).map_err(err)
}

/// `confirmed` must be true; the UI is expected to show `preview_repair`'s diff
/// before calling this command.
#[tauri::command]
pub fn apply_repair(
    state: State<'_, BackendState>,
    plan_id: String,
    confirmed: bool,
) -> Result<RepairReceipt, String> {
    state.0.apply_repair(&plan_id, confirmed).map_err(err)
}

#[tauri::command]
pub fn rollback_repair(
    state: State<'_, BackendState>,
    repair_id: String,
) -> Result<RepairReceipt, String> {
    state.0.rollback_repair(&repair_id).map_err(err)
}

#[tauri::command]
pub fn copy_instance(
    state: State<'_, BackendState>,
    source_id: String,
    new_name: String,
) -> Result<Instance, String> {
    state.0.copy_instance(&source_id, &new_name).map_err(err)
}

#[tauri::command]
pub fn save_instance_template(
    state: State<'_, BackendState>,
    instance_id: String,
    template_id: String,
) -> Result<InstanceTemplate, String> {
    state.0.save_template(&instance_id, &template_id).map_err(err)
}

#[tauri::command]
pub fn apply_instance_template(
    state: State<'_, BackendState>,
    instance_id: String,
    template: InstanceTemplate,
) -> Result<Instance, String> {
    state.0.apply_template(&instance_id, &template).map_err(err)
}

#[tauri::command]
pub fn set_mods_enabled(
    state: State<'_, BackendState>,
    instance_id: String,
    changes: Vec<crate::instance_manager::ModEnableChange>,
) -> Result<ModScanReport, String> {
    state
        .0
        .set_mods_enabled(&instance_id, &changes)
        .map_err(err)
}

#[tauri::command]
pub fn export_mod_list(
    state: State<'_, BackendState>,
    instance_id: String,
) -> Result<ModListExport, String> {
    state.0.export_mod_list(&instance_id).map_err(err)
}

#[tauri::command]
pub fn start_flight_recorder(
    state: State<'_, BackendState>,
    instance_id: String,
) -> Result<String, String> {
    state.0.start_flight_recorder(&instance_id).map_err(err)
}

#[tauri::command]
pub fn record_frame_sample(
    state: State<'_, BackendState>,
    instance_id: String,
    sample: FrameSample,
) -> Result<(), String> {
    state.0.record_frame_sample(&instance_id, sample).map_err(err)
}

#[tauri::command]
pub fn flight_chart(
    state: State<'_, BackendState>,
    instance_id: String,
) -> Result<ChartSeries, String> {
    state.0.flight_chart(&instance_id).map_err(err)
}

#[tauri::command]
pub fn register_plugin_manifest(
    state: State<'_, BackendState>,
    manifest: crate::plugin_api::PluginManifest,
) -> Result<PluginValidation, String> {
    state.0.register_plugin(manifest)
}
