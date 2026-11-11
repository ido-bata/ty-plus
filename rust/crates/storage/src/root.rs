use std::{
    error::Error,
    fmt,
    path::{Component, Path, PathBuf},
};

use crate::ManagedRelativePath;

const LOCATOR_FILE_NAME: &str = "ty-plus-init.json";
const MANAGED_DIRECTORY_NAME: &str = "ty-plus";

/// A validated user-visible root containing durable ty-plus state.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ManagedRoot(PathBuf);

impl ManagedRoot {
    /// Validates and captures an absolute managed root supplied by storage root resolution.
    pub fn new(path: impl Into<PathBuf>) -> Result<Self, RootValidationError> {
        let path = path.into();
        validate_absolute_path(&path)?;
        reject_existing_links(&path)?;
        Ok(Self(path))
    }

    /// Returns the managed root path.
    #[must_use]
    pub fn as_path(&self) -> &Path {
        &self.0
    }

    /// Returns the visible operation-lock path for this managed root.
    #[must_use]
    pub fn control_lock_path(&self) -> PathBuf {
        self.0.join("control").join("operation.lock")
    }
}

/// Why a managed root was selected for a host session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedRootSource {
    /// The support root supplied by the connected After Effects session.
    SessionDefault,
    /// A browse root explicitly selected by the user.
    ExplicitShared,
}

/// Selection sent to storage root resolution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagedRootSelection {
    /// Keep this After Effects session isolated under its supplied support root.
    SessionDefault,
    /// Share storage only because the user explicitly selected this browse root.
    ExplicitShared(SharedBrowseRoot),
}

macro_rules! absolute_path_type {
    ($name:ident, $description:literal) => {
        #[doc = $description]
        #[derive(Debug, Clone, PartialEq, Eq)]
        pub struct $name(PathBuf);

        impl $name {
            /// Validates a path supplied by the owning boundary.
            pub fn new(path: impl Into<PathBuf>) -> Result<Self, RootValidationError> {
                let path = path.into();
                validate_absolute_path(&path)?;
                Ok(Self(path))
            }

            /// Returns the validated absolute path.
            #[must_use]
            pub fn as_path(&self) -> &Path {
                &self.0
            }
        }
    };
}

absolute_path_type!(
    SessionAppRoot,
    "An absolute `app.path` value supplied by ExtendScript for the connected AE session."
);
absolute_path_type!(
    SessionSupportRoot,
    "An absolute writable support root supplied by the connected AE session."
);
absolute_path_type!(
    SharedBrowseRoot,
    "An absolute browse root explicitly selected by the user for shared storage."
);

/// Immutable roots supplied when one After Effects host session connects.
///
/// There is deliberately no After Effects version field: versions are neither
/// storage keys nor an input to root resolution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostSessionRoots {
    app_root: SessionAppRoot,
    support_root: SessionSupportRoot,
}

impl HostSessionRoots {
    /// Captures roots received from the ExtendScript host context.
    #[must_use]
    pub const fn new(app_root: SessionAppRoot, support_root: SessionSupportRoot) -> Self {
        Self {
            app_root,
            support_root,
        }
    }

    /// Returns the AE application root supplied by ExtendScript.
    #[must_use]
    pub fn app_root(&self) -> &SessionAppRoot {
        &self.app_root
    }

    /// Returns the default support root supplied for this AE session.
    #[must_use]
    pub fn support_root(&self) -> &SessionSupportRoot {
        &self.support_root
    }

    /// Resolves the visible managed tree without consulting process-global state.
    #[must_use]
    pub fn resolve_storage(&self, selection: ManagedRootSelection) -> ResolvedStorageRoots {
        let (managed_parent, source) = match selection {
            ManagedRootSelection::SessionDefault => (
                self.support_root.as_path(),
                ManagedRootSource::SessionDefault,
            ),
            ManagedRootSelection::ExplicitShared(ref browse_root) => {
                (browse_root.as_path(), ManagedRootSource::ExplicitShared)
            }
        };

        ResolvedStorageRoots {
            locator_path: self.support_root.as_path().join(LOCATOR_FILE_NAME),
            managed_root: managed_parent.join(MANAGED_DIRECTORY_NAME),
            source,
        }
    }
}

/// Paths derived for storage after an explicit root selection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedStorageRoots {
    locator_path: PathBuf,
    managed_root: PathBuf,
    source: ManagedRootSource,
}

impl ResolvedStorageRoots {
    /// Per-session locator. It always remains under the session support root.
    #[must_use]
    pub fn locator_path(&self) -> &Path {
        &self.locator_path
    }

    /// Visible root containing durable application data.
    #[must_use]
    pub fn managed_root(&self) -> &Path {
        &self.managed_root
    }

    /// Returns the selected root as the lock and filesystem boundary type.
    #[must_use = "the validated managed-root handle or its validation error"]
    pub fn managed_root_handle(&self) -> Result<ManagedRoot, RootValidationError> {
        ManagedRoot::new(self.managed_root.clone())
    }

    /// Resolves a validated relative path inside this managed root.
    ///
    /// This is a lexical guarantee. Storage I/O must additionally reject
    /// symlink/reparse-point escapes when filesystem operations are introduced.
    #[must_use]
    pub fn resolve_managed_path(&self, relative: &ManagedRelativePath) -> PathBuf {
        relative.resolve_below(&self.managed_root)
    }

    /// Reports whether the root is isolated or explicitly shared.
    #[must_use]
    pub const fn source(&self) -> ManagedRootSource {
        self.source
    }
}

