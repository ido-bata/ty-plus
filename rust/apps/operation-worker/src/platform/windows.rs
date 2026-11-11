use std::ffi::OsStr;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::ptr::null_mut;

type Handle = *mut std::ffi::c_void;

const INVALID_HANDLE_VALUE: Handle = -1isize as Handle;
const GENERIC_READ: u32 = 0x8000_0000;
const GENERIC_WRITE: u32 = 0x4000_0000;
const FILE_SHARE_READ: u32 = 0x0000_0001;
const FILE_SHARE_WRITE: u32 = 0x0000_0002;
const FILE_SHARE_DELETE: u32 = 0x0000_0004;
const OPEN_ALWAYS: u32 = 4;
const FILE_ATTRIBUTE_NORMAL: u32 = 0x0000_0080;

unsafe extern "system" {
    fn CreateFileW(
        name: *const u16,
        access: u32,
        share_mode: u32,
        security: *mut std::ffi::c_void,
        creation: u32,
        attributes: u32,
        template: Handle,
    ) -> Handle;
    fn CloseHandle(handle: Handle) -> i32;
}

pub(crate) struct RawLease {
    handle: Handle,
}

impl Drop for RawLease {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}

pub(crate) fn acquire(path: &Path, shared: bool) -> io::Result<RawLease> {
    let mut wide: Vec<u16> = OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let share_mode = if shared {
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
    } else {
        0
    };
    let handle = unsafe {
        CreateFileW(
            wide.as_mut_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            share_mode,
            null_mut(),
            OPEN_ALWAYS,
            FILE_ATTRIBUTE_NORMAL,
            null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    Ok(RawLease { handle })
}
