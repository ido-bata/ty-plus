//! Same-directory durable transactions guarded by the managed-root OS lock.

use crate::{OperationLockGuard, RegisteredPath};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fmt,
    fs::File,
    io::{self, Read, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use ty_plus_host_filesystem::platform::{
    commit_sequence, list_journals, transaction_open, PlatformTransactionHandle,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct InvocationId(String);
impl InvocationId {
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }
    fn validate(&self) -> Result<(), TransactionError> {
        if self.0.is_empty()
            || self.0.len() > 128
            || self.0 == "."
            || self.0 == ".."
            || self.0.contains('/')
            || self.0.contains('\\')
        {
            return Err(TransactionError::InvalidInvocation);
        }
        Ok(())
    }
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Revision(String);
impl fmt::Display for Revision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RevisionValidationError {
    MissingInvocation,
    InvalidBodyHash,
    InvalidTransactionKey,
}

impl fmt::Display for RevisionValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingInvocation => f.write_str("revision invocation is missing"),
            Self::InvalidBodyHash => f.write_str("revision body hash does not match body bytes"),
            Self::InvalidTransactionKey => f.write_str("revision transaction key is malformed"),
        }
    }
}

impl Revision {
    pub(crate) fn from_string(value: &str) -> Self {
        Self(value.to_owned())
    }

    pub(crate) fn validate_transaction_shape(
        &self,
        body: &[u8],
    ) -> Result<(), RevisionValidationError> {
        let mut parts = self.0.rsplitn(3, '-');
        let transaction_key = parts
            .next()
            .filter(|value| is_sha256_hex(value))
            .ok_or(RevisionValidationError::InvalidTransactionKey)?;
        let body_hash = parts
            .next()
            .ok_or(RevisionValidationError::InvalidBodyHash)?;
        let invocation = parts
            .next()
            .filter(|value| !value.is_empty())
            .ok_or(RevisionValidationError::MissingInvocation)?;
        let _ = (transaction_key, invocation);
        if body_hash != hash_bytes(body) {
            return Err(RevisionValidationError::InvalidBodyHash);
        }
        Ok(())
    }
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TransactionState {
    Preparing,
    Flushing,
    Committing,
    Sequenced,
    Committed,
    RolledBack,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitReceipt {
    pub invocation_id: InvocationId,
    pub commit_sequence: u64,
    pub revision: Revision,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RecoveryReport {
    pub recovered_invocations: Vec<InvocationId>,
    pub ignored_entries: usize,
    pub failed_entries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Journal {
    version: u8,
    invocation_id: InvocationId,
    transaction_key: String,
    destination: String,
    state: TransactionState,
    body_size: Option<u64>,
    body_hash: Option<String>,
    revision_size: Option<u64>,
    revision_hash: Option<String>,
    commit_sequence: Option<u64>,
    /// Corruption-detection checksum over every journal field except this one.
    /// Artifact ownership remains enforced by the managed-root capability.
    checksum: String,
}

#[derive(Debug)]
pub enum TransactionError {
    Io(io::Error),
    InvalidInvocation,
    InvalidState,
    NotFlushed,
    Journal(serde_json::Error),
    LockRequired,
}
impl From<io::Error> for TransactionError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}
impl From<serde_json::Error> for TransactionError {
    fn from(e: serde_json::Error) -> Self {
        Self::Journal(e)
    }
}
impl fmt::Display for TransactionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "transaction I/O failed: {e}"),
            Self::InvalidInvocation => f.write_str("invalid invocation identity"),
            Self::InvalidState => f.write_str("invalid transaction state"),
            Self::NotFlushed => f.write_str("transaction must be flushed before commit"),
            Self::Journal(e) => write!(f, "transaction journal failed: {e}"),
            Self::LockRequired => f.write_str("transaction requires the managed-root lock"),
        }
    }
}
impl std::error::Error for TransactionError {}

#[derive(Debug)]
pub enum RecoveryError {
    Io(io::Error),
    Journal(serde_json::Error),
    InvalidPath,
    UnsupportedStage,
    RecoveryIncomplete,
    /// The journal envelope was modified without updating its checksum.
    JournalIntegrity,
}
impl From<io::Error> for RecoveryError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}
impl From<serde_json::Error> for RecoveryError {
    fn from(e: serde_json::Error) -> Self {
        Self::Journal(e)
    }
}
impl fmt::Display for RecoveryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "recovery I/O failed: {e}"),
            Self::Journal(e) => write!(f, "recovery journal failed: {e}"),
            Self::InvalidPath => f.write_str("recovery path is invalid"),
            Self::UnsupportedStage => f.write_str("unsupported transaction stage"),
            Self::RecoveryIncomplete => f.write_str("transaction recovery incomplete"),
            Self::JournalIntegrity => f.write_str("transaction journal integrity check failed"),
        }
    }
}
impl std::error::Error for RecoveryError {}

