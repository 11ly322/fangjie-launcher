use std::path::Path;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{CoreError, CoreResult};

/// P1 interface. The Electron update feed still decides where the manifest is
/// hosted; this module owns version comparison and local artifact verification.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateChannel {
    Stable,
    Beta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAsset {
    pub platform: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
    /// Reserved for a detached signature. SHA256 alone is not a signature.
    #[serde(default)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    pub channel: UpdateChannel,
    #[serde(default)]
    pub notes: String,
    pub published_at: String,
    pub assets: Vec<UpdateAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheck {
    pub current_version: String,
    pub available: Option<UpdateManifest>,
}

/// Compare a release version against the current version without pretending to
/// be a full update client. The Electron side owns download/relaunch behavior.
pub fn check_manifest(
    current_version: &str,
    manifest: UpdateManifest,
) -> CoreResult<UpdateCheck> {
    let current = semver::Version::parse(current_version)
        .map_err(|_| CoreError::InvalidInput(format!("invalid current version: {current_version}")))?;
    let candidate = semver::Version::parse(&manifest.version)
        .map_err(|_| CoreError::InvalidInput(format!("invalid update version: {}", manifest.version)))?;
    Ok(UpdateCheck {
        current_version: current_version.to_string(),
        available: (candidate > current).then_some(manifest),
    })
}

/// Verify a downloaded artifact before handing it to the installer. Signature
/// verification is intentionally a P1 extension point, not silently accepted.
pub fn verify_asset(path: &Path, asset: &UpdateAsset) -> CoreResult<()> {
    let bytes = std::fs::read(path)?;
    if bytes.len() as u64 != asset.size {
        return Err(CoreError::InvalidInput(format!(
            "update size mismatch: expected {}, got {}",
            asset.size,
            bytes.len()
        )));
    }
    let actual = format!("{:x}", Sha256::digest(&bytes));
    if !actual.eq_ignore_ascii_case(&asset.sha256) {
        return Err(CoreError::InvalidInput(format!(
            "update SHA256 mismatch: expected {}, got {actual}",
            asset.sha256
        )));
    }
    Ok(())
}
