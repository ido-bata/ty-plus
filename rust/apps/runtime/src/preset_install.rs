//! Preset install orchestration: download + verify + same-directory
//! transaction + record commit.
//!
//! This module composes the online download client (which streams and
//! verifies a signed download) with the storage same-directory transaction
//! engine and the local preset catalog. The contract is **no partial
//! success**: a failure at any stage leaves neither a committed asset nor a
//! committed record.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde_json::Value;
use ty_plus_host_filesystem::platform::{read_entry, remove_entry};
use ty_plus_online::config::SupabaseConfig;
use ty_plus_online::download::{
    CancelFlag, DownloadClient, DownloadError, DownloadReceipt, DownloadTransport,
    ReqwestDownloadTransport, SignedDownload,
};
use ty_plus_storage::{
    InvocationId, JsonFileStore, ManagedRoot, MutationContext, OperationLock, RegisteredPath,
    Transaction,
};

/// A preset record committed after the asset is safely on disk.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct PresetRecord {
    /// Local opaque id for the committed row.
    pub id: String,
    /// Effective file type derived from the written extension.
    pub r#type: String,
    /// Display title.
    pub title: String,
    /// Absolute path of the committed asset.
    pub file_path: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional catalog category.
    pub category: Option<String>,
    /// Source cloud preset id for future dedup lookups.
    pub source_catalog_id: String,
}

/// Everything the orchestration needs to install one preset.
#[derive(Debug, Clone)]
pub struct InstallRequest {
    /// Signed download with the integrity contract.
    pub signed: SignedDownload,
    /// Final destination of the asset on disk.
    pub destination: PathBuf,
    /// Record to commit after the asset is committed.
    pub record: PresetRecord,
}

/// Errors produced by the install orchestration.
#[derive(Debug)]
pub enum InstallError {
    /// The download or integrity verification failed.
    Download(DownloadError),
    /// Writing the temp sink failed.
    Write(String),
    /// The same-directory asset commit failed.
    Commit(String),
    /// The record commit failed.
    RecordCommit(String),
    /// The primary operation failed and its compensating cleanup also failed.
    Cleanup {
        /// The original failure.
        primary: Box<Self>,
        /// The cleanup failure, retained for diagnosis and retry.
        cleanup: String,
    },
}

impl std::fmt::Display for InstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Download(error) => write!(f, "download failed: {error}"),
            Self::Write(detail) => write!(f, "install write failed: {detail}"),
            Self::Commit(detail) => write!(f, "asset commit failed: {detail}"),
            Self::RecordCommit(detail) => write!(f, "record commit failed: {detail}"),
            Self::Cleanup { primary, cleanup } => {
                write!(f, "{primary}; cleanup failed: {cleanup}")
            }
        }
    }
}

impl std::error::Error for InstallError {}

/// Commits a preset record after the asset is on disk.
pub trait RecordCommitter {
    /// Persists the record.
    ///
    /// # Errors
    ///
    /// Returns a description of the failure. The orchestration compensates by
    /// removing the just-committed asset so no partial success remains.
    fn commit(&self, record: &PresetRecord, context: &MutationContext<'_>) -> Result<(), String>;
}

/// Default committer that upserts into the local preset catalog file.
///
/// The catalog file uses the project shape `{ "version": 1, "presets": [...] }`
/// matching the TypeScript `presetCatalog` persistence key.
#[derive(Debug, Clone)]
pub struct JsonCatalogCommitter {
    /// Path to `presets/presets.json`.
    catalog_path: PathBuf,
}

impl JsonCatalogCommitter {
    /// Creates a committer targeting the given catalog file.
    #[must_use]
    pub fn new(catalog_path: &Path) -> Self {
        Self {
            catalog_path: catalog_path.to_path_buf(),
        }
    }
}

impl RecordCommitter for JsonCatalogCommitter {
    fn commit(&self, record: &PresetRecord, context: &MutationContext<'_>) -> Result<(), String> {
        let relative = self
            .catalog_path
            .strip_prefix(context.guard().managed_root().as_path())
            .map_err(|_| "catalog must be inside the operation managed root".to_owned())?;
        let relative = RegisteredPath::new(relative).map_err(|error| error.to_string())?;
        let mut catalog: Value =
            match read_entry(context.guard().managed_root().as_path(), relative.as_path()) {
                Ok(bytes) => serde_json::from_slice(&bytes)
                    .unwrap_or_else(|_| serde_json::json!({ "version": 1, "presets": [] })),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    serde_json::json!({ "version": 1, "presets": [] })
                }
                Err(error) => return Err(error.to_string()),
            };

