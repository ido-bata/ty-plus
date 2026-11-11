use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
};

use sha2::Digest;
use std::time::{Duration, Instant};
use ty_plus_host_filesystem::platform::{commit_sequence, transaction_open};
use ty_plus_storage::{
    ApplicationFolderManifest, InvocationId, JsonFileStore, ManagedRoot, MutationContext,
    OperationLock, OperationLockGuard, PersistenceIoHandler, PersistenceWriteJsonRequest,
    RegisteredPath, Transaction, TransactionError,
};

fn managed_root() -> ManagedRoot {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let path = std::env::temp_dir().join(format!(
        "ty-plus-transaction-recovery-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&path);
    ManagedRoot::new(path).expect("test root is absolute")
}

fn destination() -> RegisteredPath {
    RegisteredPath::new(Path::new("settings/user.json")).expect("relative destination")
}

fn cleanup(root: &ManagedRoot) {
    let _ = fs::remove_dir_all(root.as_path());
}

fn lock(root: &ManagedRoot) -> OperationLockGuard {
    OperationLock::acquire(root, Instant::now() + Duration::from_secs(2)).expect("operation lock")
}

#[test]
fn commit_replaces_existing_destination_and_keeps_body_revision_consistent() {
    let root = managed_root();
    let destination = destination();
    fs::create_dir_all(root.as_path().join("settings")).expect("settings directory");
    fs::write(
        root.as_path().join("settings/user.json"),
        br#"{"old":true}"#,
    )
    .expect("existing destination");

    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination.clone(), InvocationId::new("writer-1"))
            .expect("prepare");
    transaction.write_all(br#"{"new":true}"#).expect("write");
    transaction.flush().expect("durable flush");
    let receipt = transaction.commit().expect("commit");

    assert_eq!(receipt.invocation_id, InvocationId::new("writer-1"));
    assert!(!receipt.revision.to_string().is_empty());
    assert_eq!(
        fs::read(root.as_path().join("settings/user.json")).unwrap(),
        br#"{"new":true}"#
    );
    let revision = fs::read_to_string(root.as_path().join("settings/user.rev.json")).unwrap();
    assert!(revision.contains(&receipt.revision.to_string()));
    cleanup(&root);
}

#[test]
fn recovery_does_not_delete_an_unrelated_tmp_file() {
    let root = managed_root();
    let directory = RegisteredPath::new("settings").unwrap();
    fs::create_dir_all(root.as_path().join("settings")).expect("settings directory");
    fs::write(root.as_path().join("settings/user.tmp"), b"user scratch").expect("unrelated tmp");

    let guard = lock(&root);
    let mut transaction = Transaction::prepare(
        &guard,
        RegisteredPath::new("settings/recovered.json").unwrap(),
        InvocationId::new("crashed"),
    )
    .expect("prepare");
    transaction.write_all(b"recovered").expect("write");
    transaction.flush().expect("flush");
    drop(transaction);

    let report = Transaction::recover(&guard, directory).expect("recovery");
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("crashed")]
    );
    assert!(fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .any(|entry| entry.unwrap().path().to_string_lossy().ends_with(".tmp")));
    cleanup(&root);
}

#[test]
fn path_safety_rejects_absolute_parent_and_separator_escape() {
    let root = managed_root();
    let invocation = InvocationId::new("safe");
    for input in [
        PathBuf::from("C:\\outside.json"),
        PathBuf::from("\\\\server\\share\\outside.json"),
        PathBuf::from("../outside.json"),
        PathBuf::from("settings/../../outside.json"),
    ] {
        let path = match RegisteredPath::new(input) {
            Ok(path) => path,
            Err(_) => continue,
        };
        let guard = lock(&root);
        assert!(Transaction::prepare(&guard, path, invocation.clone()).is_err());
    }
    cleanup(&root);
}

#[cfg(windows)]
#[test]
fn windows_registered_path_rejects_drive_unc_and_separator_forms() {
    assert!(RegisteredPath::new(PathBuf::from(r"C:\outside.json")).is_err());
    assert!(RegisteredPath::new(PathBuf::from(r"\\server\share\outside.json")).is_err());
    assert!(RegisteredPath::new(PathBuf::from(r"settings\..\outside.json")).is_err());
}

