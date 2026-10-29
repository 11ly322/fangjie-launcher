use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::crash_diagnosis::{self, CrashDiagnosisReport};
use crate::download_source::{DownloadConfig, SourceRegistry};
use crate::error::{CoreError, CoreResult};
use crate::flight_recorder::{ChartSeries, FlightRecorder, FrameSample};
use crate::instance_manager::{InstanceManager, InstanceTemplate, ModEnableChange, ModListExport};
use crate::model::Instance;
use crate::mod_scanner::{ModScanReport, ModScanner};
use crate::plugin_api::{PluginManifest, PluginRegistry, PluginValidation};
use crate::repair_engine::{RepairEngine, RepairOptions, RepairPlan, RepairReceipt};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosisBundle {
    pub diagnosis: CrashDiagnosisReport,
    pub scan: ModScanReport,
    pub log_lines: usize,
    pub crash_report_found: bool,
}

pub struct Backend {
    pub data_root: PathBuf,
    pub instances: InstanceManager,
    pub sources: SourceRegistry,
    pub repairs: RepairEngine,
    pub plugins: Mutex<PluginRegistry>,
    recorders: Mutex<HashMap<String, Arc<FlightRecorder>>>,
}

impl Backend {
    pub fn new(
        data_root: impl Into<PathBuf>,
        download_config: DownloadConfig,
    ) -> CoreResult<Self> {
        let data_root = data_root.into();
        let sources = SourceRegistry::new(download_config)?;
        Ok(Self {
            instances: InstanceManager::new(&data_root),
            data_root,
            sources,
            repairs: RepairEngine::new(),
            plugins: Mutex::new(PluginRegistry::default()),
            recorders: Mutex::new(HashMap::new()),
        })
    }

    pub fn diagnose(&self, instance_id: &str) -> CoreResult<DiagnosisBundle> {
        let instance = self.instances.load(instance_id)?;
        let log_path = instance.logs_dir().join("latest.log");
        let log_text = std::fs::read_to_string(&log_path).unwrap_or_default();
        let crash_text = crash_diagnosis::latest_crash_report(&instance);
        let scan = ModScanner::scan(&instance)?;
        let diagnosis = crash_diagnosis::diagnose(&log_text, crash_text.as_deref(), Some(&scan));
        Ok(DiagnosisBundle {
            diagnosis,
            scan,
            log_lines: log_text.lines().count(),
            crash_report_found: crash_text.is_some(),
        })
    }

    pub fn scan(&self, instance_id: &str) -> CoreResult<ModScanReport> {
        let instance = self.instances.load(instance_id)?;
        ModScanner::scan(&instance)
    }

    pub fn preview_repair(
        &self,
        instance_id: &str,
        options: &RepairOptions,
    ) -> CoreResult<RepairPlan> {
        let instance = self.instances.load(instance_id)?;
        let scan = ModScanner::scan(&instance)?;
        let log_text = std::fs::read_to_string(instance.logs_dir().join("latest.log"))
            .unwrap_or_default();
        let crash_text = crash_diagnosis::latest_crash_report(&instance);
        let diagnosis =
            crash_diagnosis::diagnose(&log_text, crash_text.as_deref(), Some(&scan));
        self.repairs
            .preview(&instance, &diagnosis, &scan, options, &self.sources)
    }

    pub fn apply_repair(&self, plan_id: &str, confirmed: bool) -> CoreResult<RepairReceipt> {
        self.repairs.apply(plan_id, confirmed, &self.sources)
    }

    pub fn rollback_repair(&self, repair_id: &str) -> CoreResult<RepairReceipt> {
        self.repairs.rollback(repair_id)
    }

    pub fn get_plan(&self, plan_id: &str) -> Option<RepairPlan> {
        self.repairs.get_plan(plan_id)
    }

    pub fn copy_instance(&self, source_id: &str, new_name: &str) -> CoreResult<Instance> {
        self.instances.copy_instance(source_id, new_name)
    }

    pub fn save_template(
        &self,
        instance_id: &str,
        template_id: &str,
    ) -> CoreResult<InstanceTemplate> {
        self.instances.save_template(instance_id, template_id)
    }

    pub fn apply_template(
        &self,
        instance_id: &str,
        template: &InstanceTemplate,
    ) -> CoreResult<Instance> {
        self.instances
            .apply_template_metadata(instance_id, template)
    }

    pub fn set_mods_enabled(
        &self,
        instance_id: &str,
        changes: &[ModEnableChange],
    ) -> CoreResult<ModScanReport> {
        self.instances.set_mods_enabled(instance_id, changes)
    }

    pub fn export_mod_list(&self, instance_id: &str) -> CoreResult<ModListExport> {
        self.instances.export_mod_list(instance_id)
    }

    pub fn start_flight_recorder(&self, instance_id: &str) -> CoreResult<String> {
        let instance = self.instances.load(instance_id)?;
        let path = instance.logs_dir().join("flight-recorder.csv");
        let recorder = Arc::new(FlightRecorder::new(path));
        recorder.start()?;
        self.recorders
            .lock()
            .expect("flight recorders poisoned")
            .insert(instance_id.to_string(), recorder);
        Ok(instance
            .logs_dir()
            .join("flight-recorder.csv")
            .display()
            .to_string())
    }

    pub fn record_frame_sample(&self, instance_id: &str, sample: FrameSample) -> CoreResult<()> {
        let recorder = self
            .recorders
            .lock()
            .expect("flight recorders poisoned")
            .get(instance_id)
            .cloned()
            .ok_or_else(|| CoreError::NotFound(format!("flight recorder for {instance_id}")))?;
        recorder.record(sample)
    }

    pub fn flight_chart(&self, instance_id: &str) -> CoreResult<ChartSeries> {
        let recorder = self
            .recorders
            .lock()
            .expect("flight recorders poisoned")
            .get(instance_id)
            .cloned()
            .ok_or_else(|| CoreError::NotFound(format!("flight recorder for {instance_id}")))?;
        Ok(recorder.chart_series())
    }

    pub fn register_plugin(&self, manifest: PluginManifest) -> Result<PluginValidation, String> {
        self.plugins
            .lock()
            .expect("plugin registry poisoned")
            .register(manifest)
            .map_err(|error| error.to_string())
    }

    pub fn list_instances(&self) -> CoreResult<Vec<Instance>> {
        self.instances.list()
    }
}

/// State injected into Tauri commands.
pub struct BackendState(pub Arc<Backend>);

impl BackendState {
    pub fn new(backend: Backend) -> Self {
        Self(Arc::new(backend))
    }
}
