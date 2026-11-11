//! Application folder manifest.
//!
//! This module provides a manifest that tracks all persistent items
//! in the managed storage directory.

use std::path::PathBuf;

use crate::{ManagedRelativePathError, MutationContext, RegisteredPath, Revision, Transaction};
use serde::{Deserialize, Serialize};
use ty_plus_host_filesystem::platform::{
    preflight_directory_all, preflight_entry, read_entry, remove_directory_all, remove_entry,
};

/// Relative locations owned by reset. These paths are all inside the visible
/// managed root; OS scratch storage is intentionally not part of the list.
pub const MANAGED_RESET_PATHS: &[&str] = &[
    "settings",
    "settings-files",
    "workspaces",
    "workspace-snapshots",
    "presets",
    "groups",
    "widgets",
    "widget-states",
    "panel-states",
    "cache",
    "clipboard",
    "i18n-preference",
    "operation-history",
    "workspace-records",
    "workspace-layouts",
    "tool-handoffs",
    "migration-records",
    "migration-fixtures",
    "relocation-requests",
    "relocation-results",
    "diagnostics",
    "control/operation.lock",
    "logs",
];

/// Search-cache directory in the managed tree.
pub const SEARCH_CACHE_RELATIVE_PATH: &str = "cache/search";

/// The kind of managed entry owned by a reset inventory item.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegisteredStorageKind {
    /// A directory scope whose children are owned by the domain.
    Directory,
    /// A JSON key written by a storage domain.
    Json,
    /// The visible control lock entry, which is never a reset target.
    ControlLock,
}

/// A typed, policy-owned managed storage key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisteredStorageKey {
    path: RegisteredPath,
    kind: RegisteredStorageKind,
    resettable: bool,
}

impl RegisteredStorageKey {
    /// Returns the validated relative path capability.
    #[must_use]
    pub fn path(&self) -> &RegisteredPath {
        &self.path
    }

    /// Returns the storage entry kind.
    #[must_use]
    pub const fn kind(&self) -> RegisteredStorageKind {
        self.kind
    }

    /// Returns whether reset may target this entry.
    #[must_use]
    pub const fn resettable(&self) -> bool {
        self.resettable
    }
}

/// A fail-closed error when a reset target is not an inventory member.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResetTargetError {
    /// The input was not a valid managed relative path.
    InvalidPath(ManagedRelativePathError),
    /// The valid relative path is not owned by this policy.
    NotRegistered(PathBuf),
    /// The path is a registered control entry and cannot be reset.
    NotResettable(PathBuf),
}

impl std::fmt::Display for ResetTargetError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPath(error) => write!(formatter, "invalid reset path: {error}"),
            Self::NotRegistered(path) => write!(
                formatter,
                "reset path is not registered: {}",
                path.display()
            ),
            Self::NotResettable(path) => write!(
                formatter,
                "reset path is not resettable: {}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for ResetTargetError {}

/// Result of an explicit reset operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResetOutcome {
    /// At least one owned entry was removed.
    Removed,
    /// The registered target was already absent.
    Missing,
}

/// Errors returned while executing an explicit managed reset.
#[derive(Debug)]
pub enum ResetOperationError {
    /// The target or manifest input was not an owned inventory item.
    Target(ResetTargetError),
    /// The managed-root capability rejected the operation.
    Io(std::io::Error),
    /// The target body/revision pair is corrupt or inconsistent.
    Corrupt { path: PathBuf, detail: String },
}