#[cfg(windows)]
#[test]
fn windows_transaction_rejects_parent_junction_without_external_write() {
    use std::os::windows::fs::symlink_dir;

    let root = managed_root();
    let outside = root.as_path().with_extension("parent-junction-outside");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(root.as_path()).unwrap();
    symlink_dir(&outside, root.as_path().join("settings")).unwrap();
    let guard = lock(&root);
    assert!(
        Transaction::prepare(&guard, destination(), InvocationId::new("parent-junction")).is_err()
    );
    assert!(!outside.join("user.json").exists());
    cleanup(&root);
    let _ = fs::remove_dir_all(outside);
}

#[cfg(windows)]
#[test]
fn windows_transaction_rejects_final_reparse_without_external_write() {
    use std::os::windows::fs::symlink_dir;

    let root = managed_root();
    let outside = root.as_path().with_extension("final-reparse-outside");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(root.as_path().join("settings")).unwrap();
    symlink_dir(&outside, root.as_path().join("settings/user.json")).unwrap();
    let guard = lock(&root);
    assert!(
        Transaction::prepare(&guard, destination(), InvocationId::new("final-reparse")).is_err()
    );
    assert!(fs::read_dir(&outside).unwrap().next().is_none());
    cleanup(&root);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn unicode_relative_destination_is_supported() {
    let root = managed_root();
    let destination = RegisteredPath::new("設定/ユーザー.json").unwrap();
    let guard = lock(&root);
    let mut transaction = Transaction::prepare(&guard, destination, InvocationId::new("unicode"))
        .expect("prepare unicode");
    transaction.write_all("こんにちは".as_bytes()).unwrap();
    transaction.flush().unwrap();
    transaction.commit().unwrap();
    assert_eq!(
        fs::read(root.as_path().join("設定/ユーザー.json")).unwrap(),
        "こんにちは".as_bytes()
    );
    cleanup(&root);
}

#[cfg(unix)]
#[test]
fn symlinked_destination_parent_is_rejected_without_external_write() {
    use std::os::unix::fs::symlink;
    let root = managed_root();
    let outside = root.as_path().with_extension("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::create_dir_all(root.as_path()).unwrap();
    symlink(&outside, root.as_path().join("settings")).unwrap();
    let guard = lock(&root);
    let result = Transaction::prepare(&guard, destination(), InvocationId::new("symlink"));
    assert!(result.is_err());
    assert!(!outside.join("user.json").exists());
    cleanup(&root);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn lww_is_the_order_of_successful_exclusive_commits() {
    let root = managed_root();
    let first_guard = lock(&root);
    let mut first =
        Transaction::prepare(&first_guard, destination(), InvocationId::new("first")).unwrap();
    first.write_all(b"first").unwrap();
    first.flush().unwrap();
    let first_receipt = first.commit().unwrap();

    drop(first_guard);
    let second_guard = lock(&root);
    let mut second =
        Transaction::prepare(&second_guard, destination(), InvocationId::new("second")).unwrap();
    second.write_all(b"second").unwrap();
    second.flush().unwrap();
    let second_receipt = second.commit().unwrap();
    assert!(second_receipt.commit_sequence > first_receipt.commit_sequence);
    assert_eq!(
        fs::read(root.as_path().join("settings/user.json")).unwrap(),
        b"second"
    );
    cleanup(&root);
}

#[test]
fn recovery_rejects_tampered_body_and_keeps_the_journal() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).expect("settings directory");
    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("tampered"))
            .expect("prepare");
    transaction.write_all(b"expected").expect("write");
    transaction.flush().expect("flush");
    drop(transaction);

    let journal = fs::read_dir(root.as_path().join("settings"))
        .expect("settings entries")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.to_string_lossy().ends_with(".journal"))
        .expect("transaction journal");
    let mut journal_value: serde_json::Value =
        serde_json::from_slice(&fs::read(&journal).expect("journal bytes")).unwrap();
    journal_value["state"] = serde_json::Value::String("Committing".to_owned());
    fs::write(&journal, serde_json::to_vec(&journal_value).unwrap()).expect("stage injection");

    let temp = fs::read_dir(root.as_path().join("settings"))
        .expect("settings entries")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.to_string_lossy().ends_with(".tmp"))
        .expect("transaction temp");
    fs::write(temp, b"tampered").expect("fault injection");
    let result = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap());
    assert!(result.is_err());
    assert!(fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .any(|entry| entry
            .unwrap()
            .path()
            .to_string_lossy()
            .ends_with(".journal")));
    cleanup(&root);
}

