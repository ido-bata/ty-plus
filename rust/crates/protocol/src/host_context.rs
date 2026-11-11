use serde::{Deserialize, Serialize};

use crate::{validation::ValidationError, SessionId};

/// Maximum bytes for host context paths.
pub const MAX_HOST_CONTEXT_PATH_BYTES: usize = 4096;

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum ManagedRootContext {
    SessionDefault,
    ExplicitShared { root: String },
}

impl ManagedRootContext {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match self {
            Self::SessionDefault => Ok(()),
            Self::ExplicitShared { root } => crate::validation::validate_bounded_text(
                "managed_root.root",
                root,
                MAX_HOST_CONTEXT_PATH_BYTES,
            ),
        }
    }
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvocationContext {
    pub host_context: HostContext,
    pub managed_root: ManagedRootContext,
}

impl InvocationContext {
    pub fn validate(&self) -> Result<(), ValidationError> {
        self.host_context.validate()?;
        self.managed_root.validate()
    }

    pub fn validate_for_session(&self, session_id: &SessionId) -> Result<(), ValidationError> {
        self.validate()?;
        if self.host_context.session_id != session_id.as_str() {
            return Err(ValidationError::InvalidFormat {
                field: "context.host_context.session_id",
            });
        }
        Ok(())
    }
}

/// Host context payload from After Effects ExtendScript.
///
/// This payload is sent from the host to the runtime during session registration.
/// It contains the application root and support root paths derived from
/// ExtendScript's `app.path`.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostContext {
    /// Application root path from ExtendScript's `app.path`.
    pub app_root: String,
    /// Application support root path.
    pub support_root: String,
    /// Session identifier for this AE instance.
    pub session_id: String,
}

impl HostContext {
    /// Validates the host context payload.
    pub fn validate(&self) -> Result<(), ValidationError> {
        crate::validation::validate_bounded_text(
            "host_context.app_root",
            &self.app_root,
            MAX_HOST_CONTEXT_PATH_BYTES,
        )?;
        crate::validation::validate_bounded_text(
            "host_context.support_root",
            &self.support_root,
            MAX_HOST_CONTEXT_PATH_BYTES,
        )?;
        crate::validation::validate_bounded_text("host_context.session_id", &self.session_id, 128)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_context_valid() {
        let ctx = HostContext {
            app_root: "C:\\Program Files\\Adobe\\After Effects 2024".to_string(),
            support_root: "C:\\Users\\test\\AppData\\Roaming\\Adobe".to_string(),
            session_id: "session-1".to_string(),
        };
        assert!(ctx.validate().is_ok());
    }

    #[test]
    fn host_context_rejects_empty_app_root() {
        let ctx = HostContext {
            app_root: "".to_string(),
            support_root: "/Users/test/Library/Application Support".to_string(),
            session_id: "session-1".to_string(),
        };
        assert!(ctx.validate().is_err());
    }

    #[test]
    fn explicit_shared_root_must_be_non_empty() {
        let context = InvocationContext {
            host_context: HostContext {
                app_root: "/Applications/Adobe After Effects 2024".to_owned(),
                support_root: "/Users/test/Library/Application Support".to_owned(),
                session_id: "session-1".to_owned(),
            },
            managed_root: ManagedRootContext::ExplicitShared {
                root: String::new(),
            },
        };

        assert!(context.validate().is_err());
    }

    #[test]
    fn invocation_context_rejects_a_different_session() {
        let context = InvocationContext {
            host_context: HostContext {
                app_root: "/Applications/Adobe After Effects 2024".to_owned(),
                support_root: "/Users/test/Library/Application Support".to_owned(),
                session_id: "session-1".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        };

        assert_eq!(
            context.validate_for_session(&SessionId::parse("session-2").unwrap()),
            Err(ValidationError::InvalidFormat {
                field: "context.host_context.session_id",
            })
        );
    }
}