impl std::fmt::Display for ResetOperationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Target(error) => error.fmt(formatter),
            Self::Io(error) => write!(formatter, "managed reset failed: {error}"),
            Self::Corrupt { path, detail } => write!(
                formatter,
                "managed reset target is corrupt ({}): {detail}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for ResetOperationError {}

/// Storage policy for reset inventory and disposable operation scratch.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ManagedStatePolicy;

impl ManagedStatePolicy {
    /// Returns the persistent managed-root inventory used by reset.
    #[must_use]
    pub const fn reset_inventory(self) -> &'static [&'static str] {
        MANAGED_RESET_PATHS
    }

    /// Returns the only persistent location assigned to search cache data.
    #[must_use]
    pub const fn search_cache_path(self) -> &'static str {
        SEARCH_CACHE_RELATIVE_PATH
    }

    /// Returns the complete reset inventory as validated managed paths.
    ///
    /// The list includes both documented tree scopes and the root-level JSON
    /// keys used by storage domain stores. Callers must use these capabilities
    /// instead of concatenating raw strings.
    #[must_use]
    pub fn registered_items(self) -> Vec<RegisteredStorageKey> {
        self.registered_storage_items()
    }

    /// Returns the complete typed reset inventory.
    #[must_use]
    pub fn registered_storage_items(self) -> Vec<RegisteredStorageKey> {
        MANAGED_RESET_PATHS
            .iter()
            .map(|path| {
                let kind = if *path == "control/operation.lock" {
                    RegisteredStorageKind::ControlLock
                } else if matches!(
                    *path,
                    "settings"
                        | "workspaces"
                        | "presets"
                        | "groups"
                        | "widgets"
                        | "cache"
                        | "logs"
                        | "diagnostics"
                ) {
                    RegisteredStorageKind::Directory
                } else {
                    RegisteredStorageKind::Json
                };
                RegisteredStorageKey {
                    path: crate::RegisteredPath::new(*path)
                        .expect("built-in managed reset path must be relative"),
                    kind,
                    resettable: kind != RegisteredStorageKind::ControlLock,
                }
            })
            .collect()
    }

    /// Resolves a caller-provided candidate only when it exactly matches a
    /// policy-owned, resettable inventory entry.
    pub fn reset_target(
        self,
        candidate: impl Into<PathBuf>,
    ) -> Result<RegisteredStorageKey, ResetTargetError> {
        let candidate = candidate.into();
        let validated = crate::ManagedRelativePath::new(candidate.clone())
            .map_err(ResetTargetError::InvalidPath)?;
        let item = self
            .registered_storage_items()
            .into_iter()
            .find(|item| item.path.as_path() == validated.as_path())
            .ok_or(ResetTargetError::NotRegistered(candidate))?;
        if !item.resettable {
            return Err(ResetTargetError::NotResettable(
                item.path.as_path().to_path_buf(),
            ));
        }
        Ok(item)
    }

    fn registered_item(
        self,
        candidate: impl Into<PathBuf>,
    ) -> Result<RegisteredStorageKey, ResetTargetError> {
        let candidate = candidate.into();
        let validated = crate::ManagedRelativePath::new(candidate.clone())
            .map_err(ResetTargetError::InvalidPath)?;
        self.registered_storage_items()
            .into_iter()
            .find(|item| item.path.as_path() == validated.as_path())
            .ok_or(ResetTargetError::NotRegistered(candidate))
    }

    /// Removes one registered target through the caller-owned managed lock.
    ///
    /// Directory targets are removed recursively through the adjacent
    /// platform no-follow capability. JSON targets remove both their body and
    /// revision sidecar. Missing targets are an explicit safe no-op.
    pub fn reset_with_context(
        self,
        context: &MutationContext<'_>,
        candidate: impl Into<PathBuf>,
    ) -> Result<ResetOutcome, ResetOperationError> {
        let item = self
            .reset_target(candidate)
            .map_err(ResetOperationError::Target)?;
        let outcome = self.preflight_registered_with_context(context, &item)?;
        if outcome == ResetOutcome::Missing {
            return Ok(outcome);
        }
        self.reset_registered_with_context(context, &item)
    }

    fn preflight_registered_with_context(
        &self,
        context: &MutationContext<'_>,
        item: &RegisteredStorageKey,
    ) -> Result<ResetOutcome, ResetOperationError> {
        let root = context.guard().managed_root().as_path();
        match item.kind {
            RegisteredStorageKind::Directory => Ok(
                if preflight_directory_all(root, item.path.as_path())
                    .map_err(ResetOperationError::Io)?
                {
                    ResetOutcome::Removed
                } else {
                    ResetOutcome::Missing
                },
            ),
            RegisteredStorageKind::Json => {
                let body = RegisteredPath::new(item.path.as_path().with_extension("json"))
                    .map_err(|error| ResetOperationError::Corrupt {
                        path: item.path.as_path().to_path_buf(),
                        detail: error.to_string(),
                    })?;
                let revision = RegisteredPath::new(item.path.as_path().with_extension("rev.json"))
                    .map_err(|error| ResetOperationError::Corrupt {
                        path: item.path.as_path().to_path_buf(),
                        detail: error.to_string(),
                    })?;
                let body_present =
                    preflight_entry(root, body.as_path()).map_err(ResetOperationError::Io)?;
                let revision_present =
                    preflight_entry(root, revision.as_path()).map_err(ResetOperationError::Io)?;
                match (body_present, revision_present) {
                    (false, false) => Ok(ResetOutcome::Missing),
                    (true, false) | (false, true) => Err(ResetOperationError::Corrupt {
                        path: item.path.as_path().to_path_buf(),
                        detail: "body and revision must be present together".to_string(),
                    }),
                    (true, true) => {
                        let body_bytes =
                            read_entry(root, body.as_path()).map_err(ResetOperationError::Io)?;
                        serde_json::from_slice::<serde_json::Value>(&body_bytes).map_err(
                            |error| ResetOperationError::Corrupt {
                                path: body.as_path().to_path_buf(),
                                detail: format!("invalid JSON body: {error}"),
                            },
                        )?;
                        let revision_bytes = read_entry(root, revision.as_path())
                            .map_err(ResetOperationError::Io)?;
                        let revision_value = serde_json::from_slice::<serde_json::Value>(
                            &revision_bytes,
                        )
                        .map_err(|error| ResetOperationError::Corrupt {
                            path: revision.as_path().to_path_buf(),
                            detail: format!("invalid revision JSON: {error}"),
                        })?;
                        let valid_revision = revision_value
                            .as_object()
                            .and_then(|object| object.get("revision"))
                            .and_then(serde_json::Value::as_str)
                            .is_some_and(|revision| !revision.is_empty());
                        if !valid_revision {
                            return Err(ResetOperationError::Corrupt {
                                path: revision.as_path().to_path_buf(),
                                detail: "revision field is missing or empty".to_string(),
                            });
                        }
                        let revision_text = revision_value
                            .get("revision")
                            .and_then(serde_json::Value::as_str)
                            .expect("validated revision field");
                        let revision_schema = Revision::from_string(revision_text);
                        if let Err(error) = revision_schema.validate_transaction_shape(&body_bytes)
                        {
                            return Err(ResetOperationError::Corrupt {
                                path: revision.as_path().to_path_buf(),
                                detail: error.to_string(),
                            });
                        }
                        Ok(ResetOutcome::Removed)
                    }
                }
            }
            RegisteredStorageKind::ControlLock => Err(ResetOperationError::Target(
                ResetTargetError::NotResettable(item.path.as_path().to_path_buf()),
            )),
        }
    }

    fn reset_registered_with_context(
        self,
        context: &MutationContext<'_>,
        item: &RegisteredStorageKey,
    ) -> Result<ResetOutcome, ResetOperationError> {
        let root = context.guard().managed_root().as_path();
        match item.kind {
            RegisteredStorageKind::Directory => {
                match remove_directory_all(root, item.path.as_path()) {
                    Ok(()) => Ok(ResetOutcome::Removed),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        Ok(ResetOutcome::Missing)
                    }
                    Err(error) => Err(ResetOperationError::Io(error)),
                }
            }
            RegisteredStorageKind::Json => {
                let mut removed = false;
                for extension in ["json", "rev.json"] {
                    let relative =
                        RegisteredPath::new(item.path.as_path().with_extension(extension))
                            .map_err(|error| {
                                ResetOperationError::Io(std::io::Error::other(error.to_string()))
                            })?;
                    match remove_entry(root, relative.as_path()) {
                        Ok(()) => removed = true,
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                        Err(error) => return Err(ResetOperationError::Io(error)),
                    }
                }
                Ok(if removed {
                    ResetOutcome::Removed
                } else {
                    ResetOutcome::Missing
                })
            }
            RegisteredStorageKind::ControlLock => Err(ResetOperationError::Target(
                ResetTargetError::NotResettable(item.path.as_path().to_path_buf()),
            )),
        }
    }

    /// Validates every manifest item before removing any resettable target.
    ///
    /// An invalid or external-looking item therefore cannot cause a partial
    /// reset of earlier entries.
    pub fn reset_manifest_with_context(
        self,
        context: &MutationContext<'_>,
        manifest: &ApplicationFolderManifest,
    ) -> Result<Vec<ResetOutcome>, ResetOperationError> {
        let mut targets = Vec::new();
        let mut seen = Vec::new();
        for item in &manifest.items {
            let registered = self
                .registered_item(item.path.clone())
                .map_err(ResetOperationError::Target)?;
            if registered.resettable != item.resettable {
                return Err(ResetOperationError::Target(
                    ResetTargetError::NotResettable(registered.path.as_path().to_path_buf()),
                ));
            }
            if seen.iter().any(|path: &PathBuf| {
                path == registered.path.as_path()
                    || path.starts_with(registered.path.as_path())
                    || registered.path.as_path().starts_with(path)
            }) {
                return Err(ResetOperationError::Corrupt {
                    path: registered.path.as_path().to_path_buf(),
                    detail: "manifest contains duplicate or overlapping targets".to_string(),
                });
            }
            seen.push(registered.path.as_path().to_path_buf());
            if item.resettable {
                targets.push(registered);
            }
        }
        let outcomes = targets
            .iter()
            .map(|target| self.preflight_registered_with_context(context, target))
            .collect::<Result<Vec<_>, _>>()?;
        targets
            .iter()
            .zip(outcomes)
            .map(|(target, outcome)| {
                if outcome == ResetOutcome::Removed {
                    self.reset_registered_with_context(context, target)
                } else {
                    Ok(outcome)
                }
            })
            .collect()
    }

    /// Returns the validated managed path assigned to persistent search cache.
    #[must_use]
    pub fn registered_search_cache_path(self) -> crate::RegisteredPath {
        crate::RegisteredPath::new(SEARCH_CACHE_RELATIVE_PATH)
            .expect("built-in search cache path must be relative")
    }

    /// Creates a disposable OS-standard scratch scope for one operation.
    ///
    /// The scope is not a source of truth and removes itself on drop.
    pub fn disposable_scratch(self) -> Result<DisposableScratchScope, std::io::Error> {
        let unique = format!(
            "ty-plus-operation-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let path = std::env::temp_dir().join(unique);
        std::fs::create_dir(&path)?;
        Ok(DisposableScratchScope { path })
    }
}

