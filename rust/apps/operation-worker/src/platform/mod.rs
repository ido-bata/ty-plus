//! Native shared/exclusive installation-lock primitives.

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub(crate) use windows::RawLease;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub(crate) use macos::RawLease;

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod unsupported {
    use std::{io, path::Path};

    pub(crate) struct RawLease;

    pub(crate) fn acquire(_path: &Path, _shared: bool) -> io::Result<RawLease> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "operation-worker install leases require Windows or macOS",
        ))
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub(crate) use unsupported::RawLease;

pub(crate) fn acquire(path: &std::path::Path, shared: bool) -> std::io::Result<RawLease> {
    #[cfg(target_os = "windows")]
    {
        windows::acquire(path, shared)
    }
    #[cfg(target_os = "macos")]
    {
        macos::acquire(path, shared)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        unsupported::acquire(path, shared)
    }
}
