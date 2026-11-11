use std::fs;
use std::time::{Duration, Instant};

use ty_plus_storage::{
    operation_history::{HistoryEntry, HistoryStore, HistoryStoreConfig},
    retention::{DiagnosticBundleStore, WorkerLogStore},
    retention::{RetentionError, RetentionPolicy},
    snapshot::{SnapshotStore, WorkspaceSnapshot},
    ApplicationFolderManifest, InvocationId, ManagedRoot, ManagedStatePolicy, ManifestItem,
    MutationContext, OperationLock, OperationLockGuard, RegisteredPath, ResetOutcome, Transaction,
};

fn test_dir(name: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!(
        "ty-plus-retention-policy-{name}-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).expect("test directory should be created");
    path
}

fn context(dir: &std::path::Path) -> (OperationLockGuard, InvocationId) {
    let root = ManagedRoot::new(dir).expect("managed root should be valid");
    let lock = OperationLock::acquire(&root, Instant::now() + Duration::from_secs(2))
        .expect("operation lock should be acquired");
    (lock, InvocationId::new("retention-policy-test"))
}

#[test]
fn retention_policy_validates_all_count_and_byte_caps_without_ttl() {
    let policy = RetentionPolicy::new(100, 10, 5, 5 * 1024 * 1024, 10 * 1024 * 1024)
        .expect("product policy should be accepted");

    assert_eq!(policy.history_count(), 100);
    assert_eq!(policy.snapshot_count(), 10);
    assert_eq!(policy.worker_log_files(), 5);
    assert_eq!(policy.worker_log_bytes(), 5 * 1024 * 1024);
    assert_eq!(policy.diagnostic_bytes(), 10 * 1024 * 1024);
    let json = serde_json::to_string(&policy).expect("policy should serialize");
    assert!(!json.contains("ttl"));
    assert!(matches!(
        RetentionPolicy::new(501, 10, 5, 5 * 1024 * 1024, 10 * 1024 * 1024),
        Err(RetentionError::HistoryCountOutOfRange { .. })
    ));
    assert!(RetentionPolicy::new(0, 1, 0, 0, 0).is_ok());
    let json_max_plus_one = [
        ("history_count", serde_json::json!(501)),
        ("snapshot_count", serde_json::json!(101)),
        ("worker_log_files", serde_json::json!(6)),
        ("worker_log_bytes", serde_json::json!(5 * 1024 * 1024 + 1)),
        ("diagnostic_bytes", serde_json::json!(10 * 1024 * 1024 + 1)),
    ];
    for (field, value) in json_max_plus_one {
        let mut object = serde_json::to_value(policy).unwrap();
        object[field] = value;
        assert!(
            serde_json::from_value::<RetentionPolicy>(object).is_err(),
            "{field} max+1 must be rejected by JSON deserialization"
        );
    }
    let round_trip: RetentionPolicy = serde_json::from_str(&json).unwrap();
    assert_eq!(round_trip, policy);
    assert!(RetentionPolicy::new(500, 100, 5, 5 * 1024 * 1024, 10 * 1024 * 1024).is_ok());
    assert!(RetentionPolicy::new(500, 101, 5, 5 * 1024 * 1024, 10 * 1024 * 1024).is_err());
    assert!(RetentionPolicy::new(500, 100, 6, 5 * 1024 * 1024, 10 * 1024 * 1024).is_err());
    assert!(RetentionPolicy::new(500, 100, 5, 5 * 1024 * 1024 + 1, 10 * 1024 * 1024).is_err());
    assert!(RetentionPolicy::new(500, 100, 5, 5 * 1024 * 1024, 10 * 1024 * 1024 + 1).is_err());
}

#[test]
fn log_and_diagnostic_policies_enforce_the_configured_values() {
    let configured = RetentionPolicy::new(0, 1, 0, 0, 1).unwrap();
    let logs = ty_plus_storage::retention::RuntimeLogPolicy::from_policy(configured);
    assert_eq!(logs.max_files(), 0);
    assert_eq!(logs.max_total_bytes(), 0);
    assert!(logs.should_rotate(0, 0));

    let diagnostics = ty_plus_storage::retention::DiagnosticBundlePolicy::from_policy(configured);
    assert_eq!(diagnostics.max_bytes(), 1);
    assert!(diagnostics.validate_generated_size(1).is_ok());
    assert!(diagnostics.validate_generated_size(2).is_err());
}

#[test]
fn managed_state_policy_keeps_reset_inventory_visible_and_scratch_disposable() {
    let policy = ManagedStatePolicy;
    assert!(policy.reset_inventory().contains(&"cache"));
    assert_eq!(policy.search_cache_path(), "cache/search");
    let registered = policy
        .registered_items()
        .into_iter()
        .map(|item| item.path().as_path().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    assert!(registered.iter().any(|path| path == "operation-history"));
    assert!(registered.iter().any(|path| path == "workspace-snapshots"));
    assert!(registered.iter().any(|path| path == "cache"));
    assert!(registered.iter().any(|path| path == "migration-records"));
    assert!(registered.iter().any(|path| path == "migration-fixtures"));
    assert!(registered.iter().any(|path| path == "relocation-requests"));
    assert!(registered.iter().any(|path| path == "relocation-results"));
    assert_eq!(
        policy
            .registered_search_cache_path()
            .as_path()
            .to_string_lossy(),
        "cache/search"
    );
    let cache_target = policy.reset_target("cache").unwrap();
    assert_eq!(
        cache_target.kind(),
        ty_plus_storage::RegisteredStorageKind::Directory
    );
    assert!(cache_target.resettable());
    assert!(policy.reset_target("cache/unknown-link").is_err());
    assert!(policy.reset_target("../outside").is_err());
    assert!(policy.reset_target("control/operation.lock").is_err());
    let scratch = policy.disposable_scratch().unwrap();
    let path = scratch.path().to_path_buf();
    assert!(path.starts_with(std::env::temp_dir()));
    assert!(path.exists());
    drop(scratch);
    assert!(!path.exists());
}

#[test]
fn managed_reset_removes_only_registered_targets_after_full_preflight() {
    let dir = test_dir("managed-reset");
    fs::create_dir_all(dir.join("cache/nested")).unwrap();
    fs::write(dir.join("cache/nested/value.json"), "{}").expect("cache fixture should be writable");
    fs::write(dir.join("unregistered.txt"), "keep").unwrap();

    let policy = ManagedStatePolicy;
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    let mut transaction = Transaction::prepare(
        &lock,
        RegisteredPath::new("operation-history.json").unwrap(),
        invocation.clone(),
    )
    .unwrap();
    transaction.write_all(b"[]").unwrap();
    transaction.flush().unwrap();
    transaction.commit().unwrap();
    assert!(policy
        .reset_with_context(&mutation_context, dir.join("cache"))
        .is_err());
    assert!(policy
        .reset_with_context(&mutation_context, "cache/../outside")
        .is_err());
    assert_eq!(
        policy
            .reset_with_context(&mutation_context, "cache")
            .unwrap(),
        ResetOutcome::Removed
    );
    assert!(!dir.join("cache").exists());
    assert!(dir.join("unregistered.txt").exists());
    assert_eq!(
        policy
            .reset_with_context(&mutation_context, "cache")
            .unwrap(),
        ResetOutcome::Missing
    );
    assert_eq!(
        policy
            .reset_with_context(&mutation_context, "operation-history")
            .unwrap(),
        ResetOutcome::Removed
    );
    assert!(!dir.join("operation-history.json").exists());
    assert!(!dir.join("operation-history.rev.json").exists());

    fs::create_dir_all(dir.join("cache")).unwrap();
    fs::write(dir.join("cache/should-survive-preflight"), "keep").unwrap();
    let mut manifest = ApplicationFolderManifest::new();
    manifest.add_item(ManifestItem {
        path: "cache".to_string(),
        description: "cache".to_string(),
        resettable: true,
    });
    manifest.add_item(ManifestItem {
        path: "../outside".to_string(),
        description: "corrupt".to_string(),
        resettable: true,
    });
    assert!(policy
        .reset_manifest_with_context(&mutation_context, &manifest)
        .is_err());
    assert!(dir.join("cache/should-survive-preflight").exists());

    let mut transaction = Transaction::prepare(
        &lock,
        RegisteredPath::new("operation-history.json").unwrap(),
        invocation.clone(),
    )
    .unwrap();
    transaction.write_all(b"[]").unwrap();
    transaction.flush().unwrap();
    transaction.commit().unwrap();
    let mut valid_manifest = ApplicationFolderManifest::new();
    valid_manifest.add_item(ManifestItem {
        path: "cache".to_string(),
        description: "cache".to_string(),
        resettable: true,
    });
    valid_manifest.add_item(ManifestItem {
        path: "operation-history".to_string(),
        description: "history".to_string(),
        resettable: true,
    });
    assert_eq!(
        policy
            .reset_manifest_with_context(&mutation_context, &valid_manifest)
            .unwrap(),
        vec![ResetOutcome::Removed, ResetOutcome::Removed]
    );
    assert!(!dir.join("cache").exists());
    assert!(!dir.join("operation-history.json").exists());
    assert!(!dir.join("operation-history.rev.json").exists());

    drop(lock);
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn managed_reset_rejects_corrupt_revision_and_logical_duplicates_before_mutation() {
    let dir = test_dir("managed-reset-corrupt");
    fs::create_dir_all(dir.join("cache")).unwrap();
    fs::write(dir.join("cache/keep"), "keep").unwrap();
    fs::write(dir.join("workspace-snapshots.json"), "not-json").unwrap();
    fs::write(
        dir.join("workspace-snapshots.rev.json"),
        r#"{"revision":"snapshot-revision","timestamp":"2026-08-22T00:00:00Z"}"#,
    )
    .unwrap();
    let policy = ManagedStatePolicy;
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    let mut manifest = ApplicationFolderManifest::new();
    manifest.add_item(ManifestItem {
        path: "cache".to_string(),
        description: "cache".to_string(),
        resettable: true,
    });
    manifest.add_item(ManifestItem {
        path: "workspace-snapshots".to_string(),
        description: "corrupt snapshots".to_string(),
        resettable: true,
    });
    assert!(policy
        .reset_manifest_with_context(&mutation_context, &manifest)
        .is_err());
    assert!(dir.join("cache/keep").exists());

    let mut duplicate = ApplicationFolderManifest::new();
    duplicate.add_item(ManifestItem {
        path: "cache".to_string(),
        description: "first".to_string(),
        resettable: true,
    });
    duplicate.add_item(ManifestItem {
        path: "cache".to_string(),
        description: "duplicate".to_string(),
        resettable: true,
    });
    assert!(policy
        .reset_manifest_with_context(&mutation_context, &duplicate)
        .is_err());
    assert!(dir.join("cache/keep").exists());

    fs::write(dir.join("operation-history.json"), "[]").unwrap();
    assert!(matches!(
        policy.reset_with_context(&mutation_context, "operation-history"),
        Err(ty_plus_storage::ResetOperationError::Corrupt { .. })
    ));
    assert!(dir.join("operation-history.json").exists());
    fs::write(dir.join("workspace-snapshots.json"), "[]").unwrap();
    fs::write(
        dir.join("workspace-snapshots.rev.json"),
        r#"{"revision":"retention-policy-test-deadbeef-workspace-snapshots","timestamp":"2026-08-22T00:00:00Z"}"#,
    )
    .unwrap();
    assert!(matches!(
        policy.reset_with_context(&mutation_context, "workspace-snapshots"),
        Err(ty_plus_storage::ResetOperationError::Corrupt { .. })
    ));
    assert!(dir.join("workspace-snapshots.json").exists());
    drop(lock);
    let _ = fs::remove_dir_all(dir);
}

#[cfg(unix)]
#[test]
fn managed_reset_rejects_symlink_target_without_touching_external_data() {
    use std::os::unix::fs::symlink;

    let dir = test_dir("managed-reset-symlink");
    let outside = test_dir("managed-reset-external");
    fs::write(outside.join("keep.txt"), "keep").unwrap();
    symlink(&outside, dir.join("cache")).unwrap();
    let policy = ManagedStatePolicy;
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    assert!(policy
        .reset_with_context(&mutation_context, "cache")
        .is_err());
    assert!(outside.join("keep.txt").exists());
    drop(lock);
    let _ = fs::remove_file(dir.join("cache"));
    let _ = fs::remove_dir_all(dir);
    let _ = fs::remove_dir_all(outside);
}

#[cfg(windows)]
#[test]
fn managed_reset_rejects_reparse_target_without_touching_external_data() {
    use std::os::windows::fs::symlink_dir;

    let dir = test_dir("managed-reset-reparse");
    let outside = test_dir("managed-reset-external");
    fs::write(outside.join("keep.txt"), "keep").unwrap();
    symlink_dir(&outside, dir.join("cache")).unwrap();
    let policy = ManagedStatePolicy;
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    assert!(policy
        .reset_with_context(&mutation_context, "cache")
        .is_err());
    assert!(outside.join("keep.txt").exists());
    drop(lock);
    let _ = fs::remove_dir(dir.join("cache"));
    let _ = fs::remove_dir_all(dir);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn worker_log_store_prunes_by_count_and_bytes_and_rejects_oversize() {
    let dir = test_dir("worker-log-store");
    let configured = RetentionPolicy::new(0, 1, 2, 4, 4).unwrap();
    let store = WorkerLogStore::new(ty_plus_storage::retention::RuntimeLogPolicy::from_policy(
        configured,
    ));
    {
        let (lock, invocation) = context(&dir);
        let mutation_context = MutationContext::new(&lock, &invocation);
        assert_eq!(
            store
                .write_with_context(&mutation_context, "001.log", b"aa")
                .unwrap(),
            0
        );
        assert_eq!(
            store
                .write_with_context(&mutation_context, "002.log", b"bb")
                .unwrap(),
            0
        );
        assert!(store
            .write_with_context(&mutation_context, "003.log", b"c")
            .is_err());
        assert!(store
            .write_with_context(&mutation_context, "004.log", b"12345")
            .is_err());
        let mut transaction = Transaction::prepare(
            &lock,
            RegisteredPath::new("logs/003.log").unwrap(),
            invocation.clone(),
        )
        .unwrap();
        transaction.write_all(b"c").unwrap();
        transaction.flush().unwrap();
        transaction.commit().unwrap();
        assert_eq!(store.rotate_with_context(&mutation_context).unwrap(), 1);
    }
    assert!(!dir.join("logs/001.log").exists());
    assert!(dir.join("logs/002.log").exists());
    assert!(dir.join("logs/003.log").exists());
    assert!(!dir.join("logs/004.log").exists());

    let zero_dir = test_dir("worker-log-zero");
    let zero = WorkerLogStore::new(ty_plus_storage::retention::RuntimeLogPolicy::from_policy(
        RetentionPolicy::new(0, 1, 0, 0, 4).unwrap(),
    ));
    {
        let (lock, invocation) = context(&zero_dir);
        let mutation_context = MutationContext::new(&lock, &invocation);
        assert!(zero
            .write_with_context(&mutation_context, "zero.log", b"")
            .is_err());
    }
    assert!(!zero_dir.join("logs/zero.log").exists());
    let _ = fs::remove_dir_all(zero_dir);
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn worker_log_store_rejects_unknown_entries_before_pruning() {
    let dir = test_dir("worker-log-unknown");
    fs::create_dir_all(dir.join("logs")).unwrap();
    fs::write(dir.join("logs/unknown.txt"), "unexpected").unwrap();
    let store = WorkerLogStore::new(ty_plus_storage::retention::RuntimeLogPolicy::from_policy(
        RetentionPolicy::new(0, 1, 2, 4, 4).unwrap(),
    ));
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    assert!(store.prune_with_context(&mutation_context).is_err());
    drop(lock);
    let _ = fs::remove_dir_all(dir);
}

#[cfg(unix)]
#[test]
fn worker_log_store_rejects_symlink_entries() {
    use std::os::unix::fs::symlink;

    let dir = test_dir("worker-log-symlink");
    let outside = test_dir("worker-log-external");
    fs::create_dir_all(dir.join("logs")).unwrap();
    fs::write(outside.join("external.log"), "external").unwrap();
    symlink(outside.join("external.log"), dir.join("logs/link.log")).unwrap();
    let store = WorkerLogStore::new(ty_plus_storage::retention::RuntimeLogPolicy::from_policy(
        RetentionPolicy::new(0, 1, 2, 4, 4).unwrap(),
    ));
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    assert!(store.prune_with_context(&mutation_context).is_err());
    drop(lock);
    let _ = fs::remove_file(dir.join("logs/link.log"));
    let _ = fs::remove_dir_all(dir);
    let _ = fs::remove_dir_all(outside);
}

#[cfg(windows)]
#[test]
fn worker_log_store_rejects_reparse_entries() {
    use std::os::windows::fs::symlink_file;

    let dir = test_dir("worker-log-reparse");
    let outside = test_dir("worker-log-external");
    fs::create_dir_all(dir.join("logs")).unwrap();
    fs::write(outside.join("external.log"), "external").unwrap();
    symlink_file(outside.join("external.log"), dir.join("logs/link.log")).unwrap();
    let store = WorkerLogStore::new(ty_plus_storage::retention::RuntimeLogPolicy::from_policy(
        RetentionPolicy::new(0, 1, 2, 4, 4).unwrap(),
    ));
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    assert!(store.prune_with_context(&mutation_context).is_err());
    drop(lock);
    let _ = fs::remove_file(dir.join("logs/link.log"));
    let _ = fs::remove_dir_all(dir);
    let _ = fs::remove_dir_all(outside);
}

#[test]
fn diagnostic_bundle_store_validates_bytes_and_explicitly_clears() {
    let dir = test_dir("diagnostic-store");
    let policy = RetentionPolicy::new(0, 1, 2, 4, 3).unwrap();
    let store = DiagnosticBundleStore::new(
        ty_plus_storage::retention::DiagnosticBundlePolicy::from_policy(policy),
    );
    let destination = RegisteredPath::new("diagnostics/bundle.json").unwrap();
    {
        let (lock, invocation) = context(&dir);
        let mutation_context = MutationContext::new(&lock, &invocation);
        assert!(store
            .create_with_context(&mutation_context, destination.clone(), b"123")
            .is_ok());
        assert!(store
            .create_with_context(&mutation_context, destination.clone(), b"1234")
            .is_err());
        assert!(store
            .clear_with_context(&mutation_context, destination)
            .unwrap());
    }
    assert!(!dir.join("diagnostics/bundle.json").exists());
    assert!(!dir.join("diagnostics/bundle.rev.json").exists());

    let zero = DiagnosticBundleStore::new(
        ty_plus_storage::retention::DiagnosticBundlePolicy::from_policy(
            RetentionPolicy::new(0, 1, 2, 4, 0).unwrap(),
        ),
    );
    let destination = RegisteredPath::new("diagnostics/zero.json").unwrap();
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    assert!(zero
        .create_with_context(&mutation_context, destination, b"x")
        .is_err());
    drop(lock);
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn history_zero_disables_new_persistence_but_explicit_clear_removes_existing_data() {
    let dir = test_dir("history-zero");
    let entry = HistoryEntry::new("test", serde_json::json!({}));
    {
        let enabled = HistoryStore::new(&dir, HistoryStoreConfig::new(1).unwrap());
        let (enabled_lock, enabled_invocation) = context(&dir);
        let enabled_context = MutationContext::new(&enabled_lock, &enabled_invocation);
        enabled.save_with_context(&enabled_context, &entry).unwrap();
    }
    assert!(dir.join("operation-history.json").exists());

    let disabled = HistoryStore::new(&dir, HistoryStoreConfig::new(0).unwrap());
    let (disabled_lock, disabled_invocation) = context(&dir);
    let disabled_context = MutationContext::new(&disabled_lock, &disabled_invocation);
    disabled
        .save_with_context(
            &disabled_context,
            &HistoryEntry::new("ignored", serde_json::json!({})),
        )
        .unwrap();
    assert!(disabled.list().unwrap().is_empty());
    assert!(dir.join("operation-history.json").exists());
    disabled.clear_with_context(&disabled_context).unwrap();
    assert!(!dir.join("operation-history.json").exists());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn snapshot_count_is_hard_capped_and_does_not_use_time() {
    let dir = test_dir("snapshots");
    let snapshots = SnapshotStore::new(&dir, 100).unwrap();
    let (lock, invocation) = context(&dir);
    let mutation_context = MutationContext::new(&lock, &invocation);
    for index in 0..101 {
        snapshots
            .save_with_context(
                &mutation_context,
                &WorkspaceSnapshot::new(serde_json::json!({ "index": index }), None),
            )
            .unwrap();
    }
    assert!(snapshots.list().unwrap().len() <= 100);
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn snapshot_clear_removes_json_and_revision_files() {
    let dir = test_dir("snapshot-clear");
    let snapshots = SnapshotStore::new(&dir, 10).unwrap();
    let snapshot = WorkspaceSnapshot::new(serde_json::json!({"value": 1}), None);
    {
        let (lock, invocation) = context(&dir);
        let mutation_context = MutationContext::new(&lock, &invocation);
        snapshots
            .save_with_context(&mutation_context, &snapshot)
            .unwrap();
    }
    assert!(dir.join("workspace-snapshots.json").exists());
    assert!(dir.join("workspace-snapshots.rev.json").exists());
    {
        let (lock, invocation) = context(&dir);
        let mutation_context = MutationContext::new(&lock, &invocation);
        snapshots.clear_with_context(&mutation_context).unwrap();
    }
    assert!(!dir.join("workspace-snapshots.json").exists());
    assert!(!dir.join("workspace-snapshots.rev.json").exists());
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn deleting_the_last_snapshot_leaves_an_explicit_empty_array() {
    let dir = test_dir("snapshot-delete-last");
    let snapshots = SnapshotStore::new(&dir, 10).unwrap();
    let snapshot = WorkspaceSnapshot::new(serde_json::json!({"value": 1}), None);
    {
        let (lock, invocation) = context(&dir);
        let mutation_context = MutationContext::new(&lock, &invocation);
        snapshots
            .save_with_context(&mutation_context, &snapshot)
            .unwrap();
        snapshots
            .delete_with_context(&mutation_context, &snapshot.id)
            .unwrap();
    }
    assert!(snapshots.list().unwrap().is_empty());
    assert_eq!(
        fs::read_to_string(dir.join("workspace-snapshots.json")).unwrap(),
        "[]"
    );
    assert!(dir.join("workspace-snapshots.rev.json").exists());
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn snapshot_missing_is_empty_but_empty_and_corrupt_files_fail_closed() {
    let missing_dir = test_dir("snapshot-missing");
    let missing = SnapshotStore::new(&missing_dir, 10).unwrap();
    assert!(missing.list().unwrap().is_empty());
    let _ = fs::remove_dir_all(&missing_dir);

    let empty_dir = test_dir("snapshot-empty");
    fs::write(empty_dir.join("workspace-snapshots.json"), "").unwrap();
    let empty = SnapshotStore::new(&empty_dir, 10).unwrap();
    assert!(empty.list().is_err());
    let _ = fs::remove_dir_all(&empty_dir);

    let corrupt_dir = test_dir("snapshot-corrupt");
    fs::write(corrupt_dir.join("workspace-snapshots.json"), "not-json").unwrap();
    let corrupt = SnapshotStore::new(&corrupt_dir, 10).unwrap();
    assert!(corrupt.list().is_err());
    let _ = fs::remove_dir_all(&corrupt_dir);
}