/// A disposable directory in the OS-standard temporary location.
#[derive(Debug)]
pub struct DisposableScratchScope {
    path: std::path::PathBuf,
}

impl DisposableScratchScope {
    /// Returns the scratch directory path.
    #[must_use]
    pub fn path(&self) -> &std::path::Path {
        &self.path
    }
}

impl Drop for DisposableScratchScope {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

/// A persistent item tracked in the manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManifestItem {
    /// Relative path from the managed root.
    pub path: String,
    /// Human-readable description of the item.
    pub description: String,
    /// Whether this item can be reset.
    pub resettable: bool,
}

/// Application folder manifest.
///
/// This manifest tracks all persistent items in the managed storage
/// directory, enabling reset operations and migration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApplicationFolderManifest {
    /// Manifest version.
    pub version: u32,
    /// All persistent items tracked by this manifest.
    pub items: Vec<ManifestItem>,
}

impl ApplicationFolderManifest {
    /// Creates a new empty manifest.
    #[must_use]
    pub fn new() -> Self {
        Self {
            version: 1,
            items: Vec::new(),
        }
    }

    /// Adds an item to the manifest.
    pub fn add_item(&mut self, item: ManifestItem) {
        self.items.push(item);
    }

    /// Returns all resettable items.
    #[must_use]
    pub fn resettable_items(&self) -> Vec<&ManifestItem> {
        self.items.iter().filter(|item| item.resettable).collect()
    }