#[test]
fn recovery_rejects_tampered_journal_hash_and_keeps_artifacts() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).expect("settings directory");
    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("journal-tampered"))
            .expect("prepare");
    transaction.write_all(b"expected").expect("write");
    transaction.flush().expect("flush");
    drop(transaction);

    let journal = fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.to_string_lossy().ends_with(".journal"))
        .unwrap();
    let mut value: serde_json::Value =
        serde_json::from_slice(&fs::read(&journal).unwrap()).unwrap();
    value["state"] = serde_json::Value::String("Committing".to_owned());
    value["body_hash"] = serde_json::Value::String("00".repeat(32));
    fs::write(&journal, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).is_err());
    assert!(journal.exists());
    cleanup(&root);
}

#[test]
fn recovery_rejects_hashes_rewritten_to_existing_finals_without_envelope_checksum() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).expect("settings directory");
    fs::write(root.as_path().join("settings/user.json"), b"old-body").unwrap();
    fs::write(
        root.as_path().join("settings/user.rev.json"),
        br#"{"revision":"old","timestamp":"old"}"#,
    )
    .unwrap();
    let guard = lock(&root);
    let mut transaction = Transaction::prepare(
        &guard,
        destination(),
        InvocationId::new("envelope-tampered"),
    )
    .unwrap();
    transaction.write_all(b"new-body").unwrap();
    transaction.flush().unwrap();
    drop(transaction);

    let journal = fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.to_string_lossy().ends_with(".journal"))
        .unwrap();
    let mut value: serde_json::Value =
        serde_json::from_slice(&fs::read(&journal).unwrap()).unwrap();
    value["state"] = serde_json::Value::String("Committing".to_owned());
    value["body_size"] = serde_json::Value::from(8_u64);
    value["body_hash"] =
        serde_json::Value::String(format!("{:x}", sha2::Sha256::digest(b"old-body")));
    value["revision_size"] = serde_json::Value::from(39_u64);
    value["revision_hash"] = serde_json::Value::String(format!(
        "{:x}",
        sha2::Sha256::digest(br#"{"revision":"old","timestamp":"old"}"#)
    ));
    fs::write(&journal, serde_json::to_vec(&value).unwrap()).unwrap();

    let result = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap());
    assert!(result.is_err(), "checksum must reject forged final hashes");
    assert!(journal.exists());
    assert!(fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .any(|entry| entry.unwrap().path().to_string_lossy().ends_with(".tmp")));
    cleanup(&root);
}

#[test]
fn recovery_rejects_unknown_journal_fields_before_trusting_the_envelope() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).unwrap();
    let guard = lock(&root);
    let transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("unknown-field")).unwrap();
    drop(transaction);
    let journal = fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.to_string_lossy().ends_with(".journal"))
        .unwrap();
    let mut value: serde_json::Value =
        serde_json::from_slice(&fs::read(&journal).unwrap()).unwrap();
    value["unexpected"] = serde_json::Value::Bool(true);
    fs::write(&journal, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).is_err());
    assert!(journal.exists());
    cleanup(&root);
}

#[test]
fn recovery_rejects_invalid_state_field_combination_even_with_valid_checksum() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).unwrap();
    let guard = lock(&root);
    let transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("invalid-state")).unwrap();
    drop(transaction);
    let journal = fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.to_string_lossy().ends_with(".journal"))
        .unwrap();
    let mut value: serde_json::Value =
        serde_json::from_slice(&fs::read(&journal).unwrap()).unwrap();
    value["state"] = serde_json::Value::String("Sequenced".to_owned());
    value["checksum"] = serde_json::Value::Null;
    let mut unsigned = value.clone();
    unsigned.as_object_mut().unwrap().remove("checksum");
    value["checksum"] = serde_json::Value::String(format!(
        "{:x}",
        sha2::Sha256::digest(serde_json::to_vec(&unsigned).unwrap())
    ));
    fs::write(&journal, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).is_err());
    assert!(journal.exists());
    cleanup(&root);
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
#[test]
fn windows_body_replace_failure_keeps_journal_until_unlock_and_recovery() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).unwrap();
    let destination_path = root.as_path().join("settings/user.json");
    fs::write(&destination_path, b"old").unwrap();
    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("body-lock")).unwrap();
    let holder = open_exclusive(&destination_path);
    transaction.write_all(b"new").unwrap();
    transaction.flush().unwrap();
    assert!(transaction.commit().is_err());
    assert!(fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .any(|entry| {
            entry
                .unwrap()
                .path()
                .to_string_lossy()
                .ends_with(".journal")
        }));
    drop(holder);
    let report = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).unwrap();
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("body-lock")]
    );
    assert_eq!(fs::read(destination_path).unwrap(), b"new");
    cleanup(&root);
}

