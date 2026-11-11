use std::path::{Path, PathBuf};

use crate::HostContext;

/// Path builder for constructing paths from appRoot.
///
/// All paths are constructed relative to the appRoot without hardcoding
/// absolute paths. The builder supports both Windows and macOS path
/// conventions.
#[derive(Debug, Clone)]
pub struct PathBuilder {
    app_root: PathBuf,
    support_root: PathBuf,
}

impl PathBuilder {
    /// Creates a new path builder from a host context.
    #[must_use]
    pub fn new(context: &HostContext) -> Self {
        Self {
            app_root: PathBuf::from(&context.app_root),
            support_root: PathBuf::from(&context.support_root),
        }
    }

    /// Returns the app root path.
    #[must_use]
    pub fn app_root(&self) -> &Path {
        &self.app_root
    }

    /// Returns the support root path.
    #[must_use]
    pub fn support_root(&self) -> &Path {
        &self.support_root
    }

    /// Builds the visible managed root used for durable ty-plus state.
    #[must_use]
    pub fn managed_root(&self) -> PathBuf {
        self.support_root.join("ty-plus")
    }

    /// Builds the visible operation lock path below the managed root.
    #[must_use]
    pub fn operation_lock_path(&self) -> PathBuf {
        self.managed_root().join("control").join("operation.lock")
    }

    /// Builds the presets directory path.
    ///
    /// # Examples
    ///
    /// - Windows: `C:\Program Files\Adobe\After Effects 2024\Support Files\Presets`
    /// - macOS: `/Applications/Adobe After Effects 2024/Presets`
    #[must_use]
    pub fn presets_dir(&self) -> PathBuf {
        self.app_root.join("Presets")
    }

    /// Builds the ty-plus presets directory path.
    ///
    /// # Examples
    ///
    /// - Windows: `C:\Program Files\Adobe\After Effects 2024\Support Files\Presets\ty-plus`
    /// - macOS: `/Applications/Adobe After Effects 2024/Presets/ty-plus`
    #[must_use]
    pub fn ty_plus_presets_dir(&self) -> PathBuf {
        self.presets_dir().join("ty-plus")
    }

    /// Builds the scripts directory path.
    ///
    /// # Examples
    ///
    /// - Windows: `C:\Program Files\Adobe\After Effects 2024\Support Files\Scripts`
    /// - macOS: `/Applications/Adobe After Effects 2024/Scripts`
    #[must_use]
    pub fn scripts_dir(&self) -> PathBuf {
        self.app_root.join("Scripts")
    }

    /// Builds the ScriptUI Panels directory path.
    ///
    /// # Examples
    ///
    /// - Windows: `C:\Program Files\Adobe\After Effects 2024\Support Files\Scripts\ScriptUI Panels`
    /// - macOS: `/Applications/Adobe After Effects 2024/Scripts/ScriptUI Panels`
    #[must_use]
    pub fn scriptui_panels_dir(&self) -> PathBuf {
        self.scripts_dir().join("ScriptUI Panels")
    }

    /// Builds the plugins directory path.
    ///
    /// # Examples
    ///
    /// - Windows: `C:\Program Files\Adobe\After Effects 2024\Support Files\Plug-ins`
    /// - macOS: `/Applications/Adobe After Effects 2024/Plug-ins`
    #[must_use]
    pub fn plugins_dir(&self) -> PathBuf {
        self.app_root.join("Plug-ins")
    }

    /// Builds a path within the ty-plus presets directory.
    ///
    /// # Arguments
    ///
    /// * `subdir` - Subdirectory name (e.g., "animation", "easing")
    /// * `filename` - File name with extension
    #[must_use]
    pub fn ty_plus_preset_path(&self, subdir: &str, filename: &str) -> PathBuf {
        self.ty_plus_presets_dir().join(subdir).join(filename)
    }

