use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::error::CoreResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameSample {
    pub timestamp_ms: u64,
    pub fps: f64,
    pub one_percent_low_fps: f64,
    pub frame_time_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartSeries {
    pub fps: Vec<[f64; 2]>,
    pub one_percent_low_fps: Vec<[f64; 2]>,
    pub frame_time_ms: Vec<[f64; 2]>,
}

pub struct FlightRecorder {
    path: PathBuf,
    file: Mutex<Option<File>>,
    samples: Mutex<Vec<FrameSample>>,
}

impl FlightRecorder {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            file: Mutex::new(None),
            samples: Mutex::new(Vec::new()),
        }
    }

    pub fn start(&self) -> CoreResult<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&self.path)?;
        let mut file = file;
        writeln!(file, "timestamp_ms,fps,one_percent_low_fps,frame_time_ms")?;
        *self.file.lock().expect("flight recorder poisoned") = Some(file);
        *self.samples.lock().expect("flight recorder poisoned") = Vec::new();
        Ok(())
    }

    pub fn record(&self, sample: FrameSample) -> CoreResult<()> {
        {
            let mut file = self.file.lock().expect("flight recorder poisoned");
            let file = file.as_mut().ok_or_else(|| {
                crate::error::CoreError::InvalidInput(
                    "flight recorder is not started".to_string(),
                )
            })?;
            writeln!(
                file,
                "{},{:.2},{:.2},{:.3}",
                sample.timestamp_ms, sample.fps, sample.one_percent_low_fps, sample.frame_time_ms
            )?;
        }
        self.samples
            .lock()
            .expect("flight recorder poisoned")
            .push(sample);
        Ok(())
    }

    pub fn stop(&self) {
        self.file.lock().expect("flight recorder poisoned").take();
    }

    pub fn samples(&self) -> Vec<FrameSample> {
        self.samples
            .lock()
            .expect("flight recorder poisoned")
            .clone()
    }

    /// Data shape ready for a simple frontend line chart. Each point is
    /// `[seconds_since_start, value]`.
    pub fn chart_series(&self) -> ChartSeries {
        let samples = self.samples();
        let start = samples.first().map(|sample| sample.timestamp_ms).unwrap_or(0);
        let series = |value: fn(&FrameSample) -> f64| {
            samples
                .iter()
                .map(|sample| {
                    [
                        (sample.timestamp_ms.saturating_sub(start) as f64) / 1000.0,
                        value(sample),
                    ]
                })
                .collect()
        };
        ChartSeries {
            fps: series(|sample| sample.fps),
            one_percent_low_fps: series(|sample| sample.one_percent_low_fps),
            frame_time_ms: series(|sample| sample.frame_time_ms),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}
