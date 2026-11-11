use std::fs::{File, OpenOptions};
use std::io;
use std::os::fd::AsRawFd;
use std::path::Path;

const LOCK_SH: i32 = 1;
const LOCK_EX: i32 = 2;
const LOCK_NB: i32 = 4;

unsafe extern "C" {
    fn flock(fd: i32, operation: i32) -> i32;
}

#[allow(dead_code)]
pub(crate) struct RawLease {
    file: File,
}

pub(crate) fn acquire(path: &Path, shared: bool) -> io::Result<RawLease> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(path)?;
    let operation = if shared { LOCK_SH } else { LOCK_EX } | LOCK_NB;
    let result = unsafe { flock(file.as_raw_fd(), operation) };
    if result != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(RawLease { file })
}