#[cfg(windows)]
#[test]
fn windows_revision_replace_failure_does_not_report_recovery_before_unlock() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).unwrap();
    let revision = root.as_path().join("settings/user.rev.json");
    fs::write(&revision, b"old-revision").unwrap();
    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("revision-lock")).unwrap();
    let holder = open_exclusive(&revision);
    transaction.write_all(b"new").unwrap();
    transaction.flush().unwrap();
    assert!(transaction.commit().is_err());
    drop(holder);
    let report = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).unwrap();
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("revision-lock")]
    );
    assert!(String::from_utf8_lossy(&fs::read(revision).unwrap()).contains("revision-lock"));
    cleanup(&root);
}

#[cfg(windows)]
#[test]
fn windows_sequence_append_failure_does_not_duplicate_after_recovery() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("control")).unwrap();
    fs::write(root.as_path().join("control/commit-sequence"), b"").unwrap();
    let holder = open_exclusive(&root.as_path().join("control/commit-sequence"));
    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("sequence-lock")).unwrap();
    transaction.write_all(b"new").unwrap();
    transaction.flush().unwrap();
    assert!(transaction.commit().is_err());
    drop(holder);
    let report = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).unwrap();
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("sequence-lock")]
    );
    let lines = fs::read_to_string(root.as_path().join("control/commit-sequence")).unwrap();
    assert_eq!(lines.lines().count(), 1);
    cleanup(&root);
}

#[cfg(windows)]
#[test]
fn windows_cleanup_failure_keeps_journal_until_unlock_and_does_not_duplicate_sequence() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("settings")).unwrap();
    let invocation = InvocationId::new("cleanup-lock");
    let transaction_key = "c".repeat(64);
    let body = b"already-published";
    let revision = br#"{"revision":"cleanup-lock","timestamp":"fixture"}"#;
    fs::write(root.as_path().join("settings/user.json"), body).unwrap();
    fs::write(root.as_path().join("settings/user.rev.json"), revision).unwrap();
    let sequence = commit_sequence(root.as_path(), &transaction_key).unwrap();
    let capability = transaction_open(
        root.as_path(),
        Path::new("settings/user.json"),
        invocation.as_str(),
    )
    .unwrap();
    let mut journal = serde_json::json!({
        "version": 2,
        "invocation_id": invocation,
        "transaction_key": transaction_key,
        "destination": "settings/user.json",
        "state": "Sequenced",
        "body_size": body.len(),
        "body_hash": format!("{:x}", sha2::Sha256::digest(body)),
        "revision_size": revision.len(),
        "revision_hash": format!("{:x}", sha2::Sha256::digest(revision)),
        "commit_sequence": sequence,
        "checksum": serde_json::Value::Null,
    });
    let mut unsigned = journal.clone();
    unsigned.as_object_mut().unwrap().remove("checksum");
    journal["checksum"] = serde_json::Value::String(format!(
        "{:x}",
        sha2::Sha256::digest(serde_json::to_vec(&unsigned).unwrap())
    ));
    capability
        .write_journal(&serde_json::to_vec(&journal).unwrap())
        .unwrap();
    drop(capability);
    let journal_path = fs::read_dir(root.as_path().join("settings"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| path.to_string_lossy().ends_with(".journal"))
        .unwrap();
    let holder = open_exclusive(&journal_path);
    let guard = lock(&root);
    assert!(Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).is_err());
    assert!(journal_path.exists());
    assert_eq!(
        fs::read_to_string(root.as_path().join("control/commit-sequence"))
            .unwrap()
            .lines()
            .count(),
        1
    );
    drop(holder);
    let report = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).unwrap();
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("cleanup-lock")]
    );
    cleanup(&root);
}

#[test]
fn short_write_or_unflushed_transaction_cannot_commit() {
    let root = managed_root();
    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("not-flushed")).unwrap();
    transaction.write_all(b"not durable yet").unwrap();
    assert!(matches!(
        transaction.commit(),
        Err(TransactionError::NotFlushed)
    ));
    cleanup(&root);
}

