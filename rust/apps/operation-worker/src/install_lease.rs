use std::fmt::Write as _;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use crate::platform;
use ty_plus_protocol::CURRENT_PROTOCOL_VERSION;

#[allow(dead_code)]
#[derive(Debug)]
pub enum InstallLeaseError {
    Io(io::Error),
    DeadlineExceeded,
    InvalidExecutable,
    DigestMismatch,
}

// These bytes are part of the executable's self-description.  The bootstrap
// check below reads them from the same opened handle as the format and digest,
// so an executable swapped at its path cannot pass with a different identity.
#[used]
static EMBEDDED_PRODUCT_IDENTITY_SECTION: [u8; 24] = *b"ty-plus.operation-worker";
const _: () = assert!(CURRENT_PROTOCOL_VERSION.major < 10 && CURRENT_PROTOCOL_VERSION.minor < 10,);
const EMBEDDED_PROTOCOL_IDENTITY_SECTION: [u8; 20] = {
    let mut marker = *b"ty-plus.protocol/0.0";
    marker[17] = b'0' + CURRENT_PROTOCOL_VERSION.major as u8;
    marker[19] = b'0' + CURRENT_PROTOCOL_VERSION.minor as u8;
    marker
};
#[used]
static EMBEDDED_PROTOCOL_IDENTITY_BYTES: [u8; 20] = EMBEDDED_PROTOCOL_IDENTITY_SECTION;

impl From<io::Error> for InstallLeaseError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

pub struct InstallLease {
    raw: Option<platform::RawLease>,
}

impl Drop for InstallLease {
    fn drop(&mut self) {
        let _ = self.raw.take();
    }
}

pub fn installation_lock_path(installation_root: &Path) -> PathBuf {
    installation_root
        .parent()
        .unwrap_or(installation_root)
        .join(".ty-plus-operation-worker-install-lease")
}