#[derive(Debug)]
pub struct Transaction<'lock> {
    lock: &'lock OperationLockGuard,
    destination: RegisteredPath,
    invocation_id: InvocationId,
    transaction_key: String,
    state: TransactionState,
    capability: PlatformTransactionHandle,
    file: Option<File>,
    body_size: Option<u64>,
    body_hash: Option<String>,
    body_hasher: Sha256,
    revision_size: Option<u64>,
    revision_hash: Option<String>,
    commit_sequence: Option<u64>,
}

fn hash_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn write_all_checked<W: Write>(writer: &mut W, bytes: &[u8]) -> io::Result<()> {
    writer.write_all(bytes)
}

fn new_transaction_key(invocation_id: &InvocationId, destination: &RegisteredPath) -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let nonce = NEXT.fetch_add(1, Ordering::Relaxed);
    hash_bytes(
        format!(
            "{}:{}:{nanos}:{nonce}",
            invocation_id.as_str(),
            destination.as_path().display()
        )
        .as_bytes(),
    )
}

fn journal_checksum(journal: &Journal) -> Result<String, serde_json::Error> {
    let mut value = serde_json::to_value(journal)?;
    if let Some(object) = value.as_object_mut() {
        object.remove("checksum");
    }
    Ok(hash_bytes(&serde_json::to_vec(&value)?))
}

fn validate_journal_checksum(journal: &Journal) -> Result<(), RecoveryError> {
    let expected = journal_checksum(journal).map_err(RecoveryError::Journal)?;
    if journal.checksum != expected {
        return Err(RecoveryError::JournalIntegrity);
    }
    Ok(())
}

fn validate_journal_schema(journal: &Journal) -> Result<(), RecoveryError> {
    if journal.version != 2
        || journal.transaction_key.is_empty()
        || !journal
            .transaction_key
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(RecoveryError::UnsupportedStage);
    }
    let body_complete = journal.body_size.is_some() == journal.body_hash.is_some();
    let revision_complete = journal.revision_size.is_some() == journal.revision_hash.is_some();
    let valid = match journal.state {
        TransactionState::Preparing => {
            journal.body_size.is_none()
                && journal.body_hash.is_none()
                && journal.revision_size.is_none()
                && journal.revision_hash.is_none()
                && journal.commit_sequence.is_none()
        }
        TransactionState::Flushing => {
            body_complete
                && journal.body_size.is_some()
                && journal.revision_size.is_none()
                && journal.revision_hash.is_none()
                && journal.commit_sequence.is_none()
        }
        TransactionState::Committing => {
            body_complete
                && revision_complete
                && journal.body_size.is_some()
                && journal.revision_size.is_some()
        }
        TransactionState::Sequenced => {
            body_complete
                && revision_complete
                && journal.body_size.is_some()
                && journal.commit_sequence.is_some()
        }
        TransactionState::Committed | TransactionState::RolledBack => false,
    };
    if valid {
        Ok(())
    } else {
        Err(RecoveryError::RecoveryIncomplete)
    }
}

impl<'lock> Transaction<'lock> {
    pub fn prepare(
        lock: &'lock OperationLockGuard,
        destination: RegisteredPath,
        invocation_id: InvocationId,
    ) -> Result<Self, TransactionError> {
        invocation_id.validate()?;
        let transaction_key = new_transaction_key(&invocation_id, &destination);
        let capability = transaction_open(
            lock.managed_root().as_path(),
            destination.as_path(),
            invocation_id.as_str(),
        )?;
        let transaction = Self {
            lock,
            destination,
            invocation_id,
            transaction_key,
            state: TransactionState::Preparing,
            capability,
            file: None,
            body_size: None,
            body_hash: None,
            body_hasher: Sha256::new(),
            revision_size: None,
            revision_hash: None,
            commit_sequence: None,
        };
        transaction.write_journal(TransactionState::Preparing)?;
        Ok(transaction)
    }