#[test]
fn multiple_writes_hash_and_publish_the_complete_temp_body() {
    let root = managed_root();
    let guard = lock(&root);
    let mut transaction =
        Transaction::prepare(&guard, destination(), InvocationId::new("multi-write"))
            .expect("prepare");
    transaction.write_all(b"first-").expect("first write");
    transaction.write_all(b"second").expect("second write");
    transaction.flush().expect("flush");
    transaction.commit().expect("commit");
    assert_eq!(
        fs::read(root.as_path().join("settings/user.json")).unwrap(),
        b"first-second"
    );
    cleanup(&root);
}

#[test]
fn corrupt_sequence_tail_fails_closed_without_rewinding() {
    let root = managed_root();
    fs::create_dir_all(root.as_path().join("control")).expect("control directory");
    fs::write(
        root.as_path().join("control/commit-sequence"),
        b"00000000000000000001:corrupt\n",
    )
    .expect("corrupt sequence fixture");
    let result = commit_sequence(root.as_path(), "corrupt-sequence");
    assert!(result.is_err());
    cleanup(&root);
}

#[test]
fn commit_sequence_is_exactly_once_by_transaction_key_and_truncates_torn_tail() {
    let root = managed_root();
    let first = commit_sequence(root.as_path(), "transaction-a").unwrap();
    assert_eq!(
        commit_sequence(root.as_path(), "transaction-a").unwrap(),
        first
    );
    fs::OpenOptions::new()
        .append(true)
        .open(root.as_path().join("control/commit-sequence"))
        .unwrap()
        .write_all(b"torn-tail")
        .unwrap();
    let second = commit_sequence(root.as_path(), "transaction-b").unwrap();
    assert!(second > first);
    assert_eq!(
        commit_sequence(root.as_path(), "transaction-b").unwrap(),
        second
    );
    let lines = fs::read_to_string(root.as_path().join("control/commit-sequence")).unwrap();
    assert_eq!(lines.lines().count(), 2);
    cleanup(&root);
}

#[test]
fn commit_sequence_rejects_a_second_record_for_the_same_transaction_key() {
    let root = managed_root();
    let first = commit_sequence(root.as_path(), "duplicate-key").unwrap();
    let next = first + 1;
    let checksum = format!(
        "{:x}",
        sha2::Sha256::digest(format!("{next}:duplicate-key").as_bytes())
    );
    fs::OpenOptions::new()
        .append(true)
        .open(root.as_path().join("control/commit-sequence"))
        .unwrap()
        .write_all(format!("{next:020x}:duplicate-key:{checksum}\n").as_bytes())
        .unwrap();
    assert!(commit_sequence(root.as_path(), "new-key").is_err());
    cleanup(&root);
}

#[test]
fn child_process_crash_restarts_and_recovers_flush_stage() {
    if let Ok(root_path) = std::env::var("TY_PLUS_CRASH_FIXTURE_ROOT") {
        let root = ManagedRoot::new(root_path).unwrap();
        fs::create_dir_all(root.as_path().join("settings")).unwrap();
        let guard = lock(&root);
        let mut transaction =
            Transaction::prepare(&guard, destination(), InvocationId::new("child-crash")).unwrap();
        transaction.write_all(b"child").unwrap();
        transaction.flush().unwrap();
        std::process::exit(91);
    }

    let root = managed_root();
    let status = Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("child_process_crash_restarts_and_recovers_flush_stage")
        .arg("--nocapture")
        .env("TY_PLUS_CRASH_FIXTURE_ROOT", root.as_path())
        .status()
        .expect("spawn crash fixture");
    assert_eq!(status.code(), Some(91));
    let guard = lock(&root);
    let report = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).unwrap();
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("child-crash")]
    );
    cleanup(&root);
}

