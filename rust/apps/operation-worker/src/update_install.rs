//! In-app release installer (`update.install`, Issue #135).
//!
//! Downloads the platform ZIP asset from the official GitHub Release,
//! verifies its sha256 against the feed-reported digest, extracts it, and
//! swaps the `app.ty-plus` extension directory inside the CEP extensions
//! root. The swap is a sibling-directory rename so the running worker
//! binary (content-addressed under `worker/versions/<sha256>/`) is never
//! overwritten in place; previous worker versions are preserved so an
//! already-spawned panel keeps working until AE restarts.
//!
//! Trust note: authenticity rests on HTTPS + the GitHub Release, exactly
//! like the manual ZXP path. The sha256 digest comes from the same
//! Releases API response and therefore proves integrity, not publisher
//! identity (ADR-0004 amendment documented in feeds.md).

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use ty_plus_protocol::RequestEnvelope;

use crate::install_lease;
use crate::{CancellationToken, EventSink};

const MAX_ASSET_BYTES: u64 = 256 * 1024 * 1024;
const MAX_ZIP_ENTRIES: usize = 20_000;
const MAX_ZIP_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const SWAP_LEASE_DEADLINE: Duration = Duration::from_secs(30);
const PENDING_MARKER_NAME: &str = ".ty-plus-update-pending.json";
const STAGING_DIR_NAME: &str = ".ty-plus-update-staging";
const BACKUP_DIR_NAME: &str = ".ty-plus-backup";
const DOWNLOAD_SUFFIX: &str = ".update-download.zip";
const OFFICIAL_DOWNLOAD_PREFIX: &str = "https://github.com/ido-bata/ty-plus/releases/download/";
const EXTENSION_DIR_NAME: &str = "app.ty-plus";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateInstallAsset {
    pub url: String,
    pub file_name: String,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateInstallRequest {
    pub release_version: String,
    pub tag: String,
    pub asset: UpdateInstallAsset,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateInstallStatus {
    /// Staged payload swapped into place during this invocation.
    Installed,
    /// Staged and marked; the swap applies on the next worker spawn.
    Pending,
    /// The current install location is not writable by this user; the
    /// caller must fall back to manual installation instructions.
    ManualRequired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateInstallResult {
    pub status: UpdateInstallStatus,
    pub version: String,
    pub restart_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug)]
pub enum UpdateInstallError {
    InvalidRequest(String),
    UnsupportedLayout(String),
    Io(io::Error),
    Download(String),
    IntegrityMismatch,
    Archive(String),
    Install(String),
}

impl std::fmt::Display for UpdateInstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(d) => write!(f, "invalid update request: {d}"),
            Self::UnsupportedLayout(d) => write!(f, "unsupported install layout: {d}"),
            Self::Io(e) => write!(f, "update install io failed: {e}"),
            Self::Download(d) => write!(f, "update download failed: {d}"),
            Self::IntegrityMismatch => f.write_str("update asset sha256 mismatch"),
            Self::Archive(d) => write!(f, "update archive invalid: {d}"),
            Self::Install(d) => write!(f, "update install failed: {d}"),
        }
    }
}

impl std::error::Error for UpdateInstallError {}

impl From<io::Error> for UpdateInstallError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

fn current_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        "unsupported"
    }
}

/// Semantic-version-ish core (`X.Y.Z`) of a release version. Prerelease
/// channels are rejected: the installer only ships stable assets in R0.
fn numeric_core(version: &str) -> Option<&str> {
    let core = version.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let (major, minor, patch) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some()
        || major.is_empty()
        || minor.is_empty()
        || patch.is_empty()
        || ![major, minor, patch]
            .iter()
            .all(|p| p.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    Some(core)
}

fn validate_request(request: &UpdateInstallRequest) -> Result<(), UpdateInstallError> {
    let platform = current_platform();
    if platform == "unsupported" {
        return Err(UpdateInstallError::UnsupportedLayout(
            "platform is not windows or macos".into(),
        ));
    }
    let core = numeric_core(&request.release_version).ok_or_else(|| {
        UpdateInstallError::InvalidRequest(format!(
            "release_version {:?} has no numeric core",
            request.release_version
        ))
    })?;
    if request.tag != format!("v{core}") {
        return Err(UpdateInstallError::InvalidRequest(format!(
            "tag {:?} does not match release_version {:?}",
            request.tag, request.release_version
        )));
    }
    let expected_name = format!("ty-plus-{tag}-{platform}.zip", tag = request.tag);
    if request.asset.file_name != expected_name {
        return Err(UpdateInstallError::InvalidRequest(format!(
            "asset file_name {:?} is not the {platform} zip for {}",
            request.asset.file_name, request.tag
        )));
    }
    if !request.asset.url.starts_with(OFFICIAL_DOWNLOAD_PREFIX)
        || !request
            .asset
            .url
            .ends_with(&format!("/{}", request.asset.file_name))
    {
        return Err(UpdateInstallError::InvalidRequest(
            "asset url is not the official GitHub download for this file".into(),
        ));
    }
    if request.asset.sha256.len() != 64
        || !request.asset.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(UpdateInstallError::InvalidRequest(
            "asset sha256 must be 64 hex chars".into(),
        ));
    }
    Ok(())
}

