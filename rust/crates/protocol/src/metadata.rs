use std::fmt;

use serde::{Deserialize, Deserializer, Serialize};

use crate::validation::{validate_identifier, ValidationError};

pub const MAX_IDENTIFIER_BYTES: usize = 128;
pub const MAX_METHOD_NAME_BYTES: usize = 128;
pub const MAX_IDEMPOTENCY_KEY_BYTES: usize = 256;
pub const MAX_DEADLINE_HORIZON_MS: u64 = 24 * 60 * 60 * 1_000;

macro_rules! identifier_type {
    ($name:ident, $field:literal, $max:expr) => {
        #[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn parse(value: impl Into<String>) -> Result<Self, ValidationError> {
                let value = value.into();
                validate_identifier($field, &value, $max)?;
                Ok(Self(value))
            }

            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: Deserializer<'de>,
            {
                let value = String::deserialize(deserializer)?;
                Self::parse(value).map_err(serde::de::Error::custom)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

identifier_type!(RequestId, "request_id", MAX_IDENTIFIER_BYTES);
identifier_type!(SessionId, "session_id", MAX_IDENTIFIER_BYTES);
identifier_type!(DiagnosticId, "diagnostic_id", MAX_IDENTIFIER_BYTES);
identifier_type!(IdempotencyKey, "idempotency_key", MAX_IDEMPOTENCY_KEY_BYTES);

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(transparent)]
pub struct MethodName(String);

/// Product methods with a worker-owned canonical wire name.
///
/// `MethodName` continues to validate the generic qualified-name shape for
/// forward-compatible protocol methods. Dispatchers must use this registry
/// when they route a known product operation instead of spelling aliases
/// locally.
macro_rules! canonical_methods {
    ($(($variant:ident, $wire_name:literal, $idempotency:expr, $retry:expr, $cancellable:literal, $retry_crash:literal)),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum CanonicalMethod {
            $( $variant, )+
        }

        impl CanonicalMethod {
            pub const ALL: &'static [Self] = &[
                $( Self::$variant, )+
            ];

            #[must_use]
            pub const fn all() -> &'static [Self] {
                Self::ALL
            }

            /// Resolves a wire name through the canonical registry.
            #[must_use]
            pub fn parse(value: &str) -> Option<Self> {
                match value {
                    $( $wire_name => Some(Self::$variant), )+
                    _ => None,
                }
            }

            #[must_use]
            pub const fn wire_name(self) -> &'static str {
                match self {
                    $( Self::$variant => $wire_name, )+
                }
            }

            #[must_use]
            pub const fn operation_policy(self) -> CanonicalOperationPolicy {
                match self {
                    $( Self::$variant => CanonicalOperationPolicy {
                        idempotency_key: $idempotency,
                        retry_class: $retry,
                        cancellable: $cancellable,
                        retry_crash_before_accept: $retry_crash,
                    }, )+
                }
            }
        }
    };
}