fn run_publish_stage_child(stage: &str, exit_code: i32) {
    let root_path = std::env::var_os("TY_PLUS_PUBLISH_STAGE_ROOT").map(PathBuf::from);
    if let Some(root_path) = root_path {
        let root = ManagedRoot::new(root_path).unwrap();
        fs::create_dir_all(root.as_path().join("settings")).unwrap();
        let guard = lock(&root);
        let invocation = InvocationId::new(format!("child-{stage}-stage"));
        let capability = transaction_open(
            root.as_path(),
            Path::new("settings/user.json"),
            invocation.as_str(),
        )
        .unwrap();
        let body = format!("published-{stage}").into_bytes();
        let mut body_temp = capability.create_temp().unwrap();
        body_temp.write_all(&body).unwrap();
        body_temp.sync_all().unwrap();
        drop(body_temp);

        let revision = serde_json::json!({
            "revision": format!("child-{stage}-revision"),
            "timestamp": "fixture",
        });
        let revision_bytes = serde_json::to_vec_pretty(&revision).unwrap();
        let mut revision_temp = capability.create_revision().unwrap();
        revision_temp.write_all(&revision_bytes).unwrap();
        revision_temp.sync_all().unwrap();
        drop(revision_temp);

        let mut journal = serde_json::json!({
            "version": 2,
            "invocation_id": invocation,
            "transaction_key": "b".repeat(64),
            "destination": "settings/user.json",
            "state": "Committing",
            "body_size": body.len(),
            "body_hash": format!("{:x}", sha2::Sha256::digest(&body)),
            "revision_size": revision_bytes.len(),
            "revision_hash": format!("{:x}", sha2::Sha256::digest(&revision_bytes)),
            "commit_sequence": serde_json::Value::Null,
            "checksum": serde_json::Value::Null,
        });
        let unsigned = journal.clone();
        let mut unsigned = unsigned;
        unsigned.as_object_mut().unwrap().remove("checksum");
        journal["checksum"] = serde_json::Value::String(format!(
            "{:x}",
            sha2::Sha256::digest(serde_json::to_vec(&unsigned).unwrap())
        ));
        capability
            .write_journal(&serde_json::to_vec(&journal).unwrap())
            .unwrap();
        capability.replace_body().unwrap();
        if stage == "revision" {
            capability.replace_revision().unwrap();
        }
        drop(guard);
        std::process::exit(exit_code);
    }
}

#[test]
fn subprocess_crash_after_body_publish_recovers_on_restart() {
    run_publish_stage_child("body", 92);
    let root = managed_root();
    let status = Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("subprocess_crash_after_body_publish_recovers_on_restart")
        .arg("--nocapture")
        .env("TY_PLUS_PUBLISH_STAGE_ROOT", root.as_path())
        .env("TY_PLUS_PUBLISH_STAGE", "body")
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(92));
    let guard = lock(&root);
    let report = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).unwrap();
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("child-body-stage")]
    );
    assert_eq!(
        fs::read(root.as_path().join("settings/user.json")).unwrap(),
        b"published-body"
    );
    cleanup(&root);
}

#[test]
fn subprocess_crash_after_revision_publish_recovers_on_restart() {
    run_publish_stage_child("revision", 93);
    let root = managed_root();
    let status = Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("subprocess_crash_after_revision_publish_recovers_on_restart")
        .arg("--nocapture")
        .env("TY_PLUS_PUBLISH_STAGE_ROOT", root.as_path())
        .env("TY_PLUS_PUBLISH_STAGE", "revision")
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(93));
    let guard = lock(&root);
    let report = Transaction::recover(&guard, RegisteredPath::new("settings").unwrap()).unwrap();
    assert_eq!(
        report.recovered_invocations,
        vec![InvocationId::new("child-revision-stage")]
    );
    assert!(String::from_utf8_lossy(
        &fs::read(root.as_path().join("settings/user.rev.json")).unwrap()
    )
    .contains("child-revision-revision"));
    cleanup(&root);
}

#[test]
fn json_persistence_and_manifest_helpers_use_the_managed_transaction() {
    let root = managed_root();
    let guard = lock(&root);
    let invocation = InvocationId::new("integration-writes");
    let context = MutationContext::new(&guard, &invocation);
    let store = JsonFileStore::new(root.as_path());
    store
        .write_with_context(
            &context,
            "settings/managed",
            &serde_json::json!({"managed": true}),
            None,
        )
        .expect("managed json write");
    assert!(root.as_path().join("settings/managed.json").exists());
    ApplicationFolderManifest::new()
        .write_managed(
            &context,
            RegisteredPath::new("settings/manifest.json").unwrap(),
        )
        .expect("managed manifest write");
    assert!(root.as_path().join("settings/manifest.json").exists());
    PersistenceIoHandler::new(root.as_path().to_string_lossy().into_owned())
        .write_json_with_context(
            &context,
            PersistenceWriteJsonRequest {
                key: "app".to_owned(),
                args: Vec::new(),
                value: serde_json::json!({"transactional": true}),
            },
        )
        .expect("handler write uses managed transaction");
    assert!(root.as_path().join("settings/app.json").exists());
    cleanup(&root);
}