pub fn acquire_shared(installation_root: &Path) -> Result<InstallLease, InstallLeaseError> {
    let path = installation_lock_path(installation_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(InstallLease {
        raw: Some(platform::acquire(&path, true)?),
    })
}

#[allow(dead_code)]
pub fn acquire_exclusive(
    installation_root: &Path,
    deadline: Duration,
) -> Result<InstallLease, InstallLeaseError> {
    let path = installation_lock_path(installation_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let end = Instant::now() + deadline;
    loop {
        match platform::acquire(&path, false) {
            Ok(raw) => return Ok(InstallLease { raw: Some(raw) }),
            Err(error) if Instant::now() < end => {
                if !is_contention(&error) {
                    return Err(error.into());
                }
                thread::sleep(Duration::from_millis(10));
            }
            Err(_) => return Err(InstallLeaseError::DeadlineExceeded),
        }
    }
}

fn is_contention(error: &io::Error) -> bool {
    #[cfg(target_os = "windows")]
    if matches!(error.raw_os_error(), Some(5 | 32 | 33 | 36)) {
        return true;
    }
    matches!(
        error.kind(),
        io::ErrorKind::WouldBlock | io::ErrorKind::PermissionDenied | io::ErrorKind::AlreadyExists
    )
}

pub fn installation_root_from_executable(executable: &Path) -> Option<PathBuf> {
    let platform_root = executable.parent()?;
    let digest_root = platform_root.parent()?;
    let versions_root = digest_root.parent()?;
    let worker_root = versions_root.parent()?;
    if worker_root.file_name()? != "worker" {
        return None;
    }
    Some(worker_root.parent()?.to_path_buf())
}

pub fn validate_current_executable(
    executable: &Path,
    expected_digest: &str,
) -> Result<(), InstallLeaseError> {
    if !is_digest(expected_digest) {
        return Err(InstallLeaseError::DigestMismatch);
    }
    let mut file = fs::File::open(executable)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    if !valid_format(&bytes) {
        return Err(InstallLeaseError::InvalidExecutable);
    }
    if !embedded_identity_is_valid(&bytes) {
        return Err(InstallLeaseError::InvalidExecutable);
    }
    if sha256_hex(&bytes) != expected_digest.to_ascii_lowercase() {
        return Err(InstallLeaseError::DigestMismatch);
    }
    Ok(())
}

fn embedded_identity_is_valid(bytes: &[u8]) -> bool {
    let product_identity = std::hint::black_box(&EMBEDDED_PRODUCT_IDENTITY_SECTION);
    let protocol_identity = std::hint::black_box(&EMBEDDED_PROTOCOL_IDENTITY_BYTES);
    bytes
        .windows(product_identity.len())
        .any(|window| window == product_identity)
        && bytes
            .windows(protocol_identity.len())
            .any(|window| window == protocol_identity)
}

fn is_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(target_os = "windows")]
fn valid_format(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && &bytes[..2] == b"MZ"
}

#[cfg(target_os = "macos")]
fn valid_format(bytes: &[u8]) -> bool {
    bytes.len() >= 4
        && matches!(
            &bytes[..4],
            [0xcf, 0xfa, 0xed, 0xfe]
                | [0xfe, 0xed, 0xfa, 0xcf]
                | [0xca, 0xfe, 0xba, 0xbe]
                | [0xbe, 0xba, 0xfe, 0xca]
        )
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn valid_format(bytes: &[u8]) -> bool {
    !bytes.is_empty()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut state = [
        0x6a09e667_u32,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ];
    let bit_len = (bytes.len() as u64).wrapping_mul(8);
    let mut padded = bytes.to_vec();
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in padded.chunks_exact(64) {
        let mut words = [0_u32; 64];
        for (index, word) in words[..16].iter_mut().enumerate() {
            *word = u32::from_be_bytes([
                chunk[index * 4],
                chunk[index * 4 + 1],
                chunk[index * 4 + 2],
                chunk[index * 4 + 3],
            ]);
        }
        for index in 16..64 {
            let small_sigma0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let small_sigma1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(small_sigma0)
                .wrapping_add(words[index - 7])
                .wrapping_add(small_sigma1);
        }
        let mut working = state;
        for index in 0..64 {
            let big_sigma1 = working[4].rotate_right(6)
                ^ working[4].rotate_right(11)
                ^ working[4].rotate_right(25);
            let choice = (working[4] & working[5]) ^ ((!working[4]) & working[6]);
            let temp1 = working[7]
                .wrapping_add(big_sigma1)
                .wrapping_add(choice)
                .wrapping_add(SHA256_ROUND_CONSTANTS[index])
                .wrapping_add(words[index]);
            let big_sigma0 = working[0].rotate_right(2)
                ^ working[0].rotate_right(13)
                ^ working[0].rotate_right(22);
            let majority =
                (working[0] & working[1]) ^ (working[0] & working[2]) ^ (working[1] & working[2]);
            let temp2 = big_sigma0.wrapping_add(majority);
            working = [
                temp1.wrapping_add(temp2),
                working[0],
                working[1],
                working[2],
                working[3].wrapping_add(temp1),
                working[4],
                working[5],
                working[6],
            ];
        }
        for index in 0..8 {
            state[index] = state[index].wrapping_add(working[index]);
        }
    }
    let mut result = String::with_capacity(64);
    for word in state {
        let _ = write!(result, "{word:08x}");
    }
    result
}

const SHA256_ROUND_CONSTANTS: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_standard_empty_vector() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn executable_identity_requires_product_and_protocol_markers() {
        let valid = [
            b"MZ".as_slice(),
            EMBEDDED_PRODUCT_IDENTITY_SECTION.as_slice(),
            EMBEDDED_PROTOCOL_IDENTITY_BYTES.as_slice(),
        ]
        .concat();
        assert!(embedded_identity_is_valid(&valid));
        assert_eq!(
            &EMBEDDED_PRODUCT_IDENTITY_SECTION,
            b"ty-plus.operation-worker"
        );
        assert_eq!(&EMBEDDED_PROTOCOL_IDENTITY_BYTES, b"ty-plus.protocol/1.0");
        assert!(!embedded_identity_is_valid(
            &valid[..valid.len() - EMBEDDED_PROTOCOL_IDENTITY_SECTION.len()]
        ));
        assert!(!embedded_identity_is_valid(
            &valid[..2]
                .iter()
                .copied()
                .chain(EMBEDDED_PROTOCOL_IDENTITY_BYTES.iter().copied())
                .collect::<Vec<_>>()
        ));
    }

    #[test]
    fn lock_path_is_outside_installation_tree_and_version_neutral() {
        let root = Path::new("C:/Adobe/CEP/extensions/app.ty-plus");
        let lock = installation_lock_path(root);
        assert_eq!(
            lock,
            Path::new("C:/Adobe/CEP/extensions/.ty-plus-operation-worker-install-lease")
        );
        assert!(!lock.starts_with(root));
        assert!(!lock.to_string_lossy().contains("pid"));
        assert!(!lock.to_string_lossy().contains("version"));
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    #[test]
    fn shared_holder_blocks_exclusive_until_drop_then_allows_retry() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join(".tmp")
            .join("ow-dist-003-lease-fixture");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let shared = acquire_shared(&root).unwrap();
        let contention = acquire_exclusive(&root, Duration::from_millis(50));
        assert!(
            matches!(&contention, Err(InstallLeaseError::DeadlineExceeded)),
            "unexpected contention result"
        );
        drop(shared);
        let exclusive = acquire_exclusive(&root, Duration::from_millis(100)).unwrap();
        drop(exclusive);
        fs::remove_dir_all(root).unwrap();
    }
}