canonical_methods!(
    (
        OnlineCatalogSearch,
        "online.catalog.search",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
    (
        OnlineConnectivityCheck,
        "online.connectivity.check",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
    (
        OnlineDownload,
        "online.download",
        IdempotencyPolicy::Forbidden,
        RetryClass::NonIdempotent,
        true,
        false
    ),
    (
        OnlineCatalogCacheRead,
        "online.catalog.cache.read",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
    (
        OnlineCatalogCacheWrite,
        "online.catalog.cache.write",
        IdempotencyPolicy::Forbidden,
        RetryClass::NonIdempotent,
        true,
        false
    ),
    (
        OnlineCatalogCacheDelete,
        "online.catalog.cache.delete",
        IdempotencyPolicy::Forbidden,
        RetryClass::NonIdempotent,
        true,
        false
    ),
    (
        OnlineCatalogCacheClear,
        "online.catalog.cache.clear",
        IdempotencyPolicy::Forbidden,
        RetryClass::NonIdempotent,
        true,
        false
    ),
    (
        HostPluginEffectScan,
        "host.plugin.effect.scan",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
    (
        HostThumbnailLookup,
        "host.thumbnail.lookup",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
    (
        HostThumbnailGenerate,
        "host.thumbnail.generate",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
    (
        HostThumbnailLookupOrGenerate,
        "host.thumbnail.lookup-or-generate",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
    (
        HostThumbnailBatch,
        "host.thumbnail.batch",
        IdempotencyPolicy::Optional,
        RetryClass::Idempotent,
        true,
        false
    ),
);

impl MethodName {
    pub fn parse(value: impl Into<String>) -> Result<Self, ValidationError> {
        let value = value.into();
        crate::validation::validate_qualified_name("method", &value, MAX_METHOD_NAME_BYTES)?;
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Resolves a validated method name through the canonical product registry.
    #[must_use]
    pub fn canonical(&self) -> Option<CanonicalMethod> {
        CanonicalMethod::parse(self.as_str())
    }
}

impl<'de> Deserialize<'de> for MethodName {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(value).map_err(serde::de::Error::custom)
    }
}

impl fmt::Display for MethodName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DeadlineUnixMs(u64);

impl DeadlineUnixMs {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }

    pub fn validate(self, now_unix_ms: u64) -> Result<(), ValidationError> {
        if self.0 <= now_unix_ms {
            return Err(ValidationError::DeadlineExpired);
        }
        if self.0.saturating_sub(now_unix_ms) > MAX_DEADLINE_HORIZON_MS {
            return Err(ValidationError::DeadlineTooFar);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IdempotencyPolicy {
    Forbidden,
    Optional,
    Required,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RetryClass {
    Idempotent,
    NonIdempotent,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalOperationPolicy {
    pub idempotency_key: IdempotencyPolicy,
    pub retry_class: RetryClass,
    pub cancellable: bool,
    pub retry_crash_before_accept: bool,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestMetadata {
    pub request_id: RequestId,
    pub session_id: SessionId,
    pub deadline_unix_ms: DeadlineUnixMs,
    pub cancellable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<IdempotencyKey>,
}

impl RequestMetadata {
    pub fn validate(
        &self,
        now_unix_ms: u64,
        idempotency: IdempotencyPolicy,
    ) -> Result<(), ValidationError> {
        self.deadline_unix_ms.validate(now_unix_ms)?;
        match (idempotency, self.idempotency_key.is_some()) {
            (IdempotencyPolicy::Required, false) => Err(ValidationError::MissingIdempotencyKey),
            (IdempotencyPolicy::Forbidden, true) => Err(ValidationError::UnexpectedIdempotencyKey),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn metadata(key: Option<&str>) -> RequestMetadata {
        RequestMetadata {
            request_id: RequestId::parse("request-1").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
            deadline_unix_ms: DeadlineUnixMs::new(2_000),
            cancellable: true,
            idempotency_key: key.map(|value| IdempotencyKey::parse(value).unwrap()),
        }
    }

    #[test]
    fn metadata_rejects_invalid_idempotency_combinations() {
        assert_eq!(
            metadata(None).validate(1_000, IdempotencyPolicy::Required),
            Err(ValidationError::MissingIdempotencyKey)
        );
        assert_eq!(
            metadata(Some("write-1")).validate(1_000, IdempotencyPolicy::Forbidden),
            Err(ValidationError::UnexpectedIdempotencyKey)
        );
        assert!(metadata(Some("write-1"))
            .validate(1_000, IdempotencyPolicy::Required)
            .is_ok());
    }

    #[test]
    fn metadata_rejects_expired_and_unbounded_deadlines() {
        assert_eq!(
            metadata(None).validate(2_000, IdempotencyPolicy::Optional),
            Err(ValidationError::DeadlineExpired)
        );
        let far_future = RequestMetadata {
            deadline_unix_ms: DeadlineUnixMs::new(MAX_DEADLINE_HORIZON_MS + 2_000),
            ..metadata(None)
        };
        assert_eq!(
            far_future.validate(1_000, IdempotencyPolicy::Optional),
            Err(ValidationError::DeadlineTooFar)
        );
    }

    #[test]
    fn identifiers_are_validated_while_deserializing() {
        assert!(serde_json::from_str::<RequestId>(r#""request 1""#).is_err());
        assert!(serde_json::from_str::<SessionId>(r#""""#).is_err());
        assert!(serde_json::from_str::<MethodName>(&format!(
            "\"{}\"",
            "x".repeat(MAX_IDENTIFIER_BYTES + 1)
        ))
        .is_err());
        assert!(serde_json::from_str::<MethodName>(r#""Storage.Write""#).is_err());
    }

    #[test]
    fn canonical_methods_round_trip_through_the_registry() {
        for method in [
            CanonicalMethod::OnlineCatalogSearch,
            CanonicalMethod::OnlineConnectivityCheck,
            CanonicalMethod::OnlineDownload,
            CanonicalMethod::OnlineCatalogCacheRead,
            CanonicalMethod::OnlineCatalogCacheWrite,
            CanonicalMethod::OnlineCatalogCacheDelete,
            CanonicalMethod::OnlineCatalogCacheClear,
            CanonicalMethod::HostPluginEffectScan,
            CanonicalMethod::HostThumbnailLookup,
            CanonicalMethod::HostThumbnailGenerate,
        ] {
            let parsed = MethodName::parse(method.wire_name()).unwrap();
            assert_eq!(parsed.canonical(), Some(method));
        }
    }

    #[test]
    fn legacy_online_aliases_are_not_canonical() {
        for alias in ["catalog.search", "catalog.download", "catalog.cache.read"] {
            let parsed = MethodName::parse(alias).unwrap();
            assert_eq!(parsed.canonical(), None);
        }
    }

    #[test]
    fn canonical_registry_has_one_policy_for_every_method() {
        // Production break caught: a missing or duplicate Rust-owned policy entry
        // would leave generated retry metadata ambiguous for a canonical method.
        let methods = CanonicalMethod::all();
        assert_eq!(methods.len(), 12);
        assert_eq!(
            methods
                .iter()
                .map(|method| method.wire_name())
                .collect::<std::collections::BTreeSet<_>>(),
            [
                "host.plugin.effect.scan",
                "host.thumbnail.batch",
                "host.thumbnail.generate",
                "host.thumbnail.lookup",
                "host.thumbnail.lookup-or-generate",
                "online.catalog.cache.clear",
                "online.catalog.cache.delete",
                "online.catalog.cache.read",
                "online.catalog.cache.write",
                "online.catalog.search",
                "online.connectivity.check",
                "online.download",
            ]
            .into_iter()
            .collect()
        );
        assert_eq!(
            methods
                .iter()
                .map(|method| method.wire_name())
                .collect::<std::collections::BTreeSet<_>>()
                .len(),
            methods.len()
        );
        assert_eq!(
            CanonicalMethod::HostPluginEffectScan.operation_policy(),
            CanonicalOperationPolicy {
                idempotency_key: IdempotencyPolicy::Optional,
                retry_class: RetryClass::Idempotent,
                cancellable: true,
                retry_crash_before_accept: false,
            }
        );
        assert_eq!(
            CanonicalMethod::HostThumbnailLookup.operation_policy(),
            CanonicalOperationPolicy {
                idempotency_key: IdempotencyPolicy::Optional,
                retry_class: RetryClass::Idempotent,
                cancellable: true,
                retry_crash_before_accept: false,
            }
        );
        assert_eq!(
            CanonicalMethod::HostThumbnailGenerate.operation_policy(),
            CanonicalOperationPolicy {
                idempotency_key: IdempotencyPolicy::Optional,
                retry_class: RetryClass::Idempotent,
                cancellable: true,
                retry_crash_before_accept: false,
            }
        );
        assert_eq!(
            CanonicalMethod::OnlineCatalogSearch
                .operation_policy()
                .retry_class,
            RetryClass::Idempotent
        );
        assert_eq!(
            CanonicalMethod::OnlineCatalogCacheRead
                .operation_policy()
                .retry_class,
            RetryClass::Idempotent
        );
        for method in [
            CanonicalMethod::OnlineDownload,
            CanonicalMethod::OnlineCatalogCacheWrite,
            CanonicalMethod::OnlineCatalogCacheDelete,
            CanonicalMethod::OnlineCatalogCacheClear,
        ] {
            assert_eq!(
                method.operation_policy().retry_class,
                RetryClass::NonIdempotent
            );
            assert!(!method.operation_policy().retry_crash_before_accept);
        }
    }
}
