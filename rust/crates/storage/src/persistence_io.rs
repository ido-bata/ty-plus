//! Persistence I/O handler.
//!
//! This module provides the Rust-side handler for persistence I/O operations,
//! matching the TypeScript persistence layer's path resolution and data formats.

use std::path::{Path, PathBuf};

use crate::{MutationContext, RegisteredPath, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ty_plus_host_filesystem::platform::read_entry;

/// Request to read JSON from persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceReadJsonRequest {
    pub key: String,
    pub args: Vec<String>,
}

/// Response for reading JSON from persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceReadJsonResponse {
    pub value: Option<Value>,
}

/// Request to read text from persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceReadTextRequest {
    pub key: String,
    pub args: Vec<String>,
}

/// Response for reading text from persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceReadTextResponse {
    pub text: Option<String>,
}

/// Request to write JSON to persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceWriteJsonRequest {
    pub key: String,
    pub args: Vec<String>,
    pub value: Value,
}

/// Request to remove (delete) a persistence file.
///
/// Removal is **idempotent** — a missing file is reported back to the caller
/// as a successful no-op (the file is "already in the desired state"), so
/// callers can use this primitive to restore a "file did not exist before"
/// rollback path without having to probe for the file's presence first.
/// A non-ENOENT I/O error (EACCES, EBUSY, …) is propagated to the caller so
/// the rollback can surface a real failure (Issue #146 / Blocker 9).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistenceRemoveJsonRequest {
    pub key: String,
    pub args: Vec<String>,
}

/// Persistence I/O handler that manages file operations.
pub struct PersistenceIoHandler {
    root: String,
}

/// Resolve a file path from a persistence key and arguments.
///
/// This matches the TypeScript `persistence/paths.ts` path templates.
pub fn resolve_path(key: &str, args: &[String], root: &Path) -> Option<PathBuf> {
    match key {
        // settings/
        "app" => Some(root.join("settings/app.json")),
        "paths" => Some(root.join("settings/paths.json")),
        "ui" => Some(root.join("settings/ui.json")),
        "controlPanel" => Some(root.join("settings/control-panel.json")),

        // catalogs
        "presetCatalog" => Some(root.join("presets/presets.json")),
        "groupCatalog" => Some(root.join("groups/groups.json")),
        "widgetRecords" => Some(root.join("widgets/widgets.json")),
        "widgetState" => {
            let name = args.first()?;
            Some(root.join(format!("widgets/state/{name}.json")))
        }

        // workspaces/
        "workspace" => {
            let i = args.first()?;
            Some(root.join(format!("workspaces/workspace-{i}.json")))
        }
        "workspaceBg" => {
            let i = args.first()?;
            Some(root.join(format!("workspaces/background/background-{i}.json")))
        }
        "snapshots" => Some(root.join("workspaces/history/snapshots.json")),

        // panels/
        "panelChrome" => {
            let i = args.first()?;
            Some(root.join(format!("panels/panel-{i}.json")))
        }

        // clipboard/
        "clipboard" => Some(root.join("clipboard/clipboard.json")),

        // tool-handoff/
        "toolHandoff" => {
            let extension_id = args.first()?;
            Some(root.join(format!("tool-handoff/{extension_id}.json")))
        }

        // cache/
        "notifications" => Some(root.join("cache/notifications.json")),
        "remotePresets" => Some(root.join("cache/remote-presets.json")),
        "publicLinks" => Some(root.join("cache/public-links.json")),
        "candidates" => Some(root.join("cache/candidates.json")),
        "candidatesChunk" => {
            let id = args.first()?;
            Some(root.join(format!("cache/candidates/{id}.json")))
        }

        _ => None,
    }
}

/// Read a JSON file and parse it.
#[cfg(test)]
pub fn read_json(path: &Path) -> Result<Option<Value>, std::io::Error> {
    if !path.exists() {
        return Ok(None);
    }

    let text = std::fs::read_to_string(path)?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    match serde_json::from_str(trimmed) {
        Ok(value) => Ok(Some(value)),
        Err(_) => Ok(None),
    }
}

/// Read a file as raw text.
#[cfg(test)]
pub fn read_text(path: &Path) -> Result<Option<String>, std::io::Error> {
    if !path.exists() {
        return Ok(None);
    }

    let text = std::fs::read_to_string(path)?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

/// Write a JSON value to a file.
#[cfg(test)]
fn write_json(path: &Path, value: &Value) -> Result<(), std::io::Error> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let text = serde_json::to_string_pretty(value)?;
    // Add trailing newline to match TypeScript format
    let text = format!("{text}\n");
    std::fs::write(path, text)
}