/// `.../app.ty-plus` from the running executable, plus its parent
/// (the CEP extensions root). Mirrors `install_lease`'s layout contract.
fn install_layout_from_exe(exe: &Path) -> Result<(PathBuf, PathBuf), UpdateInstallError> {
    let installation_root =
        install_lease::installation_root_from_executable(exe).ok_or_else(|| {
            UpdateInstallError::UnsupportedLayout(
                "worker executable is not inside an app.ty-plus install".into(),
            )
        })?;
    if installation_root.file_name().and_then(|n| n.to_str()) != Some(EXTENSION_DIR_NAME) {
        return Err(UpdateInstallError::UnsupportedLayout(format!(
            "install root is not named {EXTENSION_DIR_NAME}"
        )));
    }
    let extensions_root = installation_root
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            UpdateInstallError::UnsupportedLayout(
                "install root has no parent extensions directory".into(),
            )
        })?;
    Ok((installation_root, extensions_root))
}

fn download_asset(
    url: &str,
    dest: &Path,
    cancellation: &CancellationToken,
) -> Result<u64, UpdateInstallError> {
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .user_agent("ty-plus-operation-worker")
        .build()
        .map_err(|e| UpdateInstallError::Download(e.to_string()))?
        .get(url)
        .send()
        .map_err(|e| UpdateInstallError::Download(e.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(UpdateInstallError::Download(format!(
            "asset download returned HTTP {status}"
        )));
    }
    if let Some(len) = response.content_length() {
        if len > MAX_ASSET_BYTES {
            return Err(UpdateInstallError::Download(format!(
                "asset exceeds {MAX_ASSET_BYTES} byte limit"
            )));
        }
    }
    let mut file = fs::File::create(dest)?;
    let mut written = 0_u64;
    let mut reader = response;
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        cancellation
            .checkpoint()
            .map_err(|e| UpdateInstallError::Download(format!("cancelled: {e}")))?;
        let n = reader
            .read(&mut buffer)
            .map_err(|e| UpdateInstallError::Download(e.to_string()))?;
        if n == 0 {
            break;
        }
        written += n as u64;
        if written > MAX_ASSET_BYTES {
            return Err(UpdateInstallError::Download(format!(
                "asset exceeds {MAX_ASSET_BYTES} byte limit"
            )));
        }
        file.write_all(&buffer[..n])?;
    }
    file.flush()?;
    Ok(written)
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), UpdateInstallError> {
    let bytes = fs::read(path)?;
    let actual = install_lease::sha256_hex(&bytes);
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(UpdateInstallError::IntegrityMismatch);
    }
    Ok(())
}