    /// Returns the total number of items.
    #[must_use]
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Returns true if the manifest is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Serializes the manifest to JSON.
    ///
    /// # Errors
    ///
    /// Returns `serde_json::Error` if serialization fails.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Deserializes the manifest from JSON.
    ///
    /// # Errors
    ///
    /// Returns `serde_json::Error` if deserialization fails.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Persists the manifest with the same managed-root transaction boundary as
    /// product JSON data.
    pub fn write_managed(
        &self,
        context: &MutationContext<'_>,
        destination: RegisteredPath,
    ) -> Result<(), std::io::Error> {
        let bytes = self
            .to_json()
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        let mut transaction = Transaction::prepare(
            context.guard(),
            destination,
            context.invocation_id().clone(),
        )
        .map_err(|error| std::io::Error::other(error.to_string()))?;
        transaction
            .write_all(bytes.as_bytes())
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        transaction
            .flush()
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        transaction
            .commit()
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        Ok(())
    }
}

impl Default for ApplicationFolderManifest {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_item(path: &str, resettable: bool) -> ManifestItem {
        ManifestItem {
            path: path.to_string(),
            description: format!("Test item at {path}"),
            resettable,
        }
    }

    #[test]
    fn manifest_new_is_empty() {
        let manifest = ApplicationFolderManifest::new();
        assert!(manifest.is_empty());
        assert_eq!(manifest.version, 1);
    }

    #[test]
    fn manifest_add_item() {
        let mut manifest = ApplicationFolderManifest::new();
        manifest.add_item(test_item("cache/search.json", true));
        assert_eq!(manifest.len(), 1);
    }

    #[test]
    fn manifest_resettable_items() {
        let mut manifest = ApplicationFolderManifest::new();
        manifest.add_item(test_item("cache/search.json", true));
        manifest.add_item(test_item("settings.json", false));
        manifest.add_item(test_item("cache/candidates.json", true));

        let resettable = manifest.resettable_items();
        assert_eq!(resettable.len(), 2);
    }

    #[test]
    fn manifest_round_trip_json() {
        let mut manifest = ApplicationFolderManifest::new();
        manifest.add_item(test_item("cache/search.json", true));
        manifest.add_item(test_item("settings.json", false));

        let json = manifest.to_json().expect("serialization should succeed");
        let restored =
            ApplicationFolderManifest::from_json(&json).expect("deserialization should succeed");

        assert_eq!(manifest, restored);
    }
}
