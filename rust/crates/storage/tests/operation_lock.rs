use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

use ty_plus_host_filesystem::platform::{exclusive_open, PlatformLockHandle};
use ty_plus_storage::{
    HostSessionRoots, LockError, ManagedRoot, ManagedRootSelection, OperationLock, RegisteredPath,
    SessionAppRoot, SessionSupportRoot,
};

fn root() -> ManagedRoot {
    static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);
    let path = std::env::temp_dir().join(format!(
        "ty-plus-operation-lock-{}-{}",
        std::process::id(),
        NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&path);
    ManagedRoot::new(path).expect("test root is absolute")
}

#[test]
fn second_holder_times_out_and_drop_releases_the_os_lock() {
    let managed_root = root();
    let first =
        OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1)).unwrap();
    assert_eq!(
        OperationLock::acquire(&managed_root, Instant::now() + Duration::from_millis(20)),
        Err(LockError::Timeout)
    );
    drop(first);
    OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1))
        .expect("drop releases the operating-system lock");
}

#[test]
fn lock_entry_remains_visible_and_can_be_reacquired_after_release() {
    let managed_root = root();
    let lock = OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1))
        .expect("first lock acquisition");
    assert_eq!(
        lock.path(),
        managed_root
            .as_path()
            .join("control")
            .join("operation.lock")
    );
    assert!(lock.path().exists());
    lock.release().expect("explicit release");
    assert!(managed_root.control_lock_path().exists());
    OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1))
        .expect("a released lock can be acquired again")
        .release()
        .expect("second release");
}

#[test]
fn process_exit_releases_the_os_lock_and_leaves_the_entry_reacquirable() {
    if std::env::var_os("TY_PLUS_OPERATION_LOCK_CHILD").is_some() {
        let path = PathBuf::from(
            std::env::var_os("TY_PLUS_OPERATION_LOCK_ROOT").expect("child root path"),
        );
        let managed_root = ManagedRoot::new(path).expect("child root is absolute");
        let _lock = OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1))
            .expect("child lock acquisition");
        std::process::abort();
    }

    let managed_root = root();
    let child = std::process::Command::new(std::env::current_exe().expect("test executable"))
        .args([
            "--exact",
            "process_exit_releases_the_os_lock_and_leaves_the_entry_reacquirable",
            "--nocapture",
        ])
        .env("TY_PLUS_OPERATION_LOCK_CHILD", "1")
        .env("TY_PLUS_OPERATION_LOCK_ROOT", managed_root.as_path())
        .status()
        .expect("spawn lock child");
    assert!(!child.success(), "the child must exit as a crashed process");
    assert!(managed_root.control_lock_path().exists());
    OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1))
        .expect("OS lock is released after process termination")
        .release()
        .expect("parent release");
}

#[test]
fn different_managed_roots_have_independent_locks() {
    let first_root = root();
    let second_root = root();
    let first = OperationLock::acquire(&first_root, Instant::now() + Duration::from_secs(1))
        .expect("first lock acquisition");
    let second = OperationLock::acquire(&second_root, Instant::now() + Duration::from_millis(20))
        .expect("different roots do not contend");
    drop(first);
    drop(second);
}

#[test]
fn registered_path_keeps_only_a_validated_relative_path() {
    let path = RegisteredPath::new(PathBuf::from("link/file.json")).expect("relative path");
    assert_eq!(path.as_path(), Path::new("link/file.json"));
}

#[test]
fn resolved_storage_root_handle_revalidates_before_use() {
    let support = root();
    let outside = support.as_path().with_extension("resolved-outside");
    let _ = fs::remove_dir_all(&outside);
    fs::create_dir_all(support.as_path()).expect("support fixture");
    let managed = support.as_path().join("ty-plus");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &managed).expect("root symlink fixture");
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&outside, &managed).expect("root junction fixture");

    let roots = HostSessionRoots::new(
        SessionAppRoot::new(support.as_path().join("ae-app")).expect("app root"),
        SessionSupportRoot::new(support.as_path().to_path_buf()).expect("support root"),
    );
    let resolved = roots.resolve_storage(ManagedRootSelection::SessionDefault);
    assert!(resolved.managed_root_handle().is_err());
    assert!(!outside.join("control").exists());
}