        let presets = catalog["presets"]
            .as_array_mut()
            .ok_or_else(|| "catalog has no presets array".to_string())?;
        let value = serde_json::to_value(record).map_err(|e| e.to_string())?;

        if let Some(existing) = presets.iter_mut().find(|p| p["id"] == record.id) {
            *existing = value;
        } else {
            presets.push(value);
        }

        JsonFileStore::new(context.guard().managed_root().as_path())
            .write_with_context(
                context,
                relative.as_path().to_string_lossy().as_ref(),
                &catalog,
                None,
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

/// Orchestrates download, same-directory asset commit, and record commit.
pub struct PresetInstaller<T = ReqwestDownloadTransport> {
    /// Download client that streams and verifies the signed download.
    client: DownloadClient<T>,
    /// Record committer invoked after the asset commit.
    committer: Box<dyn RecordCommitter>,
}

impl PresetInstaller<ReqwestDownloadTransport> {
    /// Creates an installer with the default transport and a JSON catalog
    /// committer.
    #[must_use]
    pub fn new(config: SupabaseConfig, catalog_path: &Path) -> Self {
        Self {
            client: DownloadClient::with_transport(config, ReqwestDownloadTransport::default()),
            committer: Box::new(JsonCatalogCommitter::new(catalog_path)),
        }
    }
}

impl<T> PresetInstaller<T>
where
    T: DownloadTransport,
{
    /// Creates an installer with an explicit transport and committer.
    #[must_use]
    pub fn with_transport_and_committer(
        config: SupabaseConfig,
        transport: T,
        committer: Box<dyn RecordCommitter>,
    ) -> Self {
        Self {
            client: DownloadClient::with_transport(config, transport),
            committer,
        }
    }

    /// Installs a preset: downloads and verifies into a same-directory temp
    /// file, commits the asset atomically, then commits the record.
    ///
    /// On any failure the temp sink is rolled back and a failed record commit
    /// also removes the just-committed asset, so no partial success remains.
    ///
    /// # Errors
    ///
    /// Returns `InstallError` when the download, asset commit, or record commit
    /// fails.
    #[cfg(test)]
    pub fn install(
        &self,
        request: &InstallRequest,
        cancel: Option<&CancelFlag>,
        on_progress: Option<&dyn Fn(u64, u64)>,
    ) -> Result<DownloadReceipt, InstallError> {
        self.install_with_invocation(
            request,
            &InvocationId::new("test-preset-install"),
            cancel,
            on_progress,
        )
    }

    /// Installs a preset using the invocation identity owned by the caller.
    pub fn install_with_invocation(
        &self,
        request: &InstallRequest,
        invocation_id: &InvocationId,
        cancel: Option<&CancelFlag>,
        on_progress: Option<&dyn Fn(u64, u64)>,
    ) -> Result<DownloadReceipt, InstallError> {
        let parent = request
            .destination
            .parent()
            .ok_or_else(|| InstallError::Write("destination has no parent".to_owned()))?;
        let managed_root =
            ManagedRoot::new(parent).map_err(|error| InstallError::Write(error.to_string()))?;
        let lock = OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(5))
            .map_err(|error| InstallError::Write(error.to_string()))?;
        let filename = request
            .destination
            .file_name()
            .ok_or_else(|| InstallError::Write("destination has no filename".to_owned()))?;
        let destination = RegisteredPath::new(PathBuf::from(filename))
            .map_err(|error| InstallError::Write(error.to_string()))?;
        let mut transaction = Transaction::prepare(&lock, destination, invocation_id.clone())
            .map_err(|error| InstallError::Commit(error.to_string()))?;

        let receipt = {
            let mut sink = Vec::new();
            match self
                .client
                .download(&request.signed, &mut sink, cancel, on_progress)
            {
                Ok(receipt) => {
                    transaction
                        .write_all(&sink)
                        .map_err(|error| InstallError::Write(error.to_string()))?;
                    receipt
                }
                Err(error) => {
                    return match transaction.abort() {
                        Ok(()) => Err(InstallError::Download(error)),
                        Err(cleanup) => Err(InstallError::Cleanup {
                            primary: Box::new(InstallError::Download(error)),
                            cleanup: cleanup.to_string(),
                        }),
                    };
                }
            }
        };

        transaction
            .flush()
            .map_err(|error| InstallError::Commit(error.to_string()))?;
        transaction
            .commit()
            .map_err(|error| InstallError::Commit(error.to_string()))?;

        let context = MutationContext::new(&lock, invocation_id);
        if let Err(detail) = self.committer.commit(&request.record, &context) {
            return match remove_entry(managed_root.as_path(), Path::new(filename)) {
                Ok(()) => Err(InstallError::RecordCommit(detail)),
                Err(cleanup) => Err(InstallError::Cleanup {
                    primary: Box::new(InstallError::RecordCommit(detail)),
                    cleanup: cleanup.to_string(),
                }),
            };
        }

        Ok(receipt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::rc::Rc;
    use std::{cell::RefCell, fs, path::Path};
    use ty_plus_online::download::DownloadResponse;

    fn sha256_hex(bytes: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        let mut out = String::with_capacity(64);
        for byte in Sha256::digest(bytes) {
            out.push_str(&format!("{byte:02x}"));
        }
        out
    }

    fn test_config() -> SupabaseConfig {
        SupabaseConfig::new("https://example.supabase.co".to_string())
            .unwrap()
            .with_media_base_url("https://media.example.com".to_string())
    }

    struct FakeTransport {
        status: u16,
        body: Vec<u8>,
        content_length: Option<u64>,
        final_url: String,
        error: Option<DownloadError>,
        requested: RefCell<Vec<String>>,
    }

    impl FakeTransport {
        fn ok(body: &[u8]) -> Self {
            Self {
                status: 200,
                body: body.to_vec(),
                content_length: Some(body.len() as u64),
                final_url: "https://media.example.com/preset.ffx".to_string(),
                error: None,
                requested: RefCell::new(Vec::new()),
            }
        }

        fn failing(error: DownloadError) -> Self {
            Self {
                status: 200,
                body: Vec::new(),
                content_length: None,
                final_url: "https://media.example.com/preset.ffx".to_string(),
                error: Some(error),
                requested: RefCell::new(Vec::new()),
            }
        }

        fn with_final_url(mut self, final_url: String) -> Self {
            self.final_url = final_url;
            self
        }
    }

    impl DownloadTransport for FakeTransport {
        fn get(
            &self,
            url: &str,
            _allowed_hosts: &[String],
        ) -> Result<DownloadResponse, DownloadError> {
            self.requested.borrow_mut().push(url.to_string());
            if let Some(error) = &self.error {
                return Err(error.clone());
            }
            let body = self.body.clone();
            Ok(DownloadResponse {
                status: self.status,
                final_url: self.final_url.clone(),
                content_length: self.content_length,
                body: Box::new(Cursor::new(body)),
            })
        }
    }

    struct FailingCommitter;

    impl RecordCommitter for FailingCommitter {
        fn commit(
            &self,
            _record: &PresetRecord,
            _context: &MutationContext<'_>,
        ) -> Result<(), String> {
            Err("injected record failure".to_string())
        }
    }

    #[cfg(windows)]
    fn open_exclusive(path: &Path) -> fs::File {
        use std::os::windows::fs::OpenOptionsExt;
        fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(path)
            .unwrap()
    }

    #[cfg(windows)]
    struct DownloadFailureHoldingJournal {
        root: PathBuf,
        holder: Rc<RefCell<Option<fs::File>>>,
    }

    #[cfg(windows)]
    impl DownloadTransport for DownloadFailureHoldingJournal {
        fn get(
            &self,
            _url: &str,
            _allowed_hosts: &[String],
        ) -> Result<DownloadResponse, DownloadError> {
            let journal = fs::read_dir(&self.root)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .find(|path| path.to_string_lossy().ends_with(".journal"))
                .expect("transaction journal must exist before download");
            *self.holder.borrow_mut() = Some(open_exclusive(&journal));
            Err(DownloadError::Transport(
                "injected download failure".to_owned(),
            ))
        }
    }

    #[cfg(windows)]
    struct HoldingFailingCommitter {
        holder: Rc<RefCell<Option<fs::File>>>,
    }

    #[cfg(windows)]
    impl RecordCommitter for HoldingFailingCommitter {
        fn commit(
            &self,
            record: &PresetRecord,
            _context: &MutationContext<'_>,
        ) -> Result<(), String> {
            *self.holder.borrow_mut() = Some(open_exclusive(Path::new(&record.file_path)));
            Err("injected record failure".to_owned())
        }
    }

    struct RecordingCommitter {
        committed: Rc<RefCell<Vec<PresetRecord>>>,
    }

    impl RecordingCommitter {
        fn new() -> Self {
            Self {
                committed: Rc::new(RefCell::new(Vec::new())),
            }
        }
    }

    impl Clone for RecordingCommitter {
        fn clone(&self) -> Self {
            Self {
                committed: Rc::clone(&self.committed),
            }
        }
    }

    impl RecordCommitter for RecordingCommitter {
        fn commit(
            &self,
            record: &PresetRecord,
            _context: &MutationContext<'_>,
        ) -> Result<(), String> {
            self.committed.borrow_mut().push(record.clone());
            Ok(())
        }
    }

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-preset-install-{suffix}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("failed to create test dir");
        dir
    }

    fn request(body: &[u8]) -> (InstallRequest, PathBuf) {
        let dir = test_dir("req");
        let destination = dir.join("presets").join("installed.ffx");
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx?token=abc".to_string(),
            sha256: sha256_hex(body),
            expires_in: Some(3600),
        };
        let record = PresetRecord {
            id: "local-id".to_string(),
            r#type: "preset".to_string(),
            title: "Installed Preset".to_string(),
            file_path: destination.display().to_string(),
            description: Some("from catalog".to_string()),
            category: Some("preset".to_string()),
            source_catalog_id: "cloud-id".to_string(),
        };
        (
            InstallRequest {
                signed,
                destination: destination.clone(),
                record,
            },
            dir,
        )
    }

    #[test]
    fn install_commits_asset_and_record() {
        let body = b"ffx preset bytes";
        let (req, dir) = request(body);
        let committer = RecordingCommitter::new();
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::ok(body),
            Box::new(committer.clone()),
        );

        let receipt = installer.install(&req, None, None).unwrap();

        assert_eq!(receipt.sha256, req.signed.sha256);
        assert!(req.destination.exists());
        assert_eq!(std::fs::read(&req.destination).unwrap(), body);
        let temp = req.destination.with_extension("tmp");
        assert!(!temp.exists(), "temp sink must be committed and gone");
        let committed = committer.committed.borrow();
        assert_eq!(committed.len(), 1);
        assert_eq!(committed[0].id, req.record.id);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_rolls_back_on_transport_error() {
        let body = b"ffx preset bytes";
        let (req, dir) = request(body);
        let committer = RecordingCommitter::new();
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::failing(DownloadError::Transport("network unavailable".to_string())),
            Box::new(committer.clone()),
        );

        let error = installer.install(&req, None, None).unwrap_err();
        assert!(matches!(error, InstallError::Download(_)));
        assert!(!req.destination.exists(), "asset must not be committed");
        assert!(
            !req.destination.with_extension("tmp").exists(),
            "temp must be removed"
        );
        assert!(
            committer.committed.borrow().is_empty(),
            "record must not be committed"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_rolls_back_on_hash_mismatch() {
        let body = b"tampered";
        let (mut req, dir) = request(body);
        req.signed.sha256 = "0".repeat(64);
        let committer = RecordingCommitter::new();
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::ok(body),
            Box::new(committer.clone()),
        );

        let error = installer.install(&req, None, None).unwrap_err();
        assert!(matches!(
            error,
            InstallError::Download(DownloadError::HashMismatch { .. })
        ));
        assert!(!req.destination.exists());
        assert!(!req.destination.with_extension("tmp").exists());
        assert!(committer.committed.borrow().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_rolls_back_on_cancel() {
        let body = b"data";
        let (req, dir) = request(body);
        let flag = CancelFlag::new();
        flag.cancel();
        let committer = RecordingCommitter::new();
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::ok(body),
            Box::new(committer.clone()),
        );

        let error = installer.install(&req, Some(&flag), None).unwrap_err();
        assert!(matches!(
            error,
            InstallError::Download(DownloadError::Cancelled)
        ));
        assert!(!req.destination.exists());
        assert!(!req.destination.with_extension("tmp").exists());
        assert!(committer.committed.borrow().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_rolls_back_on_redirect_escape() {
        let body = b"evil";
        let (req, dir) = request(body);
        let transport = FakeTransport::ok(body)
            .with_final_url("https://evil.example.net/preset.ffx".to_string());
        let committer = RecordingCommitter::new();
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            transport,
            Box::new(committer.clone()),
        );

        let error = installer.install(&req, None, None).unwrap_err();
        assert!(matches!(
            error,
            InstallError::Download(DownloadError::RedirectEscape { .. })
        ));
        assert!(!req.destination.exists());
        assert!(!req.destination.with_extension("tmp").exists());
        assert!(committer.committed.borrow().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_rolls_back_on_asset_commit_failure() {
        let body = b"ffx preset bytes";
        let (req, dir) = request(body);
        // Force rename to fail: destination already exists as a directory.
        std::fs::create_dir_all(&req.destination).unwrap();
        let committer = RecordingCommitter::new();
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::ok(body),
            Box::new(committer.clone()),
        );

        let error = installer.install(&req, None, None).unwrap_err();
        assert!(matches!(error, InstallError::Commit(_)));
        assert!(
            committer.committed.borrow().is_empty(),
            "record must not be committed"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_removes_asset_when_record_commit_fails() {
        let body = b"ffx preset bytes";
        let (req, dir) = request(body);
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::ok(body),
            Box::new(FailingCommitter),
        );

        let error = installer.install(&req, None, None).unwrap_err();
        assert!(matches!(error, InstallError::RecordCommit(_)));
        assert!(
            !req.destination.exists(),
            "asset must be removed when record commit fails"
        );
        assert!(!req.destination.with_extension("tmp").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn install_reports_download_and_abort_cleanup_failure() {
        let body = b"ffx preset bytes";
        let (req, dir) = request(body);
        let holder = Rc::new(RefCell::new(None));
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            DownloadFailureHoldingJournal {
                root: req.destination.parent().unwrap().to_path_buf(),
                holder: Rc::clone(&holder),
            },
            Box::new(RecordingCommitter::new()),
        );

        let error = installer.install(&req, None, None).unwrap_err();
        match error {
            InstallError::Cleanup { primary, cleanup } => {
                assert!(matches!(*primary, InstallError::Download(_)));
                assert!(!cleanup.is_empty());
            }
            other => panic!("expected structured cleanup error, got {other:?}"),
        }
        assert!(holder.borrow().is_some());
        assert!(fs::read_dir(req.destination.parent().unwrap())
            .unwrap()
            .any(|entry| entry
                .unwrap()
                .path()
                .to_string_lossy()
                .ends_with(".journal")));
        holder.borrow_mut().take();
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn install_reports_record_and_asset_cleanup_failure() {
        let body = b"ffx preset bytes";
        let (req, dir) = request(body);
        let holder = Rc::new(RefCell::new(None));
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::ok(body),
            Box::new(HoldingFailingCommitter {
                holder: Rc::clone(&holder),
            }),
        );

        let error = installer.install(&req, None, None).unwrap_err();
        match error {
            InstallError::Cleanup { primary, cleanup } => {
                assert!(matches!(*primary, InstallError::RecordCommit(_)));
                assert!(!cleanup.is_empty());
            }
            other => panic!("expected structured cleanup error, got {other:?}"),
        }
        assert!(holder.borrow().is_some());
        assert!(req.destination.exists(), "asset remains while held");
        holder.borrow_mut().take();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn install_reports_progress() {
        let body = b"1234567890";
        let (req, dir) = request(body);
        let committer = RecordingCommitter::new();
        let installer = PresetInstaller::with_transport_and_committer(
            test_config(),
            FakeTransport::ok(body),
            Box::new(committer.clone()),
        );
        let last = std::cell::Cell::new(0u64);

        let receipt = installer
            .install(
                &req,
                None,
                Some(&|loaded, _total| {
                    last.set(loaded);
                }),
            )
            .unwrap();

        assert_eq!(last.get(), receipt.bytes_written);
        assert_eq!(receipt.bytes_written, body.len() as u64);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn json_catalog_committer_upserts_by_id() {
        let dir = test_dir("catalog");
        let catalog_path = dir.join("presets").join("presets.json");
        let committer = JsonCatalogCommitter::new(&catalog_path);
        let catalog_root = ManagedRoot::new(catalog_path.parent().unwrap()).unwrap();
        let catalog_lock =
            OperationLock::acquire(&catalog_root, Instant::now() + Duration::from_secs(2)).unwrap();
        let catalog_invocation = InvocationId::new("catalog-test");
        let catalog_context = MutationContext::new(&catalog_lock, &catalog_invocation);

        let record = PresetRecord {
            id: "id-1".to_string(),
            r#type: "preset".to_string(),
            title: "First".to_string(),
            file_path: "/presets/one.ffx".to_string(),
            description: None,
            category: Some("preset".to_string()),
            source_catalog_id: "cloud-1".to_string(),
        };
        committer.commit(&record, &catalog_context).unwrap();

        let updated = PresetRecord {
            id: "id-1".to_string(),
            r#type: "preset".to_string(),
            title: "Updated".to_string(),
            file_path: "/presets/one.ffx".to_string(),
            description: None,
            category: Some("preset".to_string()),
            source_catalog_id: "cloud-1".to_string(),
        };
        committer.commit(&updated, &catalog_context).unwrap();

        let text = std::fs::read_to_string(&catalog_path).unwrap();
        let parsed: Value = serde_json::from_str(&text).unwrap();
        let presets = parsed["presets"].as_array().unwrap();
        assert_eq!(presets.len(), 1, "upsert must keep a single row per id");
        assert_eq!(presets[0]["title"], "Updated");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
