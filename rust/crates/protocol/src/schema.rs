//! Deterministic schema catalog generated directly from the Rust wire types.

use serde_json::{json, Value};

use crate::{
    CancelRequest, CanonicalMethod, CapabilitySet, ConnectivityStatusDto, GenerateThumbnailRequest,
    GenerateThumbnailResponse, LookupThumbnailRequest, LookupThumbnailResponse,
    PluginEffectScanRequest, WireMessage, CURRENT_PROTOCOL_VERSION, MAX_CAPABILITIES,
    MAX_CAPABILITY_NAME_BYTES, MAX_DEADLINE_HORIZON_MS, MAX_FRAME_BYTES, MAX_IDEMPOTENCY_KEY_BYTES,
    MAX_IDENTIFIER_BYTES, MAX_JSON_DEPTH, MAX_METHOD_NAME_BYTES, MAX_PENDING_REQUESTS,
    MAX_STRING_BYTES, MAX_UNKNOWN_METHODS_PER_SESSION, MAX_WARNINGS,
};

pub const CATALOG_FORMAT: &str = "ty-plus.protocol-schema-catalog/1";
pub const GENERATOR_NAME: &str = "ty-plus-protocol-schema";
pub const GENERATOR_FORMAT_VERSION: u16 = 1;
pub const SCHEMARS_VERSION: &str = "1.0.4";

#[must_use]
pub fn generate_schema_catalog() -> Value {
    let canonical_methods = CanonicalMethod::all()
        .iter()
        .map(|method| method.wire_name().replace('.', "_"))
        .collect::<Vec<_>>();
    let canonical_operation_policies = CanonicalMethod::all()
        .iter()
        .map(|method| {
            let policy = method.operation_policy();
            (
                method.wire_name().replace('.', "_"),
                json!({
                    "wireName": method.wire_name(),
                    "idempotencyKey": policy.idempotency_key,
                    "retryClass": policy.retry_class,
                    "cancellable": policy.cancellable,
                    "retryCrashBeforeAccept": policy.retry_crash_before_accept,
                }),
            )
        })
        .collect::<serde_json::Map<_, _>>();
    json!({
        "catalogFormat": CATALOG_FORMAT,
        "documents": {
            "cancelRequest": schemars::schema_for!(CancelRequest),
            "capabilitySet": schemars::schema_for!(CapabilitySet),
            "connectivityStatusDto": schemars::schema_for!(ConnectivityStatusDto),
            "generateThumbnailRequest": schemars::schema_for!(GenerateThumbnailRequest),
            "generateThumbnailResponse": schemars::schema_for!(GenerateThumbnailResponse),
            "lookupThumbnailRequest": schemars::schema_for!(LookupThumbnailRequest),
            "lookupThumbnailResponse": schemars::schema_for!(LookupThumbnailResponse),
            "pluginEffectScanRequest": schemars::schema_for!(PluginEffectScanRequest),
            "wireMessage": schemars::schema_for!(WireMessage),
        },
        "generator": {
            "formatVersion": GENERATOR_FORMAT_VERSION,
            "name": GENERATOR_NAME,
            "protocolCrateVersion": env!("CARGO_PKG_VERSION"),
            "schemarsVersion": SCHEMARS_VERSION,
        },
        "limits": {
            "maxCapabilities": MAX_CAPABILITIES,
            "maxCapabilityNameBytes": MAX_CAPABILITY_NAME_BYTES,
            "maxDeadlineHorizonMs": MAX_DEADLINE_HORIZON_MS,
            "maxFrameBytes": MAX_FRAME_BYTES,
            "maxIdempotencyKeyBytes": MAX_IDEMPOTENCY_KEY_BYTES,
            "maxIdentifierBytes": MAX_IDENTIFIER_BYTES,
            "maxJsonDepth": MAX_JSON_DEPTH,
            "maxMethodNameBytes": MAX_METHOD_NAME_BYTES,
            "maxPendingRequests": MAX_PENDING_REQUESTS,
            "maxStringBytes": MAX_STRING_BYTES,
            "maxUnknownMethodsPerSession": MAX_UNKNOWN_METHODS_PER_SESSION,
            "maxWarnings": MAX_WARNINGS,
        },
        "canonicalMethods": canonical_methods,
        "canonicalOperationPolicies": canonical_operation_policies,
        "protocolVersion": {
            "major": CURRENT_PROTOCOL_VERSION.major,
            "minor": CURRENT_PROTOCOL_VERSION.minor,
        },
    })
}

pub fn generate_schema_json() -> Result<String, serde_json::Error> {
    let mut output = serde_json::to_string_pretty(&generate_schema_catalog())?;
    output.push('\n');
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_is_byte_deterministic_and_records_tool_versions() {
        let first = generate_schema_json().unwrap();
        let second = generate_schema_json().unwrap();
        assert_eq!(first.as_bytes(), second.as_bytes());
        assert!(first.ends_with('\n'));

        let catalog: Value = serde_json::from_str(&first).unwrap();
        assert_eq!(catalog["catalogFormat"], CATALOG_FORMAT);
        assert_eq!(catalog["generator"]["name"], GENERATOR_NAME);
        assert_eq!(catalog["generator"]["schemarsVersion"], SCHEMARS_VERSION);
        assert!(catalog["documents"]["wireMessage"].is_object());
    }

    #[test]
    fn recorded_schemars_version_matches_the_pinned_dependency() {
        let manifest = include_str!("../Cargo.toml");
        let pinned = format!("schemars = {{ version = \"={SCHEMARS_VERSION}\"");
        assert!(manifest.contains(&pinned));
    }

    #[test]
    fn canonical_policy_schema_contains_unique_wire_names() {
        let catalog = generate_schema_catalog();
        let policies = catalog["canonicalOperationPolicies"]
            .as_object()
            .expect("canonical policies must be an object");
        let wire_names = policies
            .values()
            .map(|policy| {
                policy["wireName"]
                    .as_str()
                    .expect("policy wireName must be a string")
            })
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(wire_names.len(), policies.len());
        assert_eq!(
            policies["host_plugin_effect_scan"]["wireName"],
            "host.plugin.effect.scan"
        );
    }

    #[test]
    fn checked_in_catalog_is_current() {
        assert_eq!(
            include_str!("../generated/wire.schema.json"),
            generate_schema_json().unwrap()
        );
    }
}