/// Writes persistence JSON through the managed-root transaction capability.
pub fn write_json_managed(
    context: &MutationContext<'_>,
    key: &str,
    args: &[String],
    value: &Value,
) -> Result<(), std::io::Error> {
    let relative = resolve_path(key, args, Path::new("")).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "unknown persistence key")
    })?;
    let relative = RegisteredPath::new(relative).map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
    })?;
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    let mut transaction =
        Transaction::prepare(context.guard(), relative, context.invocation_id().clone())
            .map_err(|error| std::io::Error::other(error.to_string()))?;
    transaction
        .write_all(&bytes)
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    transaction
        .flush()
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    Ok(())
}

impl PersistenceIoHandler {
    /// Create a new persistence I/O handler with the given root directory.
    pub fn new(root: String) -> Self {
        Self { root }
    }

    /// Returns the validated managed root for caller-owned mutation locking.
    pub fn managed_root(&self) -> Result<crate::ManagedRoot, std::io::Error> {
        crate::ManagedRoot::new(Path::new(&self.root))
            .map_err(|error| std::io::Error::other(error.to_string()))
    }

    /// Read JSON from persistence.
    pub fn read_json(
        &self,
        request: PersistenceReadJsonRequest,
    ) -> Result<PersistenceReadJsonResponse, std::io::Error> {
        let relative =
            resolve_path(&request.key, &request.args, Path::new("")).ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("unknown key: {}", request.key),
                )
            })?;
        let relative = RegisteredPath::new(relative).map_err(|error| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
        })?;
        let value = match read_entry(Path::new(&self.root), relative.as_path()) {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    serde_json::from_str(trimmed).ok()
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        Ok(PersistenceReadJsonResponse { value })
    }

    /// Read text from persistence.
    pub fn read_text(
        &self,
        request: PersistenceReadTextRequest,
    ) -> Result<PersistenceReadTextResponse, std::io::Error> {
        let relative =
            resolve_path(&request.key, &request.args, Path::new("")).ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("unknown key: {}", request.key),
                )
            })?;
        let relative = RegisteredPath::new(relative).map_err(|error| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
        })?;
        let text = match read_entry(Path::new(&self.root), relative.as_path()) {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_owned())
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        Ok(PersistenceReadTextResponse { text })
    }

    /// Write JSON to persistence.
    pub fn write_json_with_context(
        &self,
        context: &MutationContext<'_>,
        request: PersistenceWriteJsonRequest,
    ) -> Result<(), std::io::Error> {
        write_json_managed(context, &request.key, &request.args, &request.value)
    }

    #[cfg(test)]
    pub fn write_json(&self, request: PersistenceWriteJsonRequest) -> Result<(), std::io::Error> {
        let root = crate::ManagedRoot::new(Path::new(&self.root))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        let guard = crate::OperationLock::acquire(
            &root,
            std::time::Instant::now() + std::time::Duration::from_secs(5),
        )
        .map_err(|error| std::io::Error::other(error.to_string()))?;
        let invocation = crate::InvocationId::new("test-persistence");
        let context = MutationContext::new(&guard, &invocation);
        self.write_json_with_context(&context, request)
    }

    /// Remove a persistence file while holding the caller's managed-root lock.
    ///
    /// The Transaction API does not yet support delete-as-rewrite, so this
    /// uses `fs::remove_file` directly under the managed root. The caller
    /// must already hold an `OperationLockGuard` (via the supplied
    /// `MutationContext`) so removal participates in the same exclusive
    /// access contract as every other write path: a concurrent
    /// `storage.persistence.write-json` cannot be mid-transaction while
    /// `remove-json` deletes the destination out from under it.
    ///
    /// ENOENT is treated as success (idempotent remove — the file is already
    /// in the "not present" state the rollback wants). Any other I/O error
    /// is propagated to the caller.
    ///
    /// This is the Rust-side counterpart of the TypeScript `removeJson`
    /// primitive used by `applyInterPanelMove`'s null-pre-image rollback
    /// (Issue #146 / Blocker 9). The `args` are passed to `resolve_path` so
    /// every key in the canonical persistence map is reachable.
    pub fn remove_json_with_context(
        &self,
        context: &MutationContext<'_>,
        request: PersistenceRemoveJsonRequest,
    ) -> Result<(), std::io::Error> {
        // Touch the guard so the lock stays held for the duration of the
        // filesystem call — without this the borrow checker could elide the
        // borrow and the removal would race with a concurrent writer.
        let _guard = context.guard();
        let relative =
            resolve_path(&request.key, &request.args, Path::new("")).ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("unknown key: {}", request.key),
                )
            })?;
        let relative = RegisteredPath::new(relative).map_err(|error| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
        })?;
        let absolute = Path::new(&self.root).join(relative.as_path());
        match std::fs::remove_file(&absolute) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    #[cfg(test)]
    pub fn remove_json(&self, request: PersistenceRemoveJsonRequest) -> Result<(), std::io::Error> {
        let root = crate::ManagedRoot::new(Path::new(&self.root))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        let guard = crate::OperationLock::acquire(
            &root,
            std::time::Instant::now() + std::time::Duration::from_secs(5),
        )
        .map_err(|error| std::io::Error::other(error.to_string()))?;
        let invocation = crate::InvocationId::new("test-persistence");
        let context = MutationContext::new(&guard, &invocation);
        self.remove_json_with_context(&context, request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-persistence-test-{suffix}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("failed to create test dir");
        dir
    }

    fn cleanup(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn resolve_path_settings() {
        let root = Path::new("/managed/root");
        assert_eq!(
            resolve_path("app", &[], root),
            Some(PathBuf::from("/managed/root/settings/app.json"))
        );
        assert_eq!(
            resolve_path("ui", &[], root),
            Some(PathBuf::from("/managed/root/settings/ui.json"))
        );
    }

    #[test]
    fn resolve_path_widget_state() {
        let root = Path::new("/managed/root");
        assert_eq!(
            resolve_path("widgetState", &["timeline".to_string()], root),
            Some(PathBuf::from("/managed/root/widgets/state/timeline.json"))
        );
    }

    #[test]
    fn resolve_path_workspace() {
        let root = Path::new("/managed/root");
        assert_eq!(
            resolve_path("workspace", &["1".to_string()], root),
            Some(PathBuf::from("/managed/root/workspaces/workspace-1.json"))
        );
    }

    #[test]
    fn resolve_path_unknown() {
        let root = Path::new("/managed/root");
        assert_eq!(resolve_path("unknown", &[], root), None);
    }

    #[test]
    fn read_json_nonexistent() {
        let path = Path::new("/nonexistent/file.json");
        let result = read_json(path).expect("read should succeed");
        assert!(result.is_none());
    }

    #[test]
    fn read_json_existing() {
        let dir = test_dir("read-json");
        let path = dir.join("test.json");
        fs::write(&path, r#"{"key": "value"}"#).expect("write should succeed");

        let result = read_json(&path).expect("read should succeed");
        assert!(result.is_some());
        assert_eq!(result.unwrap(), serde_json::json!({"key": "value"}));

        cleanup(&dir);
    }

    #[test]
    fn read_json_empty() {
        let dir = test_dir("read-json-empty");
        let path = dir.join("test.json");
        fs::write(&path, "").expect("write should succeed");

        let result = read_json(&path).expect("read should succeed");
        assert!(result.is_none());

        cleanup(&dir);
    }

    #[test]
    fn read_text_nonexistent() {
        let path = Path::new("/nonexistent/file.txt");
        let result = read_text(path).expect("read should succeed");
        assert!(result.is_none());
    }

    #[test]
    fn read_text_existing() {
        let dir = test_dir("read-text");
        let path = dir.join("test.txt");
        fs::write(&path, "hello world").expect("write should succeed");

        let result = read_text(&path).expect("read should succeed");
        assert_eq!(result, Some("hello world".to_string()));

        cleanup(&dir);
    }

    #[test]
    fn write_json_creates_file() {
        let dir = test_dir("write-json");
        let path = dir.join("test.json");
        let value = serde_json::json!({"key": "value"});

        write_json(&path, &value).expect("write should succeed");

        let text = fs::read_to_string(&path).expect("read should succeed");
        assert!(text.contains(r#""key": "value""#));
        assert!(text.ends_with('\n'));

        cleanup(&dir);
    }

    #[test]
    fn write_json_creates_parent_dirs() {
        let dir = test_dir("write-json-dirs");
        let path = dir.join("sub/dir/test.json");
        let value = serde_json::json!({"key": "value"});

        write_json(&path, &value).expect("write should succeed");

        assert!(path.exists());

        cleanup(&dir);
    }
}