/// Failure while validating a session-provided or user-selected root.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RootValidationError {
    /// The input was empty.
    Empty,
    /// The input was not absolute on the current host operating system.
    NotAbsolute,
    /// The input contained `.` or `..`, making the boundary ambiguous.
    AmbiguousComponent,
    /// The input or an existing parent is a symlink/reparse point.
    SymlinkTraversal,
    /// Metadata inspection failed while checking an existing path component.
    InspectionFailed { path: PathBuf, message: String },
}

impl fmt::Display for RootValidationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("root path must not be empty"),
            Self::NotAbsolute => formatter.write_str("root path must be absolute"),
            Self::AmbiguousComponent => {
                formatter.write_str("root path must not contain '.' or '..' components")
            }
            Self::SymlinkTraversal => {
                formatter.write_str("root path must not traverse a symlink or reparse point")
            }
            Self::InspectionFailed { path, message } => {
                write!(formatter, "failed to inspect {}: {message}", path.display())
            }
        }
    }
}

impl Error for RootValidationError {}

fn validate_absolute_path(path: &Path) -> Result<(), RootValidationError> {
    if path.as_os_str().is_empty() {
        return Err(RootValidationError::Empty);
    }
    if !path.is_absolute() {
        return Err(RootValidationError::NotAbsolute);
    }
    if path
        .components()
        .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(RootValidationError::AmbiguousComponent);
    }
    Ok(())
}

fn reject_existing_links(path: &Path) -> Result<(), RootValidationError> {
    for candidate in path.ancestors() {
        match std::fs::symlink_metadata(candidate) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(RootValidationError::SymlinkTraversal);
            }
            #[cfg(windows)]
            Ok(metadata)
                if {
                    use std::os::windows::fs::MetadataExt;

                    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
                    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
                } =>
            {
                return Err(RootValidationError::SymlinkTraversal)
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(RootValidationError::InspectionFailed {
                    path: candidate.to_path_buf(),
                    message: error.to_string(),
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        HostSessionRoots, ManagedRootSelection, ManagedRootSource, RootValidationError,
        SessionAppRoot, SessionSupportRoot, SharedBrowseRoot,
    };
    use std::path::{Path, PathBuf};

    fn absolute(parts: &[&str]) -> PathBuf {
        let mut path = std::env::current_dir().expect("test process has a current directory");
        path.extend(parts);
        path
    }

    fn session() -> HostSessionRoots {
        HostSessionRoots::new(
            SessionAppRoot::new(absolute(&["ae-app"]))
                .expect("test app root is an unambiguous absolute path"),
            SessionSupportRoot::new(absolute(&["ae-support"]))
                .expect("test support root is an unambiguous absolute path"),
        )
    }

    #[test]
    fn defaults_to_the_connected_sessions_support_root() {
        let session = session();
        let resolved = session.resolve_storage(ManagedRootSelection::SessionDefault);

        assert_eq!(
            resolved.locator_path(),
            session.support_root().as_path().join("ty-plus-init.json")
        );
        assert_eq!(
            resolved.managed_root(),
            session.support_root().as_path().join("ty-plus")
        );
        assert_eq!(resolved.source(), ManagedRootSource::SessionDefault);
    }

    #[test]
    fn shares_only_when_an_explicit_browse_root_is_provided() {
        let session = session();
        let shared = SharedBrowseRoot::new(absolute(&["chosen-shared-parent"]))
            .expect("test shared root is an unambiguous absolute path");
        let resolved = session.resolve_storage(ManagedRootSelection::ExplicitShared(shared));

        assert_eq!(
            resolved.managed_root(),
            absolute(&["chosen-shared-parent", "ty-plus"])
        );
        assert_eq!(
            resolved.locator_path(),
            session.support_root().as_path().join("ty-plus-init.json")
        );
        assert_eq!(resolved.source(), ManagedRootSource::ExplicitShared);
    }

    #[test]
    fn resolves_validated_paths_below_the_selected_managed_root() {
        let session = session();
        let resolved = session.resolve_storage(ManagedRootSelection::SessionDefault);
        let relative = crate::ManagedRelativePath::new("cache/search-index.json")
            .expect("test path is a normal managed relative path");

        assert_eq!(
            resolved.resolve_managed_path(&relative),
            session
                .support_root()
                .as_path()
                .join("ty-plus/cache/search-index.json")
        );
    }

    #[test]
    fn rejects_relative_and_ambiguous_roots() {
        assert_eq!(
            SessionSupportRoot::new(Path::new("relative/support")),
            Err(RootValidationError::NotAbsolute)
        );
        assert_eq!(
            SessionSupportRoot::new(Path::new("")),
            Err(RootValidationError::Empty)
        );

        let ambiguous = absolute(&["support", "..", "other"]);
        assert_eq!(
            SessionSupportRoot::new(ambiguous),
            Err(RootValidationError::AmbiguousComponent)
        );
    }

    #[test]
    fn app_and_support_roots_are_distinct_types_and_values() {
        let session = session();
        assert_ne!(
            session.app_root().as_path(),
            session.support_root().as_path()
        );
    }

    #[test]
    fn metadata_inspection_errors_fail_closed() {
        let candidate = PathBuf::from(format!("{}\0managed", std::env::temp_dir().display()));

        let result = super::reject_existing_links(&candidate);
        assert!(matches!(
            result,
            Err(RootValidationError::InspectionFailed { .. })
        ));
    }
}
