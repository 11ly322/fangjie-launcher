use std::path::PathBuf;

pub type CoreResult<T> = Result<T, CoreError>;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("TOML error: {0}")]
    Toml(#[from] toml::de::Error),
    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("offline mode: {0}")]
    Offline(String),
    #[error("repair requires explicit confirmation")]
    ConfirmationRequired,
    #[error("plan expired or not found: {0}")]
    PlanNotFound(String),
    #[error("receipt not found: {0}")]
    ReceiptNotFound(String),
    #[error("path escapes instance root: {0}")]
    UnsafePath(PathBuf),
}

impl From<ureq::Error> for CoreError {
    fn from(value: ureq::Error) -> Self {
        CoreError::Network(value.to_string())
    }
}