/// Extract a release ZIP into `dest_dir`. Every entry must live under the
/// single top-level `app.ty-plus/` directory; traversal and absolute paths
/// are rejected via `enclosed_name` plus an explicit prefix check.
fn extract_release_zip(
    archive_path: &Path,
    dest_dir: &Path,
) -> Result<PathBuf, UpdateInstallError> {
    let file = fs::File::open(archive_path)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| UpdateInstallError::Archive(e.to_string()))?;
    if archive.len() > MAX_ZIP_ENTRIES {
        return Err(UpdateInstallError::Archive(format!(
            "archive has {} entries (limit {MAX_ZIP_ENTRIES})",
            archive.len()
        )));
    }
    let mut total = 0_u64;
    let mut saw_extension = false;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| UpdateInstallError::Archive(e.to_string()))?;
        let Some(relative) = entry.enclosed_name() else {
            return Err(UpdateInstallError::Archive(format!(
                "unsafe path in archive entry {index}"
            )));
        };
        let mut components = relative.components();
        match components.next() {
            Some(Component::Normal(top)) if top == EXTENSION_DIR_NAME => {}
            _ => {
                return Err(UpdateInstallError::Archive(format!(
                    "archive entry {index} is outside {EXTENSION_DIR_NAME}/"
                )));
            }
        }
        // Reject anything that is not a plain file or directory inside the tree.
        for component in components {
            match component {
                Component::Normal(_) => {}
                _ => {
                    return Err(UpdateInstallError::Archive(format!(
                        "archive entry {index} has an unsafe path component"
                    )));
                }
            }
        }
        let target = dest_dir.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out = fs::File::create(&target)?;
        let mut buffer = vec![0_u8; 64 * 1024];
        loop {
            let n = entry
                .read(&mut buffer)
                .map_err(|e| UpdateInstallError::Archive(e.to_string()))?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > MAX_ZIP_TOTAL_BYTES {
                return Err(UpdateInstallError::Archive(
                    "archive expands beyond size limit".into(),
                ));
            }
            out.write_all(&buffer[..n])?;
        }
        saw_extension = true;
    }
    if !saw_extension {
        return Err(UpdateInstallError::Archive(
            "archive contains no files".into(),
        ));
    }
    Ok(dest_dir.join(EXTENSION_DIR_NAME))
}

/// Post-extraction sanity checks mirroring `verify-release-artifacts`:
/// manifest, bundle version, host jsx, and worker manifest must exist and
/// agree with the requested version.
fn validate_staged_app(app_dir: &Path, release_version: &str) -> Result<(), UpdateInstallError> {
    let core = numeric_core(release_version).ok_or_else(|| {
        UpdateInstallError::InvalidRequest("release_version has no numeric core".into())
    })?;
    let manifest_path = app_dir.join("CSXS").join("manifest.xml");
    let manifest = fs::read_to_string(&manifest_path)
        .map_err(|_| UpdateInstallError::Archive("staged app lacks CSXS/manifest.xml".into()))?;
    let expected = format!("ExtensionBundleVersion=\"{core}\"");
    if !manifest.contains(&expected) {
        return Err(UpdateInstallError::Archive(format!(
            "staged manifest bundle version is not {core}"
        )));
    }
    for required in [
        "jsx/ty-plus-host.jsx",
        "worker/manifest.json",
        "LICENSE",
        "THIRD-PARTY-NOTICES.md",
    ] {
        if !app_dir.join(required).is_file() {
            return Err(UpdateInstallError::Archive(format!(
                "staged app lacks {required}"
            )));
        }
    }
    Ok(())
}

/// Recursively copy `src` to `dst` (used only to preserve worker version
/// directories across the swap; rename is preferred for the swap itself).
fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Outcome of one swap attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapOutcome {
    /// Target replaced; caller is running from the backup path now.
    Swapped,
    /// Target did not exist; staged payload moved into place.
    FreshInstall,
}

/// Swap `staged_app` into `extensions_root/app.ty-plus`, moving the
/// previous install to `backup_app` first. Worker version directories from
/// the previous install are copied forward so in-flight spawns keep
/// resolving their content-addressed binary.
fn swap_install(
    extensions_root: &Path,
    staged_app: &Path,
    backup_app: &Path,
) -> Result<SwapOutcome, UpdateInstallError> {
    let target = extensions_root.join(EXTENSION_DIR_NAME);
    if backup_app.exists() {
        fs::remove_dir_all(backup_app)?;
    }
    let outcome = if target.exists() {
        if let Some(parent) = backup_app.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&target, backup_app).map_err(|e| {
            UpdateInstallError::Install(format!("cannot move current install aside: {e}"))
        })?;
        SwapOutcome::Swapped
    } else {
        SwapOutcome::FreshInstall
    };
    if let Err(error) = fs::rename(staged_app, &target) {
        // Roll back: restore the previous install so the extension is
        // never left without a working tree.
        if outcome == SwapOutcome::Swapped {
            let _ = fs::rename(backup_app, &target);
        }
        return Err(UpdateInstallError::Install(format!(
            "cannot place staged install: {error}"
        )));
    }
    if outcome == SwapOutcome::Swapped {
        // Preserve previously shipped worker binaries: an old panel may
        // still resolve `worker/versions/<old-sha>/<platform>/...` until
        // AE restarts. Missing versions are copied from the backup.
        let old_versions = backup_app.join("worker").join("versions");
        let new_versions = target.join("worker").join("versions");
        if old_versions.is_dir() {
            fs::create_dir_all(&new_versions)?;
            for entry in fs::read_dir(&old_versions)? {
                let entry = entry?;
                if !entry.file_type()?.is_dir() {
                    continue;
                }
                let destination = new_versions.join(entry.file_name());
                if !destination.exists() {
                    copy_dir_recursive(&entry.path(), &destination)?;
                }
            }
        }
    }
    Ok(outcome)
}

