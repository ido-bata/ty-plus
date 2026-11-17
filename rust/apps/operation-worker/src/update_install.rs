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
use ty_plus_protocol::{RequestEnvelope, StableErrorCode};

use crate::install_lease;
use crate::{CancellationToken, EventSink};

const MAX_ASSET_BYTES: u64 = 256 * 1024 * 1024;
const MAX_ZIP_ENTRIES: usize = 20_000;
const MAX_ZIP_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const SWAP_LEASE_DEADLINE: Duration = Duration::from_secs(30);
const PENDING_MARKER_NAME: &str = ".ty-plus-update-pending.json";
const STAGING_DIR_NAME: &str = ".ty-plus-update-staging";
const SWAP_LEASE_FILE_NAME: &str = ".ty-plus-update-swap-lease";
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
    /// Another `update.install` / pending swap holds the swap lease.
    Busy(String),
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
            Self::Busy(d) => write!(f, "update install busy: {d}"),
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

/// `user_safe_detail` must be non-empty, bounded, and free of control
/// characters or `ProtocolError::new` rejects it — which would turn a
/// handled install failure into a worker crash. Sanitize every detail
/// that reaches the wire.
fn safe_detail(raw: &str, fallback: &str) -> String {
    let cleaned: String = raw.chars().filter(|c| !c.is_control()).take(400).collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        fallback.to_owned()
    } else {
        cleaned.to_owned()
    }
}

