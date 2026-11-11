use serde::{Deserialize, Serialize};

use crate::validation::ValidationError;

/// Maximum number of scan roots per request.
pub const MAX_SCAN_ROOTS: usize = 16;

/// Maximum bytes for a scan root path.
pub const MAX_SCAN_ROOT_PATH_BYTES: usize = 4096;

/// Plugin/effect scan request payload.
///
/// This payload is sent from the client to the runtime to request
/// a scan of plugin/effect files under the specified roots.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginEffectScanRequest {
    /// Root directories to scan for plugins/effects.
    pub roots: Vec<String>,
}

impl PluginEffectScanRequest {
    /// Validates the scan request.
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.roots.is_empty() {
            return Err(ValidationError::Empty { field: "roots" });
        }
        if self.roots.len() > MAX_SCAN_ROOTS {
            return Err(ValidationError::TooManyCapabilities {
                max: MAX_SCAN_ROOTS,
                actual: self.roots.len(),
            });
        }
        for root in &self.roots {
            crate::validation::validate_bounded_text("roots", root, MAX_SCAN_ROOT_PATH_BYTES)?;
        }
        self.normalized_roots().map(|_| ())
    }

    /// Returns normalized paths relative to the host application root.
    pub fn normalized_roots(&self) -> Result<Vec<String>, ValidationError> {
        if self.roots.is_empty() {
            return Err(ValidationError::Empty { field: "roots" });
        }
        if self.roots.len() > MAX_SCAN_ROOTS {
            return Err(ValidationError::TooManyCapabilities {
                max: MAX_SCAN_ROOTS,
                actual: self.roots.len(),
            });
        }
        self.roots
            .iter()
            .map(|root| {
                crate::validation::validate_bounded_text("roots", root, MAX_SCAN_ROOT_PATH_BYTES)?;
                let normalized = root.replace('\\', "/");
                if normalized.starts_with('/')
                    || normalized.starts_with("//")
                    || normalized
                        .as_bytes()
                        .get(1)
                        .is_some_and(|byte| *byte == b':')
                {
                    return Err(ValidationError::InvalidFormat { field: "roots" });
                }
                let mut components = Vec::new();
                for component in normalized.split('/') {
                    if component.is_empty() || component == ".." {
                        return Err(ValidationError::InvalidFormat { field: "roots" });
                    }
                    if component != "." {
                        components.push(component);
                    }
                }
                if components.is_empty() {
                    return Err(ValidationError::InvalidFormat { field: "roots" });
                }
                Ok(components.join("/"))
            })
            .collect()
    }
}

/// A single row from the plugin/effect scan result.
///
/// Each row represents one match name found in a plugin/effect file.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginEffectScanRow {
    /// Path to the plugin/effect file.
    pub file_path: String,
    /// AE match name (e.g., "ADBE Gaussian Blur 2").
    pub match_name: String,
    /// Display name for the effect.
    pub display_name: String,
}

/// Plugin/effect scan result payload.
///
/// This payload is returned from the runtime to the client after
/// completing the scan.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginEffectScanResult {
    /// Rows of discovered plugin/effect match names.
    pub rows: Vec<PluginEffectScanRow>,
}

impl PluginEffectScanResult {
    /// Returns the number of rows in the result.
    #[must_use]
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    /// Returns true if the result is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_request() -> PluginEffectScanRequest {
        PluginEffectScanRequest {
            roots: vec!["Plugins".to_string(), "Effects".to_string()],
        }
    }

    fn test_row() -> PluginEffectScanRow {
        PluginEffectScanRow {
            file_path: "/Plugins/Blur.aex".to_string(),
            match_name: "ADBE Gaussian Blur 2".to_string(),
            display_name: "Gaussian Blur".to_string(),
        }
    }

    #[test]
    fn scan_request_valid() {
        let request = test_request();
        assert!(request.validate().is_ok());
        assert_eq!(
            request.normalized_roots().unwrap(),
            vec!["Plugins", "Effects"]
        );
    }

    #[test]
    fn scan_request_rejects_empty_roots() {
        let request = PluginEffectScanRequest { roots: vec![] };
        assert!(request.validate().is_err());
    }

    #[test]
    fn scan_request_rejects_too_many_roots() {
        let request = PluginEffectScanRequest {
            roots: (0..20).map(|i| format!("/root{i}")).collect(),
        };
        assert!(request.validate().is_err());
    }

    #[test]
    fn scan_request_rejects_long_root_path() {
        let request = PluginEffectScanRequest {
            roots: vec!["a".repeat(5000)],
        };
        assert!(request.validate().is_err());
    }

    #[test]
    fn scan_roots_reject_absolute_parent_empty_and_drive_prefixed_paths() {
        // Production break caught: filesystem authority must not escape app_root
        // through absolute, parent, empty-component, drive, or UNC paths.
        for root in [
            "/Plugins",
            "../Plugins",
            "Plugins//Effects",
            "Plugins/",
            "Plugins/../Effects",
            ".",
            "",
            "C:/Plugins",
            "\\\\server\\share",
        ] {
            let request = PluginEffectScanRequest {
                roots: vec![root.to_owned()],
            };
            assert!(
                request.validate().is_err(),
                "root should be rejected: {root}"
            );
        }
    }

    #[test]
    fn scan_roots_normalize_separators_and_dot_components() {
        // Production break caught: callers must provide stable app-root-relative
        // roots so host scanning cannot receive platform-specific path authority.
        let request = PluginEffectScanRequest {
            roots: vec!["Plugins\\Effects/./Presets".to_owned()],
        };
        assert_eq!(
            request.normalized_roots().unwrap(),
            vec!["Plugins/Effects/Presets"]
        );
    }

    #[test]
    fn scan_result_len() {
        let result = PluginEffectScanResult {
            rows: vec![test_row()],
        };
        assert_eq!(result.len(), 1);
        assert!(!result.is_empty());
    }

    #[test]
    fn scan_result_empty() {
        let result = PluginEffectScanResult { rows: vec![] };
        assert!(result.is_empty());
    }
}