    /// Builds the user data presets directory path.
    ///
    /// This is the writable location for user-created presets.
    ///
    /// # Examples
    ///
    /// - Windows: `%APPDATA%\Adobe\After Effects\24.0\Presets\ty-plus`
    /// - macOS: `~/Library/Application Support/Adobe/After Effects/24.0/Presets/ty-plus`
    #[must_use]
    pub fn user_presets_dir(&self, ae_version: &str) -> PathBuf {
        self.support_root
            .join("Adobe")
            .join("After Effects")
            .join(ae_version)
            .join("Presets")
            .join("ty-plus")
    }

    /// Builds a user data preset file path.
    #[must_use]
    pub fn user_preset_path(&self, ae_version: &str, subdir: &str, filename: &str) -> PathBuf {
        self.user_presets_dir(ae_version)
            .join(subdir)
            .join(filename)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::HostContext;

    fn test_context_windows() -> HostContext {
        HostContext::new(
            "C:\\Program Files\\Adobe\\After Effects 2024",
            "C:\\Users\\test\\AppData\\Roaming\\Adobe",
            "24.0.0",
            "session-1",
        )
    }

    fn test_context_macos() -> HostContext {
        HostContext::new(
            "/Applications/Adobe After Effects 2024",
            "/Users/test/Library/Application Support",
            "24.0.0",
            "session-1",
        )
    }

    #[test]
    fn path_builder_from_context() {
        let ctx = test_context_windows();
        let builder = PathBuilder::new(&ctx);
        assert_eq!(
            builder.app_root(),
            Path::new("C:\\Program Files\\Adobe\\After Effects 2024")
        );
    }

    /// `PathBuilder` joins onto whichever separator the running platform uses,
    /// so a test that feeds it a `C:\...` root can only expect `\` back on
    /// Windows. Asserting the Windows spelling from macOS compares
    /// `C:\Program Files\...\Presets` against the host's own `/` join and fails
    /// on a builder that behaved correctly, so the four tests that spell a
    /// Windows path are scoped to the platform that path belongs to. The
    /// methods they cover are exercised on macOS by the `*_macos` siblings
    /// below, and every one of the four runs unchanged on Windows.
    #[cfg(windows)]
    #[test]
    fn presets_dir_windows() {
        let builder = PathBuilder::new(&test_context_windows());
        assert_eq!(
            builder.presets_dir(),
            PathBuf::from("C:\\Program Files\\Adobe\\After Effects 2024\\Presets")
        );
    }

    #[test]
    fn presets_dir_macos() {
        let builder = PathBuilder::new(&test_context_macos());
        assert_eq!(
            builder.presets_dir(),
            PathBuf::from("/Applications/Adobe After Effects 2024/Presets")
        );
    }

    #[cfg(windows)]
    #[test]
    fn ty_plus_presets_dir() {
        let builder = PathBuilder::new(&test_context_windows());
        assert_eq!(
            builder.ty_plus_presets_dir(),
            PathBuf::from("C:\\Program Files\\Adobe\\After Effects 2024\\Presets\\ty-plus")
        );
    }

    #[test]
    fn plugins_dir() {
        let builder = PathBuilder::new(&test_context_macos());
        assert_eq!(
            builder.plugins_dir(),
            PathBuf::from("/Applications/Adobe After Effects 2024/Plug-ins")
        );
    }

    #[cfg(windows)]
    #[test]
    fn ty_plus_preset_path() {
        let builder = PathBuilder::new(&test_context_windows());
        assert_eq!(
            builder.ty_plus_preset_path("animation", "fade.ffx"),
            PathBuf::from("C:\\Program Files\\Adobe\\After Effects 2024\\Presets\\ty-plus\\animation\\fade.ffx")
        );
    }

    #[cfg(windows)]
    #[test]
    fn user_presets_dir() {
        let builder = PathBuilder::new(&test_context_windows());
        assert_eq!(
            builder.user_presets_dir("24.0"),
            PathBuf::from("C:\\Users\\test\\AppData\\Roaming\\Adobe\\Adobe\\After Effects\\24.0\\Presets\\ty-plus")
        );
    }

    #[test]
    fn scriptui_panels_dir() {
        let builder = PathBuilder::new(&test_context_macos());
        assert_eq!(
            builder.scriptui_panels_dir(),
            PathBuf::from("/Applications/Adobe After Effects 2024/Scripts/ScriptUI Panels")
        );
    }
}