    pub fn write_all(&mut self, bytes: &[u8]) -> Result<(), TransactionError> {
        if self.file.is_none() {
            self.file = Some(self.capability.create_temp()?);
        }
        let file = self.file.as_mut().ok_or(TransactionError::InvalidState)?;
        write_all_checked(file, bytes).map_err(TransactionError::from)?;
        let total = self
            .body_size
            .unwrap_or(0)
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| {
                TransactionError::Io(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "transaction body too large",
                ))
            })?;
        self.body_hasher.update(bytes);
        self.body_size = Some(total);
        Ok(())
    }

    pub fn write_from<R: Read>(&mut self, reader: &mut R) -> Result<(), TransactionError> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes)?;
        self.write_all(&bytes)
    }

    pub fn flush(&mut self) -> Result<(), TransactionError> {
        if let Some(file) = self.file.as_mut() {
            file.sync_all()?;
        }
        self.file = None;
        self.body_hash = Some(format!("{:x}", self.body_hasher.clone().finalize()));
        self.state = TransactionState::Flushing;
        self.write_journal(TransactionState::Flushing)
    }

    pub fn commit(mut self) -> Result<CommitReceipt, TransactionError> {
        if self.state != TransactionState::Flushing {
            return Err(TransactionError::NotFlushed);
        }
        let revision = Revision(format!(
            "{}-{}-{}",
            self.invocation_id.as_str(),
            self.body_hash.as_deref().unwrap_or("empty"),
            self.transaction_key,
        ));
        let mut revision_file = self.capability.create_revision()?;
        let payload = serde_json::json!({"revision": revision.to_string(), "timestamp": chrono::Utc::now().to_rfc3339()});
        let revision_bytes = serde_json::to_vec_pretty(&payload)?;
        write_all_checked(&mut revision_file, &revision_bytes)?;
        revision_file.sync_all()?;
        drop(revision_file);
        self.revision_size = Some(revision_bytes.len() as u64);
        self.revision_hash = Some(hash_bytes(&revision_bytes));
        self.state = TransactionState::Committing;
        self.write_journal(TransactionState::Committing)?;
        #[cfg(not(target_os = "windows"))]
        self.capability.sync_directory()?;
        self.capability.replace_body()?;
        self.capability.replace_revision()?;
        #[cfg(not(target_os = "windows"))]
        self.capability.sync_directory()?;
        let sequence = commit_sequence(self.lock.managed_root().as_path(), &self.transaction_key)?;
        self.commit_sequence = Some(sequence);
        self.state = TransactionState::Sequenced;
        self.write_journal(TransactionState::Sequenced)?;
        #[cfg(not(target_os = "windows"))]
        self.capability.sync_directory()?;
        self.capability.remove_artifacts()?;
        self.state = TransactionState::Committed;
        Ok(CommitReceipt {
            invocation_id: self.invocation_id,
            commit_sequence: sequence,
            revision,
        })
    }

    pub fn abort(self) -> Result<(), TransactionError> {
        self.capability.remove_artifacts()?;
        Ok(())
    }

    fn write_journal(&self, state: TransactionState) -> Result<(), TransactionError> {
        let mut journal = Journal {
            version: 2,
            invocation_id: self.invocation_id.clone(),
            transaction_key: self.transaction_key.clone(),
            destination: self.destination.as_path().to_string_lossy().into_owned(),
            state,
            body_size: self.body_size,
            body_hash: self.body_hash.clone(),
            revision_size: self.revision_size,
            revision_hash: self.revision_hash.clone(),
            commit_sequence: self.commit_sequence,
            checksum: String::new(),
        };
        journal.checksum = journal_checksum(&journal)?;
        let bytes = serde_json::to_vec(&journal)?;
        if state == TransactionState::Preparing {
            self.capability.write_journal(&bytes)?
        } else {
            self.capability.update_journal(&bytes)?
        }
        Ok(())
    }

    pub fn recover(
        lock: &'lock OperationLockGuard,
        directory: RegisteredPath,
    ) -> Result<RecoveryReport, RecoveryError> {
        let journals = list_journals(lock.managed_root().as_path(), directory.as_path())?;
        let mut report = RecoveryReport::default();
        for (journal_name, bytes) in journals {
            let journal: Journal = match serde_json::from_slice(&bytes) {
                Ok(journal) => journal,
                Err(error) => {
                    report.failed_entries += 1;
                    return Err(RecoveryError::Journal(error));
                }
            };
            validate_journal_checksum(&journal)?;
            validate_journal_schema(&journal)?;
            if journal.version != 2 || journal.invocation_id.validate().is_err() {
                report.ignored_entries += 1;
                continue;
            }
            let journal_path = RegisteredPath::new(&journal.destination)
                .map_err(|_| RecoveryError::InvalidPath)?;
            if journal_path.as_path().parent() != Some(directory.as_path()) {
                report.ignored_entries += 1;
                continue;
            }
            let capability = transaction_open(
                lock.managed_root().as_path(),
                journal_path.as_path(),
                journal.invocation_id.as_str(),
            )
            .map_err(RecoveryError::Io)?;
            if capability.journal_name() != journal_name {
                report.ignored_entries += 1;
                continue;
            }
            let Some(name) = journal_path
                .as_path()
                .file_name()
                .and_then(|name| name.to_str())
            else {
                return Err(RecoveryError::InvalidPath);
            };
            let revision_name = format!(
                "{}.rev.json",
                Path::new(name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(name)
            );
            match journal.state {
                TransactionState::Preparing | TransactionState::Flushing => {
                    capability.remove_artifacts().map_err(RecoveryError::Io)?
                }
                TransactionState::Committing | TransactionState::Sequenced => {
                    let body_hash = journal
                        .body_hash
                        .as_deref()
                        .ok_or(RecoveryError::RecoveryIncomplete)?;
                    let body_size = journal.body_size.ok_or(RecoveryError::RecoveryIncomplete)?;
                    let body_done = if capability.has_entry(name).map_err(RecoveryError::Io)? {
                        let bytes = capability.read_entry(name).map_err(RecoveryError::Io)?;
                        bytes.len() as u64 == body_size && hash_bytes(&bytes) == body_hash
                    } else {
                        false
                    };
                    let body_done = if !body_done
                        && capability
                            .replace_body_if_present()
                            .map_err(RecoveryError::Io)?
                    {
                        let bytes = capability.read_entry(name).map_err(RecoveryError::Io)?;
                        bytes.len() as u64 == body_size && hash_bytes(&bytes) == body_hash
                    } else {
                        body_done
                    };
                    let revision_hash = journal
                        .revision_hash
                        .as_deref()
                        .ok_or(RecoveryError::RecoveryIncomplete)?;
                    let revision_size = journal
                        .revision_size
                        .ok_or(RecoveryError::RecoveryIncomplete)?;
                    let revision_done = if capability
                        .has_entry(revision_name.as_str())
                        .map_err(RecoveryError::Io)?
                    {
                        let bytes = capability
                            .read_entry(revision_name.as_str())
                            .map_err(RecoveryError::Io)?;
                        bytes.len() as u64 == revision_size && hash_bytes(&bytes) == revision_hash
                    } else {
                        false
                    };
                    let revision_done = if !revision_done
                        && capability
                            .replace_revision_if_present()
                            .map_err(RecoveryError::Io)?
                    {
                        let bytes = capability
                            .read_entry(revision_name.as_str())
                            .map_err(RecoveryError::Io)?;
                        bytes.len() as u64 == revision_size && hash_bytes(&bytes) == revision_hash
                    } else {
                        revision_done
                    };
                    if !body_done || !revision_done {
                        return Err(RecoveryError::RecoveryIncomplete);
                    }
                    let sequence =
                        commit_sequence(lock.managed_root().as_path(), &journal.transaction_key)
                            .map_err(RecoveryError::Io)?;
                    if let Some(expected) = journal.commit_sequence {
                        if expected != sequence {
                            return Err(RecoveryError::RecoveryIncomplete);
                        }
                    } else {
                        let mut journal = Journal {
                            version: journal.version,
                            invocation_id: journal.invocation_id.clone(),
                            transaction_key: journal.transaction_key.clone(),
                            destination: journal.destination.clone(),
                            state: TransactionState::Sequenced,
                            body_size: journal.body_size,
                            body_hash: journal.body_hash.clone(),
                            revision_size: journal.revision_size,
                            revision_hash: journal.revision_hash.clone(),
                            commit_sequence: Some(sequence),
                            checksum: String::new(),
                        };
                        journal.checksum =
                            journal_checksum(&journal).map_err(RecoveryError::Journal)?;
                        let bytes = serde_json::to_vec(&journal).map_err(RecoveryError::Journal)?;
                        capability
                            .update_journal(&bytes)
                            .map_err(RecoveryError::Io)?;
                    }
                    #[cfg(not(target_os = "windows"))]
                    capability.sync_directory().map_err(RecoveryError::Io)?;
                    capability.remove_artifacts().map_err(RecoveryError::Io)?;
                }
                TransactionState::Committed | TransactionState::RolledBack => {
                    return Err(RecoveryError::UnsupportedStage)
                }
            }
            report.recovered_invocations.push(journal.invocation_id);
        }
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::write_all_checked;
    use std::io::{self, Write};

    struct ZeroWriter;
    impl Write for ZeroWriter {
        fn write(&mut self, _bytes: &[u8]) -> io::Result<usize> {
            Ok(0)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct ShortWriter {
        writes: usize,
    }
    impl Write for ShortWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.writes += 1;
            Ok(bytes.len().min(1))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct DiskFullWriter;
    impl Write for DiskFullWriter {
        fn write(&mut self, _bytes: &[u8]) -> io::Result<usize> {
            Err(io::Error::new(
                io::ErrorKind::StorageFull,
                "injected disk full",
            ))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn write_helper_rejects_write_zero() {
        let error = write_all_checked(&mut ZeroWriter, b"body").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::WriteZero);
    }

    #[test]
    fn write_helper_completes_short_writes() {
        let mut writer = ShortWriter { writes: 0 };
        write_all_checked(&mut writer, b"body").unwrap();
        assert!(writer.writes > 1);
    }

    #[test]
    fn write_helper_preserves_disk_full_error() {
        let error = write_all_checked(&mut DiskFullWriter, b"body").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::StorageFull);
    }
}