#[derive(Debug, Serialize, Deserialize)]
struct PendingMarker {
    staged_app: String,
    backup_app: String,
    version: String,
}

fn pending_marker_path(extensions_root: &Path) -> PathBuf {
    extensions_root.join(PENDING_MARKER_NAME)
}

/// Best-effort swap of a previously staged payload. Runs at worker
/// startup so a locked-file failure during `update.install` still
/// converges on the next spawn. Never fails the worker: errors leave the
/// marker in place for the following spawn.
pub fn apply_pending_update(exe: &Path) {
    let Ok((_, extensions_root)) = install_layout_from_exe(exe) else {
        return;
    };
    let marker_path = pending_marker_path(&extensions_root);
    let Ok(raw) = fs::read_to_string(&marker_path) else {
        return;
    };
    let Ok(marker) = serde_json::from_str::<PendingMarker>(&raw) else {
        let _ = fs::remove_file(&marker_path);
        return;
    };
    let staged_app = PathBuf::from(&marker.staged_app);
    let backup_app = PathBuf::from(&marker.backup_app);
    if !staged_app.is_dir() {
        let _ = fs::remove_file(&marker_path);
        return;
    }
    let _lease = install_lease::acquire_exclusive(
        &extensions_root.join(EXTENSION_DIR_NAME),
        SWAP_LEASE_DEADLINE,
    );
    match swap_install(&extensions_root, &staged_app, &backup_app) {
        Ok(_) => {
            let _ = fs::remove_file(&marker_path);
        }
        Err(_) => {
            // Keep the marker: the next spawn retries the swap.
        }
    }
}

fn mark_pending(
    extensions_root: &Path,
    staged_app: &Path,
    backup_app: &Path,
    version: &str,
) -> Result<(), UpdateInstallError> {
    let marker = PendingMarker {
        staged_app: staged_app.to_string_lossy().into_owned(),
        backup_app: backup_app.to_string_lossy().into_owned(),
        version: version.to_string(),
    };
    let raw =
        serde_json::to_string(&marker).map_err(|e| UpdateInstallError::Install(e.to_string()))?;
    fs::write(pending_marker_path(extensions_root), raw)?;
    Ok(())
}

/// Injectable fetch used by tests; production downloads over HTTPS.
pub type AssetFetch = dyn Fn(&str, &Path, &CancellationToken) -> Result<u64, UpdateInstallError>;

fn run_install_inner(
    request: &UpdateInstallRequest,
    exe: &Path,
    fetch: &AssetFetch,
    cancellation: &CancellationToken,
) -> Result<UpdateInstallResult, UpdateInstallError> {
    validate_request(request)?;
    let (installation_root, extensions_root) = install_layout_from_exe(exe)?;
    cancellation
        .checkpoint()
        .map_err(|e| UpdateInstallError::Install(format!("cancelled: {e:?}")))?;

    let staging_root = extensions_root.join(STAGING_DIR_NAME);
    if staging_root.exists() {
        fs::remove_dir_all(&staging_root)?;
    }
    fs::create_dir_all(&staging_root)?;
    let download_path = extensions_root.join(format!("{STAGING_DIR_NAME}{DOWNLOAD_SUFFIX}"));
    let staged_app_parent = staging_root.clone();

    let result = (|| -> Result<UpdateInstallResult, UpdateInstallError> {
        fetch(&request.asset.url, &download_path, cancellation)?;
        verify_sha256(&download_path, &request.asset.sha256)?;
        let staged_app = extract_release_zip(&download_path, &staged_app_parent)?;
        validate_staged_app(&staged_app, &request.release_version)?;
        let _ = fs::remove_file(&download_path);

        let backup_app = extensions_root
            .join(BACKUP_DIR_NAME)
            .join(EXTENSION_DIR_NAME);
        let lease = install_lease::acquire_exclusive(&installation_root, SWAP_LEASE_DEADLINE)
            .map_err(|e| UpdateInstallError::Install(format!("install lease failed: {e:?}")))?;
        match swap_install(&extensions_root, &staged_app, &backup_app) {
            Ok(_) => Ok(UpdateInstallResult {
                status: UpdateInstallStatus::Installed,
                version: request.release_version.clone(),
                restart_required: true,
                reason: None,
            }),
            Err(error) => {
                drop(lease);
                // Leave the verified payload staged and mark it pending so
                // the next worker spawn retries the swap (e.g. a file was
                // momentarily locked by the running panel).
                if mark_pending(
                    &extensions_root,
                    &staged_app,
                    &backup_app,
                    &request.release_version,
                )
                .is_ok()
                {
                    Ok(UpdateInstallResult {
                        status: UpdateInstallStatus::Pending,
                        version: request.release_version.clone(),
                        restart_required: true,
                        reason: Some("swap deferred to next worker spawn".into()),
                    })
                } else {
                    Err(error)
                }
            }
        }
    })();

    if result.is_err() {
        // Best-effort cleanup of partial staging; the previous install is
        // untouched because the swap only runs under the lease.
        let _ = fs::remove_dir_all(&staging_root);
        let _ = fs::remove_file(&download_path);
    }
    result
}

