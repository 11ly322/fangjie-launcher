//! Fangjie launcher core.
//!
//! Phase 1 is intentionally independent from the Tauri runtime. The `tauri`
//! feature only compiles the command adapter; all diagnosis and repair logic
//! can be unit-tested without a desktop shell.

pub mod backend;
pub mod crash_diagnosis;
pub mod download_source;
pub mod error;
pub mod flight_recorder;
pub mod instance_manager;
pub mod mod_scanner;
pub mod modpack_importer;
pub mod update_manager;
pub mod model;
pub mod plugin_api;
pub mod repair_engine;

#[cfg(feature = "tauri")]
pub mod commands;

pub use backend::{Backend, BackendState, DiagnosisBundle};
pub use crash_diagnosis::{
    diagnose, ActionKind, CrashDiagnosisReport, Diagnosis, Evidence, Severity, SuggestedAction,
};
pub use download_source::{DownloadConfig, DownloadSource, ModCandidate, ResolvedMod, SourceRegistry};
pub use error::{CoreError, CoreResult};
pub use flight_recorder::{ChartSeries, FlightRecorder, FrameSample};
pub use instance_manager::{InstanceManager, InstanceTemplate, ModListExport};
pub use model::{Instance, Loader, ModDependency};
pub use modpack_importer::{ModpackFormat, ModpackImportPlan, ModpackManifest};
pub use update_manager::{check_manifest, verify_asset, UpdateAsset, UpdateChannel, UpdateManifest};
pub use mod_scanner::{ModScanReport, ModScanner};
pub use plugin_api::{
    validate_manifest, PluginKind, PluginManifest, PluginValidation, PLUGIN_API_VERSION,
};
pub use repair_engine::{
    ChangeRecord, DiffEntry, DiffKind, RepairAction, RepairEngine, RepairOptions, RepairPlan,
    RepairReceipt,
};
