use std::{
    error::Error,
    fmt,
    path::{Component, Path, PathBuf},
};

/// A non-empty path that is guaranteed to stay lexically below a managed root.
///
/// Filesystem operations must additionally reject symlink/reparse-point escapes
/// when they are implemented. This type prevents request-level absolute paths and
/// `..` traversal without pretending that lexical checks inspect the filesystem.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ManagedRelativePath(PathBuf);

impl ManagedRelativePath {
    /// Validates a path supplied for an operation inside managed storage.
    pub fn new(path: impl Into<PathBuf>) -> Result<Self, ManagedRelativePathError> {
        let path = path.into();
        if path.as_os_str().is_empty() {
            return Err(ManagedRelativePathError::Empty);
        }
        if path.is_absolute() {
            return Err(ManagedRelativePathError::Absolute);
        }

        for component in path.components() {
            match component {
                Component::Normal(_) => {}
                Component::CurDir => return Err(ManagedRelativePathError::CurrentDirectory),
                Component::ParentDir => return Err(ManagedRelativePathError::ParentTraversal),
                Component::RootDir | Component::Prefix(_) => {
                    return Err(ManagedRelativePathError::Absolute);
                }
            }
        }

        Ok(Self(path))
    }

    /// Returns the validated relative path.
    #[must_use]
    pub fn as_path(&self) -> &Path {
        &self.0
    }

    /// Joins this relative path below a validated managed root.
    #[must_use]
    pub(crate) fn resolve_below(&self, managed_root: &Path) -> PathBuf {
        managed_root.join(&self.0)
    }
}

/// A registered managed-root-relative path used for filesystem I/O.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RegisteredPath(ManagedRelativePath);

impl RegisteredPath {
    /// Validates a path before it is registered for managed-root I/O.
    pub fn new(path: impl Into<PathBuf>) -> Result<Self, ManagedRelativePathError> {
        Ok(Self(ManagedRelativePath::new(path)?))
    }

    /// Returns the registered relative path.
    #[must_use]
    pub fn as_path(&self) -> &Path {
        self.0.as_path()
    }
}

/// A registered directory capability. `Root` is the managed root itself;
/// `Child` is a validated relative directory below it.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum RegisteredDirectory {
    /// The managed root directory.
    Root,
    /// A validated child directory.
    Child(RegisteredPath),
}

impl RegisteredDirectory {
    /// Returns the relative path consumed by the host capability boundary.
    #[must_use]
    pub fn as_path(&self) -> &Path {
        match self {
            Self::Root => Path::new(""),
            Self::Child(path) => path.as_path(),
        }
    }
}

/// Failure while validating a managed-storage relative path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedRelativePathError {
    /// The input had no path components.
    Empty,
    /// The input supplied a root or platform prefix.
    Absolute,
    /// The input contained `.`.
    CurrentDirectory,
    /// The input contained `..`.
    ParentTraversal,
}

impl fmt::Display for ManagedRelativePathError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("managed path must not be empty"),
            Self::Absolute => formatter.write_str("managed path must be relative"),
            Self::CurrentDirectory => formatter.write_str("managed path must not contain '.'"),
            Self::ParentTraversal => formatter.write_str("managed path must not contain '..'"),
        }
    }
}

impl Error for ManagedRelativePathError {}

#[cfg(test)]
mod tests {
    use super::{ManagedRelativePath, ManagedRelativePathError};
    use std::path::{Path, PathBuf};

    #[test]
    fn resolves_normal_components_below_the_managed_root() {
        let relative = ManagedRelativePath::new(Path::new("cache/search-index.json"))
            .expect("normal relative components are accepted");

        assert_eq!(
            relative.resolve_below(Path::new("managed-root")),
            PathBuf::from("managed-root/cache/search-index.json")
        );
    }

    #[test]
    fn rejects_parent_traversal() {
        assert_eq!(
            ManagedRelativePath::new(Path::new("cache/../../outside.json")),
            Err(ManagedRelativePathError::ParentTraversal)
        );
    }

    #[test]
    fn rejects_empty_absolute_and_current_directory_inputs() {
        assert_eq!(
            ManagedRelativePath::new(Path::new("")),
            Err(ManagedRelativePathError::Empty)
        );
        assert_eq!(
            ManagedRelativePath::new(Path::new(".")),
            Err(ManagedRelativePathError::CurrentDirectory)
        );

        let absolute = std::env::current_dir()
            .expect("test process has a current directory")
            .join("outside.json");
        assert_eq!(
            ManagedRelativePath::new(absolute),
            Err(ManagedRelativePathError::Absolute)
        );
    }
}