/// Entry point used by the executor. Network access is only attempted for
/// a request that already passed `validate_request`.
pub fn install_update(
    request: &UpdateInstallRequest,
    cancellation: &CancellationToken,
) -> Result<UpdateInstallResult, UpdateInstallError> {
    let exe = std::env::current_exe()?;
    run_install_inner(request, &exe, &download_asset, cancellation)
}

/// Protocol dispatch: validates the wire payload, runs the install, and
/// maps handled outcomes (including `manual_required`) into the success
/// payload so the UI can render precise guidance.
pub fn dispatch_update_install(
    request: &RequestEnvelope,
    payload: UpdateInstallRequest,
    cancellation: &CancellationToken,
    _events: &mut dyn EventSink,
) -> Result<serde_json::Value, String> {
    request
        .context
        .host_context
        .validate()
        .map_err(|e| e.to_string())?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let (_, extensions_root) = install_layout_from_exe(&exe).map_err(|e| e.to_string())?;
    // A non-writable extensions root (e.g. `/Library/...` or
    // `Program Files`) cannot be replaced by this user. Probe once before
    // downloading 15 MB: creating a temp file is the cheapest writability
    // check that does not disturb the install.
    let probe = extensions_root.join(format!("{STAGING_DIR_NAME}.probe"));
    match fs::File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
        }
        Err(_) => {
            return serde_json::to_value(UpdateInstallResult {
                status: UpdateInstallStatus::ManualRequired,
                version: payload.release_version.clone(),
                restart_required: false,
                reason: Some(
                    "extension install directory is not writable; use manual ZXP install".into(),
                ),
            })
            .map_err(|e| e.to_string());
        }
    }
    match run_install_inner(&payload, &exe, &download_asset, cancellation) {
        Ok(result) => serde_json::to_value(result).map_err(|e| e.to_string()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn request_fixture() -> UpdateInstallRequest {
        UpdateInstallRequest {
            release_version: "0.10.2".into(),
            tag: "v0.10.2".into(),
            asset: UpdateInstallAsset {
                url: "https://github.com/ido-bata/ty-plus/releases/download/v0.10.2/ty-plus-v0.10.2-macos.zip".into(),
                file_name: "ty-plus-v0.10.2-macos.zip".into(),
                sha256: "a".repeat(64),
            },
        }
    }

    #[test]
    fn validate_accepts_official_stable_asset() {
        // current_platform is macos on this host only when tests run there;
        // validation of the name pattern is platform-dependent, so assert
        // the parts that are platform-independent.
        let mut req = request_fixture();
        req.asset.file_name = format!("ty-plus-v0.10.2-{}.zip", current_platform());
        req.asset.url = format!("{OFFICIAL_DOWNLOAD_PREFIX}v0.10.2/{}", req.asset.file_name);
        assert!(validate_request(&req).is_ok());
    }

    #[test]
    fn validate_rejects_wrong_tag_and_name() {
        let mut req = request_fixture();
        req.tag = "v0.10.3".into();
        assert!(validate_request(&req).is_err());
        let mut req = request_fixture();
        req.asset.file_name = "evil.zip".into();
        assert!(validate_request(&req).is_err());
        let mut req = request_fixture();
        req.asset.url = "https://evil.example.com/x.zip".into();
        assert!(validate_request(&req).is_err());
        let mut req = request_fixture();
        req.release_version = "0.10.2-insider.1".into();
        req.tag = "v0.10.2-insider.1".into();
        assert!(validate_request(&req).is_err());
    }

    #[test]
    fn numeric_core_extracts_semver() {
        assert_eq!(numeric_core("0.10.2"), Some("0.10.2"));
        assert_eq!(numeric_core("1.2.3-beta.4"), Some("1.2.3"));
        assert_eq!(numeric_core("0.10"), None);
        assert_eq!(numeric_core("x.y.z"), None);
    }

    fn write_file(path: &Path, contents: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn swap_replaces_target_and_preserves_worker_versions() {
        let root = std::env::temp_dir().join(format!(
            "ty-plus-update-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let ext_root = root.join("extensions");
        let target = ext_root.join(EXTENSION_DIR_NAME);
        let staged_parent = root.join("staging");
        let staged_app = staged_parent.join(EXTENSION_DIR_NAME);
        let backup_app = ext_root.join(BACKUP_DIR_NAME).join(EXTENSION_DIR_NAME);

        // Old install with a content-addressed worker version.
        write_file(&target.join("CSXS/manifest.xml"), b"old");
        write_file(
            &target.join("worker/versions/aaa111/macos/operation-worker"),
            b"old-worker",
        );
        // Staged new install.
        write_file(&staged_app.join("CSXS/manifest.xml"), b"new");
        write_file(
            &staged_app.join("worker/versions/bbb222/macos/operation-worker"),
            b"new-worker",
        );

        let outcome = swap_install(&ext_root, &staged_app, &backup_app).unwrap();
        assert_eq!(outcome, SwapOutcome::Swapped);
        assert_eq!(
            fs::read_to_string(target.join("CSXS/manifest.xml")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(backup_app.join("CSXS/manifest.xml")).unwrap(),
            "old"
        );
        // Old worker version preserved inside the new tree.
        assert!(
            target
                .join("worker/versions/aaa111/macos/operation-worker")
                .is_file()
        );
        assert!(
            target
                .join("worker/versions/bbb222/macos/operation-worker")
                .is_file()
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn swap_rolls_back_when_target_rename_fails() {
        // A staged_app that does not exist makes the second rename fail
        // after the backup move; the previous install must be restored.
        let root = std::env::temp_dir().join(format!(
            "ty-plus-update-rollback-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let ext_root = root.join("extensions");
        let target = ext_root.join(EXTENSION_DIR_NAME);
        let backup_app = ext_root.join(BACKUP_DIR_NAME).join(EXTENSION_DIR_NAME);
        write_file(&target.join("CSXS/manifest.xml"), b"old");
        let missing_staged = root.join("staging").join(EXTENSION_DIR_NAME);

        let result = swap_install(&ext_root, &missing_staged, &backup_app);
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(target.join("CSXS/manifest.xml")).unwrap(),
            "old"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn install_inner_rejects_hash_mismatch_without_touching_target() {
        let root = std::env::temp_dir().join(format!(
            "ty-plus-update-hash-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let exe = root
            .join("extensions")
            .join(EXTENSION_DIR_NAME)
            .join("worker/versions/ccc333")
            .join(current_platform())
            .join(if current_platform() == "windows" {
                "operation-worker.exe"
            } else {
                "operation-worker"
            });
        fs::create_dir_all(exe.parent().unwrap()).unwrap();
        fs::write(&exe, b"fake-worker").unwrap();
        write_file(
            &root
                .join("extensions")
                .join(EXTENSION_DIR_NAME)
                .join("CSXS/manifest.xml"),
            b"old",
        );

        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let calls_clone = std::sync::Arc::clone(&calls);
        let fetch = move |_url: &str, dest: &Path, _c: &CancellationToken| {
            calls_clone.fetch_add(1, Ordering::SeqCst);
            fs::write(dest, b"not-the-real-zip").unwrap();
            Ok::<u64, UpdateInstallError>(15)
        };
        let cancel = CancellationToken::default();
        let mut req = request_fixture();
        req.asset.file_name = format!("ty-plus-v0.10.2-{}.zip", current_platform());
        req.asset.url = format!("{OFFICIAL_DOWNLOAD_PREFIX}v0.10.2/{}", req.asset.file_name);
        let result = run_install_inner(&req, &exe, &fetch, &cancel);
        assert!(matches!(result, Err(UpdateInstallError::IntegrityMismatch)));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        // Previous install untouched.
        assert!(
            root.join("extensions")
                .join(EXTENSION_DIR_NAME)
                .join("CSXS/manifest.xml")
                .is_file()
        );
        fs::remove_dir_all(&root).unwrap();
    }
}
