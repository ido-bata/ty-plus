use std::io::{self, Read};
use std::path::Path;

use ty_plus_operation_worker::{
    ProductionOperationExecutor, WorkerDependencies, build_product_online_config, run_once,
};

mod install_lease;
mod platform;

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--install-lease-exclusive") {
        if run_exclusive_lease_helper().is_err() {
            std::process::exit(1);
        }
        return;
    }
    let shared_lease = match bootstrap_shared_lease() {
        Ok(lease) => lease,
        Err(_) => std::process::exit(1),
    };
    let reader = io::stdin();
    let writer = io::stdout();
    let executor =
        ProductionOperationExecutor::from_product_online_config(build_product_online_config());
    let dependencies = WorkerDependencies {
        executor: &executor,
    };
    if run_once(reader, writer, &dependencies).is_err() {
        // Wire failures are represented by the protocol when possible. Keep
        // stderr silent so raw request paths, payloads, or secrets cannot leak.
        std::process::exit(1);
    }
    drop(shared_lease);
}

fn run_exclusive_lease_helper() -> Result<(), install_lease::InstallLeaseError> {
    let mut args = std::env::args().skip(2);
    let installation_root = args
        .next()
        .ok_or(install_lease::InstallLeaseError::InvalidExecutable)?;
    let deadline_ms = args
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or(install_lease::InstallLeaseError::InvalidExecutable)?;
    let expected_digest = args
        .next()
        .ok_or(install_lease::InstallLeaseError::DigestMismatch)?;
    let executable = std::env::current_exe().map_err(install_lease::InstallLeaseError::Io)?;
    let _lease = install_lease::acquire_exclusive(
        Path::new(&installation_root),
        std::time::Duration::from_millis(deadline_ms),
    )?;
    install_lease::validate_current_executable(&executable, &expected_digest)?;
    use std::io::Write;
    std::io::stdout()
        .write_all(&[1])
        .map_err(install_lease::InstallLeaseError::Io)?;
    std::io::stdout()
        .flush()
        .map_err(install_lease::InstallLeaseError::Io)?;
    let mut input = Vec::new();
    std::io::stdin()
        .read_to_end(&mut input)
        .map_err(install_lease::InstallLeaseError::Io)?;
    Ok(())
}

fn bootstrap_shared_lease()
-> Result<Option<install_lease::InstallLease>, install_lease::InstallLeaseError> {
    let executable = std::env::current_exe().map_err(install_lease::InstallLeaseError::Io)?;
    let digest = std::env::var_os("TY_PLUS_WORKER_ARTIFACT_SHA256")
        .ok_or(install_lease::InstallLeaseError::DigestMismatch)?;
    let digest = digest
        .to_str()
        .ok_or(install_lease::InstallLeaseError::DigestMismatch)?;
    let installation_root =
        install_lease::installation_root_from_executable(Path::new(&executable))
            .ok_or(install_lease::InstallLeaseError::InvalidExecutable)?;
    let lease = install_lease::acquire_shared(&installation_root)?;
    install_lease::validate_current_executable(Path::new(&executable), digest)?;
    Ok(Some(lease))
}