/// Map an install failure onto the stable wire contract so the panel can
/// distinguish integrity, download, permission, and contention failures
/// (feeds.md: `integrity_mismatch` 相当で中止). Returns
/// `(code, retryable, user_safe_detail)`.
pub fn update_error_wire(error: &UpdateInstallError) -> (StableErrorCode, bool, String) {
    match error {
        UpdateInstallError::InvalidRequest(detail) => (
            StableErrorCode::InvalidRequest,
            false,
            safe_detail(detail, "invalid update install request"),
        ),
        UpdateInstallError::UnsupportedLayout(detail) => (
            StableErrorCode::InternalError,
            false,
            safe_detail(detail, "unsupported install layout"),
        ),
        UpdateInstallError::Io(io_error) => {
            if io_error.kind() == io::ErrorKind::PermissionDenied {
                (
                    StableErrorCode::PermissionDenied,
                    false,
                    "update install permission denied".to_owned(),
                )
            } else {
                (
                    StableErrorCode::InternalError,
                    false,
                    format!("update install io failed: {:?}", io_error.kind()),
                )
            }
        }
        UpdateInstallError::Download(detail) => (
            StableErrorCode::NetworkUnavailable,
            true,
            safe_detail(detail, "update download failed"),
        ),
        UpdateInstallError::IntegrityMismatch => (
            StableErrorCode::IntegrityMismatch,
            false,
            "update asset sha256 mismatch".to_owned(),
        ),
        UpdateInstallError::Archive(detail) => (
            StableErrorCode::RemoteRejected,
            false,
            safe_detail(detail, "update archive rejected"),
        ),
        UpdateInstallError::Busy(detail) => (
            StableErrorCode::Busy,
            true,
            safe_detail(detail, "another update install is in progress"),
        ),
        UpdateInstallError::Install(detail) => (
            StableErrorCode::InternalError,
            false,
            safe_detail(detail, "update install failed"),
        ),
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

/// Dedicated lock file serializing `app.ty-plus` swaps between concurrent
/// `update.install` workers and `apply_pending_update`. It is deliberately
/// NOT the install lease file: every worker holds a *shared* install lease
/// for its lifetime, so an exclusive request on that file would always
/// contend with the caller's own hold (Issue #169). Mutual exclusion
/// against the CEP-side worker-pair installer is still guaranteed by the
/// shared install lease, which blocks any exclusive install-lease holder
/// for the whole duration of this request.
fn update_swap_lease_path(extensions_root: &Path) -> PathBuf {
    extensions_root.join(SWAP_LEASE_FILE_NAME)
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
    extract_release_zip_with_limits(archive_path, dest_dir, MAX_ZIP_ENTRIES, MAX_ZIP_TOTAL_BYTES)
}

fn extract_release_zip_with_limits(
    archive_path: &Path,
    dest_dir: &Path,
    max_entries: usize,
    max_total_bytes: u64,
) -> Result<PathBuf, UpdateInstallError> {
    let file = fs::File::open(archive_path)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| UpdateInstallError::Archive(e.to_string()))?;
    if archive.len() > max_entries {
        return Err(UpdateInstallError::Archive(format!(
            "archive has {} entries (limit {max_entries})",
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
            if total > max_total_bytes {
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

/// Preserve previously shipped worker binaries under `new_versions`.
/// Best-effort by contract: the swap has already succeeded at this point,
/// so a copy failure must not be reported as an install failure (the new
/// tree ships its own current worker version; preserved versions only keep
/// already-spawned panels resolvable until AE restarts).
fn preserve_worker_versions(backup_app: &Path, target: &Path) {
    let old_versions = backup_app.join("worker").join("versions");
    let new_versions = target.join("worker").join("versions");
    if !old_versions.is_dir() {
        return;
    }
    if fs::create_dir_all(&new_versions).is_err() {
        return;
    }
    let Ok(entries) = fs::read_dir(&old_versions) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let destination = new_versions.join(entry.file_name());
        if !destination.exists() {
            let _ = copy_dir_recursive(&entry.path(), &destination);
        }
    }
}

/// Map a swap-step io failure: permission problems stay distinguishable
/// on the wire, everything else is an install failure.
fn swap_io_error(context: &str, error: io::Error) -> UpdateInstallError {
    if error.kind() == io::ErrorKind::PermissionDenied {
        UpdateInstallError::Io(error)
    } else {
        UpdateInstallError::Install(format!("{context}: {error}"))
    }
}

/// Swap `staged_app` into `extensions_root/app.ty-plus`, moving the
/// previous install to `backup_app` first. Worker version directories from
/// the previous install are copied forward (best-effort) so in-flight
/// spawns keep resolving their content-addressed binary.
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
        fs::rename(&target, backup_app)
            .map_err(|e| swap_io_error("cannot move current install aside", e))?;
        SwapOutcome::Swapped
    } else {
        SwapOutcome::FreshInstall
    };
    if let Err(error) = fs::rename(staged_app, &target) {
        // Roll back: restore the previous install so the extension is
        // never left without a working tree. If the restore rename fails,
        // fall back to copying the backup tree back into place.
        if outcome == SwapOutcome::Swapped && fs::rename(backup_app, &target).is_err() {
            let _ = copy_dir_recursive(backup_app, &target);
        }
        return Err(swap_io_error("cannot place staged install", error));
    }
    if outcome == SwapOutcome::Swapped {
        preserve_worker_versions(backup_app, &target);
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
    apply_pending_update_with_deadline(exe, SWAP_LEASE_DEADLINE);
}

fn apply_pending_update_with_deadline(exe: &Path, deadline: Duration) {
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
    // Serialize against an in-flight `update.install` swap. If the lease
    // cannot be acquired the marker stays untouched and the next spawn
    // retries — the swap must never run without the lease (Issue #169).
    let Ok(_lease) =
        install_lease::acquire_exclusive_file(&update_swap_lease_path(&extensions_root), deadline)
    else {
        return;
    };
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

/// Attempt directories younger than this are never swept: a concurrent
/// `update.install` may legitimately be staging into them right now.
const STAGING_SWEEP_MIN_AGE: Duration = Duration::from_secs(60 * 60);

fn unique_attempt_dir_name() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos}", std::process::id())
}

/// Directory the pending marker's staged payload lives in, if any. The
/// marker stores `<attempt>/app.ty-plus`, so the attempt dir is its
/// parent. A legacy marker pointing directly at
/// `.ty-plus-update-staging/app.ty-plus` yields the staging root itself,
/// which disables sweeping entirely (conservative).
fn pending_attempt_dir(extensions_root: &Path, staging_root: &Path) -> Option<PathBuf> {
    let raw = fs::read_to_string(pending_marker_path(extensions_root)).ok()?;
    let marker = serde_json::from_str::<PendingMarker>(&raw).ok()?;
    PathBuf::from(marker.staged_app)
        .parent()
        .map(Path::to_path_buf)
        .filter(|dir| dir != staging_root)
}

/// Remove stale per-attempt staging directories. Skips the attempt dir
/// referenced by the pending marker and anything younger than
/// `STAGING_SWEEP_MIN_AGE` so an in-flight install is never disturbed.
fn cleanup_stale_staging_attempts(staging_root: &Path, keep: Option<&Path>) {
    let Ok(entries) = fs::read_dir(staging_root) else {
        return;
    };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        if keep.is_some_and(|keep| keep == path) {
            continue;
        }
        let fresh = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|mtime| now.duration_since(mtime).ok())
            .is_some_and(|age| age < STAGING_SWEEP_MIN_AGE);
        if fresh {
            continue;
        }
        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_file(&path);
    }
}

fn run_install_inner(
    request: &UpdateInstallRequest,
    exe: &Path,
    fetch: &AssetFetch,
    cancellation: &CancellationToken,
) -> Result<UpdateInstallResult, UpdateInstallError> {
    run_install_inner_with_deadline(request, exe, fetch, cancellation, SWAP_LEASE_DEADLINE)
}

fn run_install_inner_with_deadline(
    request: &UpdateInstallRequest,
    exe: &Path,
    fetch: &AssetFetch,
    cancellation: &CancellationToken,
    lease_deadline: Duration,
) -> Result<UpdateInstallResult, UpdateInstallError> {
    validate_request(request)?;
    let (_, extensions_root) = install_layout_from_exe(exe)?;
    cancellation
        .checkpoint()
        .map_err(|e| UpdateInstallError::Install(format!("cancelled: {e:?}")))?;

    // Each attempt stages into its own directory so two concurrent
    // `update.install` workers cannot clobber each other's payload; the
    // pending marker records the absolute staged path either way.
    let staging_root = extensions_root.join(STAGING_DIR_NAME);
    let keep_attempt = pending_attempt_dir(&extensions_root, &staging_root);
    cleanup_stale_staging_attempts(&staging_root, keep_attempt.as_deref());
    let attempt_dir = staging_root.join(unique_attempt_dir_name());
    fs::create_dir_all(&attempt_dir)?;
    let download_path = attempt_dir.join(format!("asset{DOWNLOAD_SUFFIX}"));
    let staged_app_parent = attempt_dir.clone();

    let result = (|| -> Result<UpdateInstallResult, UpdateInstallError> {
        fetch(&request.asset.url, &download_path, cancellation)?;
        verify_sha256(&download_path, &request.asset.sha256)?;
        let staged_app = extract_release_zip(&download_path, &staged_app_parent)?;
        validate_staged_app(&staged_app, &request.release_version)?;
        let _ = fs::remove_file(&download_path);

        let backup_app = extensions_root
            .join(BACKUP_DIR_NAME)
            .join(EXTENSION_DIR_NAME);
        // The swap lease is a dedicated file, not the install lease: this
        // worker holds the shared install lease for its whole lifetime,
        // so an exclusive request on that file would always self-contend
        // (Issue #169).
        let lease = install_lease::acquire_exclusive_file(
            &update_swap_lease_path(&extensions_root),
            lease_deadline,
        )
        .map_err(|e| match e {
            install_lease::InstallLeaseError::DeadlineExceeded => {
                UpdateInstallError::Busy("another update install is in progress".into())
            }
            other => UpdateInstallError::Install(format!("update swap lease failed: {other:?}")),
        })?;
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

    match &result {
        // `Pending` keeps the attempt dir: the marker references the
        // staged payload inside it for the next spawn.
        Ok(result) if result.status == UpdateInstallStatus::Pending => {}
        _ => {
            // Best-effort cleanup of this attempt's staging; the previous
            // install is untouched because the swap only runs under the
            // lease.
            let _ = fs::remove_dir_all(&attempt_dir);
        }
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
/// payload so the UI can render precise guidance. Failures stay typed so
/// the executor can map them onto stable wire error codes (Issue #169).
pub fn dispatch_update_install(
    request: &RequestEnvelope,
    payload: UpdateInstallRequest,
    cancellation: &CancellationToken,
    _events: &mut dyn EventSink,
) -> Result<serde_json::Value, UpdateInstallError> {
    request
        .context
        .host_context
        .validate()
        .map_err(|e| UpdateInstallError::InvalidRequest(e.to_string()))?;
    let exe = std::env::current_exe()?;
    let (_, extensions_root) = install_layout_from_exe(&exe)?;
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
            .map_err(|e| UpdateInstallError::Install(e.to_string()));
        }
    }
    let result = run_install_inner(&payload, &exe, &download_asset, cancellation)?;
    serde_json::to_value(result).map_err(|e| UpdateInstallError::Install(e.to_string()))
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

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "ty-plus-update-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn exe_fixture(root: &Path) -> PathBuf {
        root.join("extensions")
            .join(EXTENSION_DIR_NAME)
            .join("worker/versions/deadbeef")
            .join(current_platform())
            .join(if current_platform() == "windows" {
                "operation-worker.exe"
            } else {
                "operation-worker"
            })
    }

    fn ext_root(root: &Path) -> PathBuf {
        root.join("extensions")
    }

    fn install_root(root: &Path) -> PathBuf {
        ext_root(root).join(EXTENSION_DIR_NAME)
    }

    fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(io::Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        for (name, data) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }

    /// Entries for a staged app that passes `validate_staged_app` for
    /// `release_version` "0.10.2".
    fn valid_release_entries() -> Vec<(&'static str, &'static [u8])> {
        vec![
            (
                "app.ty-plus/CSXS/manifest.xml",
                br#"<ExtensionBundleVersion="0.10.2" />"#.as_slice(),
            ),
            ("app.ty-plus/jsx/ty-plus-host.jsx", b"host".as_slice()),
            ("app.ty-plus/worker/manifest.json", b"{}".as_slice()),
            ("app.ty-plus/LICENSE", b"MIT".as_slice()),
            ("app.ty-plus/THIRD-PARTY-NOTICES.md", b"none".as_slice()),
        ]
    }

    fn platform_request(sha256: &str) -> UpdateInstallRequest {
        let file_name = format!("ty-plus-v0.10.2-{}.zip", current_platform());
        UpdateInstallRequest {
            release_version: "0.10.2".into(),
            tag: "v0.10.2".into(),
            asset: UpdateInstallAsset {
                url: format!("{OFFICIAL_DOWNLOAD_PREFIX}v0.10.2/{file_name}"),
                file_name,
                sha256: sha256.to_owned(),
            },
        }
    }

    #[test]
    fn extract_rejects_traversal_and_foreign_entries() {
        let root = temp_root("zip-unsafe");
        for entries in [
            vec![("app.ty-plus/../evil.txt", b"x".as_slice())],
            vec![("evil.txt", b"x".as_slice())],
            vec![("other/app.ty-plus/file.txt", b"x".as_slice())],
            vec![("/abs/path.txt", b"x".as_slice())],
            vec![("app.ty-plus/../../x.txt", b"x".as_slice())],
        ] {
            let archive = root.join(format!("case-{}.zip", entries[0].0.len()));
            fs::write(&archive, zip_bytes(&entries)).unwrap();
            let dest = root.join(format!("dest-{}", entries[0].0.len()));
            let result = extract_release_zip(&archive, &dest);
            assert!(
                matches!(result, Err(UpdateInstallError::Archive(_))),
                "entries {:?} must be rejected",
                entries.iter().map(|(n, _)| *n).collect::<Vec<_>>()
            );
        }
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn extract_rejects_archive_without_files() {
        let root = temp_root("zip-empty");
        let archive = root.join("empty.zip");
        let mut zip = zip::ZipWriter::new(io::Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        zip.add_directory("app.ty-plus/", options).unwrap();
        fs::write(&archive, zip.finish().unwrap().into_inner()).unwrap();
        let result = extract_release_zip(&archive, &root.join("dest"));
        assert!(matches!(result, Err(UpdateInstallError::Archive(_))));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn extract_enforces_entry_count_and_size_limits() {
        let root = temp_root("zip-limits");
        let entries = valid_release_entries();
        let archive = root.join("release.zip");
        fs::write(&archive, zip_bytes(&entries)).unwrap();

        // Entry-count limit.
        let result = extract_release_zip_with_limits(
            &archive,
            &root.join("dest-count"),
            1,
            MAX_ZIP_TOTAL_BYTES,
        );
        assert!(matches!(result, Err(UpdateInstallError::Archive(_))));

        // Uncompressed-size limit.
        let result =
            extract_release_zip_with_limits(&archive, &root.join("dest-size"), usize::MAX, 1);
        assert!(matches!(result, Err(UpdateInstallError::Archive(_))));
        fs::remove_dir_all(&root).unwrap();
    }

    fn staged_app_fixture(dir: &Path) {
        write_file(
            &dir.join("CSXS/manifest.xml"),
            br#"<ExtensionBundleVersion="0.10.2" />"#,
        );
        write_file(&dir.join("jsx/ty-plus-host.jsx"), b"host");
        write_file(&dir.join("worker/manifest.json"), b"{}");
        write_file(&dir.join("LICENSE"), b"MIT");
        write_file(&dir.join("THIRD-PARTY-NOTICES.md"), b"none");
    }

    #[test]
    fn validate_staged_app_accepts_complete_tree() {
        let root = temp_root("staged-ok");
        let app = root.join(EXTENSION_DIR_NAME);
        staged_app_fixture(&app);
        assert!(validate_staged_app(&app, "0.10.2").is_ok());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn validate_staged_app_rejects_missing_files_and_wrong_version() {
        let root = temp_root("staged-bad");
        let app = root.join(EXTENSION_DIR_NAME);
        staged_app_fixture(&app);
        fs::remove_file(app.join("LICENSE")).unwrap();
        assert!(matches!(
            validate_staged_app(&app, "0.10.2"),
            Err(UpdateInstallError::Archive(_))
        ));

        let app2 = root.join("second").join(EXTENSION_DIR_NAME);
        staged_app_fixture(&app2);
        write_file(
            &app2.join("CSXS/manifest.xml"),
            br#"<ExtensionBundleVersion="9.9.9" />"#,
        );
        assert!(validate_staged_app(&app2, "0.10.2").is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    /// Issue #169 regression: the worker holds a *shared* install lease for
    /// its whole lifetime. An exclusive request on the same file always
    /// self-contends; the swap therefore uses a dedicated lease file and
    /// `run_install_inner` must succeed while the shared lease is held.
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    #[test]
    fn install_inner_succeeds_while_shared_install_lease_is_held() {
        let root = temp_root("lease-regression");
        let exe = exe_fixture(&root);
        let target = install_root(&root);
        write_file(&target.join("CSXS/manifest.xml"), b"old");

        // Same-file exclusive contends — this is the bug being fixed.
        let shared = install_lease::acquire_shared(&target).unwrap();
        assert!(matches!(
            install_lease::acquire_exclusive(&target, Duration::from_millis(50)),
            Err(install_lease::InstallLeaseError::DeadlineExceeded)
        ));
        // The dedicated swap lease file is unaffected by the shared hold.
        let swap_lease = install_lease::acquire_exclusive_file(
            &update_swap_lease_path(&ext_root(&root)),
            Duration::from_secs(2),
        )
        .unwrap();
        drop(swap_lease);

        let entries = valid_release_entries();
        let archive_bytes = zip_bytes(&entries);
        let sha256 = install_lease::sha256_hex(&archive_bytes);
        let fetch = move |_url: &str, dest: &Path, _c: &CancellationToken| {
            fs::write(dest, &archive_bytes).unwrap();
            Ok::<u64, UpdateInstallError>(archive_bytes.len() as u64)
        };
        let cancel = CancellationToken::default();
        let req = platform_request(&sha256);
        let result = run_install_inner(&req, &exe, &fetch, &cancel);
        let result = result.expect("install must succeed while shared lease is held");
        assert_eq!(result.status, UpdateInstallStatus::Installed);
        assert_eq!(
            fs::read_to_string(target.join("CSXS/manifest.xml")).unwrap(),
            r#"<ExtensionBundleVersion="0.10.2" />"#
        );
        // Previous install preserved under the backup dir.
        assert_eq!(
            fs::read_to_string(
                ext_root(&root)
                    .join(BACKUP_DIR_NAME)
                    .join(EXTENSION_DIR_NAME)
                    .join("CSXS/manifest.xml")
            )
            .unwrap(),
            "old"
        );
        drop(shared);
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    #[test]
    fn install_inner_reports_busy_when_swap_lease_is_held() {
        let root = temp_root("lease-busy");
        let exe = exe_fixture(&root);
        write_file(&install_root(&root).join("CSXS/manifest.xml"), b"old");

        let _held = install_lease::acquire_exclusive_file(
            &update_swap_lease_path(&ext_root(&root)),
            Duration::from_secs(30),
        )
        .unwrap();

        let entries = valid_release_entries();
        let archive_bytes = zip_bytes(&entries);
        let sha256 = install_lease::sha256_hex(&archive_bytes);
        let fetch = move |_url: &str, dest: &Path, _c: &CancellationToken| {
            fs::write(dest, &archive_bytes).unwrap();
            Ok::<u64, UpdateInstallError>(archive_bytes.len() as u64)
        };
        let cancel = CancellationToken::default();
        let req = platform_request(&sha256);
        let result =
            run_install_inner_with_deadline(&req, &exe, &fetch, &cancel, Duration::from_millis(50));
        assert!(matches!(result, Err(UpdateInstallError::Busy(_))));
        // The verified payload is discarded on hard failure; the previous
        // install is untouched.
        assert_eq!(
            fs::read_to_string(install_root(&root).join("CSXS/manifest.xml")).unwrap(),
            "old"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    fn pending_fixture(root: &Path) -> (PathBuf, PathBuf, PathBuf) {
        let exe = exe_fixture(root);
        let target = install_root(root);
        write_file(&target.join("CSXS/manifest.xml"), b"old");
        let attempt = ext_root(root)
            .join(STAGING_DIR_NAME)
            .join("pending-attempt");
        let staged_app = attempt.join(EXTENSION_DIR_NAME);
        write_file(&staged_app.join("CSXS/manifest.xml"), b"new");
        let backup_app = ext_root(root)
            .join(BACKUP_DIR_NAME)
            .join(EXTENSION_DIR_NAME);
        let marker = PendingMarker {
            staged_app: staged_app.to_string_lossy().into_owned(),
            backup_app: backup_app.to_string_lossy().into_owned(),
            version: "0.10.2".into(),
        };
        fs::write(
            pending_marker_path(&ext_root(root)),
            serde_json::to_string(&marker).unwrap(),
        )
        .unwrap();
        (exe, target, ext_root(root))
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    #[test]
    fn apply_pending_update_swaps_and_clears_marker() {
        let root = temp_root("pending-ok");
        let (exe, target, ext) = pending_fixture(&root);
        apply_pending_update(&exe);
        assert_eq!(
            fs::read_to_string(target.join("CSXS/manifest.xml")).unwrap(),
            "new"
        );
        assert!(
            !pending_marker_path(&ext).exists(),
            "marker must be removed after a successful swap"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    #[test]
    fn apply_pending_update_keeps_marker_when_swap_lease_is_held() {
        let root = temp_root("pending-busy");
        let (exe, target, ext) = pending_fixture(&root);
        let _held = install_lease::acquire_exclusive_file(
            &update_swap_lease_path(&ext),
            Duration::from_secs(30),
        )
        .unwrap();
        apply_pending_update_with_deadline(&exe, Duration::from_millis(50));
        // No swap without the lease: marker and old install are preserved.
        assert!(pending_marker_path(&ext).exists());
        assert_eq!(
            fs::read_to_string(target.join("CSXS/manifest.xml")).unwrap(),
            "old"
        );
        drop(_held);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn swap_succeeds_when_worker_version_copy_is_impossible() {
        // Post-rename preservation is best-effort: a staged `worker/
        // versions` that is a plain file must not turn a completed swap
        // into a reported failure (Issue #169).
        let root = temp_root("swap-postrename");
        let ext = ext_root(&root);
        let target = install_root(&root);
        write_file(&target.join("CSXS/manifest.xml"), b"old");
        write_file(
            &target.join("worker/versions/aaa/macos/operation-worker"),
            b"old-worker",
        );
        let staged_app = root.join("staging").join(EXTENSION_DIR_NAME);
        write_file(&staged_app.join("CSXS/manifest.xml"), b"new");
        // `worker/versions` exists but is a file, so creating the versions
        // dir inside the swapped tree fails.
        write_file(&staged_app.join("worker/versions"), b"not-a-dir");
        let backup_app = ext.join(BACKUP_DIR_NAME).join(EXTENSION_DIR_NAME);

        let outcome = swap_install(&ext, &staged_app, &backup_app).unwrap();
        assert_eq!(outcome, SwapOutcome::Swapped);
        assert_eq!(
            fs::read_to_string(target.join("CSXS/manifest.xml")).unwrap(),
            "new"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn update_error_wire_maps_variants_to_stable_codes() {
        assert_eq!(
            update_error_wire(&UpdateInstallError::IntegrityMismatch),
            (
                StableErrorCode::IntegrityMismatch,
                false,
                "update asset sha256 mismatch".to_owned()
            )
        );
        assert_eq!(
            update_error_wire(&UpdateInstallError::Download("http 500".into())).0,
            StableErrorCode::NetworkUnavailable
        );
        assert_eq!(
            update_error_wire(&UpdateInstallError::Archive("bad".into())).0,
            StableErrorCode::RemoteRejected
        );
        assert_eq!(
            update_error_wire(&UpdateInstallError::Busy("held".into())).0,
            StableErrorCode::Busy
        );
        assert_eq!(
            update_error_wire(&UpdateInstallError::InvalidRequest("tag".into())).0,
            StableErrorCode::InvalidRequest
        );
        assert_eq!(
            update_error_wire(&UpdateInstallError::Io(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "denied"
            )))
            .0,
            StableErrorCode::PermissionDenied
        );
        // Details must stay wire-safe: control characters stripped.
        let (_, _, detail) = update_error_wire(&UpdateInstallError::Install("bad\npath".into()));
        assert!(!detail.contains('\n'));
        assert!(!detail.is_empty());
    }
}