#[test]
fn expired_deadline_has_no_filesystem_side_effect() {
    let managed_root = root();
    assert_eq!(
        OperationLock::acquire(&managed_root, Instant::now() - Duration::from_millis(1)),
        Err(LockError::Timeout)
    );
    assert!(!managed_root.as_path().exists());
    assert!(!managed_root.control_lock_path().exists());
}

#[test]
fn managed_root_symlink_is_rejected_without_external_creation() {
    let managed_root = root();
    let outside = managed_root.as_path().with_extension("outside");
    let _ = fs::remove_dir_all(&outside);
    let parent = managed_root.as_path().parent().expect("root parent");
    fs::create_dir_all(parent).expect("root parent fixture");

    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, managed_root.as_path()).expect("root symlink fixture");
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&outside, managed_root.as_path())
        .expect("root junction fixture");

    let result = OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1));
    assert!(result.is_err());
    assert!(
        !outside.exists(),
        "rejected root must not create outside/control"
    );
}

#[test]
fn managed_root_constructor_rejects_existing_symlink() {
    let managed_root = root();
    let outside = managed_root.as_path().with_extension("constructor-outside");
    let parent = managed_root.as_path().parent().expect("root parent");
    fs::create_dir_all(parent).expect("root parent fixture");

    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, managed_root.as_path()).expect("root symlink fixture");
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&outside, managed_root.as_path())
        .expect("root junction fixture");

    assert_eq!(
        ManagedRoot::new(managed_root.as_path()),
        Err(ty_plus_storage::RootValidationError::SymlinkTraversal)
    );
    assert!(!outside.exists());
}

#[test]
fn managed_root_parent_symlink_is_rejected_without_external_creation() {
    static NEXT_PARENT: AtomicU64 = AtomicU64::new(0);
    let parent_link = std::env::temp_dir().join(format!(
        "ty-plus-operation-parent-link-{}-{}",
        std::process::id(),
        NEXT_PARENT.fetch_add(1, Ordering::Relaxed)
    ));
    let outside = parent_link.with_extension("outside");
    let _ = fs::remove_dir_all(&parent_link);
    let _ = fs::remove_dir_all(&outside);
    fs::create_dir_all(&outside).expect("outside fixture");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &parent_link).expect("parent symlink fixture");
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&outside, &parent_link).expect("parent junction fixture");

    let escaped_root = parent_link.join("ty-plus");
    assert!(ManagedRoot::new(&escaped_root).is_err());
    assert!(exclusive_open(&escaped_root).is_err());
    assert!(!outside.join("ty-plus").exists());
}

#[test]
fn control_symlink_is_rejected_without_external_creation() {
    let managed_root = root();
    fs::create_dir_all(managed_root.as_path()).expect("managed root fixture");
    let outside = managed_root.as_path().with_extension("control-outside");
    let _ = fs::remove_dir_all(&outside);
    let control = managed_root.as_path().join("control");

    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &control).expect("control symlink fixture");
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&outside, &control).expect("control junction fixture");

    let result = OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1));
    assert!(result.is_err());
    assert!(
        !outside.exists(),
        "rejected control must not create outside lock entry"
    );
}

#[test]
fn final_lock_symlink_is_rejected_without_touching_target() {
    let managed_root = root();
    let control = managed_root.as_path().join("control");
    fs::create_dir_all(&control).expect("control fixture");
    let outside = managed_root.as_path().with_extension("lock-target");
    fs::write(&outside, b"sentinel").expect("outside target fixture");
    let lock_path = managed_root.control_lock_path();

    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside, &lock_path).expect("lock symlink fixture");
    #[cfg(windows)]
    std::os::windows::fs::symlink_file(&outside, &lock_path).expect("lock symlink fixture");

    assert!(
        OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(1)).is_err()
    );
    assert_eq!(
        fs::read(&outside).expect("target remains readable"),
        b"sentinel"
    );
}

#[test]
fn operation_lock_uses_the_adjacent_platform_boundary() {
    let managed_root = root();
    let platform_lock: PlatformLockHandle =
        exclusive_open(managed_root.as_path()).expect("platform lock open");
    platform_lock.try_lock().expect("platform lock acquisition");
    assert_eq!(
        OperationLock::acquire(&managed_root, Instant::now() + Duration::from_millis(20)),
        Err(LockError::Timeout)
    );
    platform_lock.unlock().expect("platform lock release");
}
