use serde_json::Value;

fn catalog() -> Value {
    serde_json::from_str(include_str!("../generated/wire.schema.json"))
        .expect("checked-in schema must be valid JSON")
}

#[test]
fn schema_snapshot_contains_rust_owned_canonical_policy_registry() {
    let catalog = catalog();
    let methods = catalog["canonicalMethods"]
        .as_array()
        .expect("canonical methods must be an array");
    let policies = catalog["canonicalOperationPolicies"]
        .as_object()
        .expect("canonical policies must be an object");
    assert_eq!(methods.len(), 12);
    assert_eq!(policies.len(), methods.len());
    for method in methods {
        let method = method.as_str().expect("method names must be strings");
        assert!(policies.contains_key(method), "missing policy for {method}");
    }
    assert_eq!(
        catalog["canonicalOperationPolicies"]["host_plugin_effect_scan"]["retryClass"],
        "idempotent"
    );
    assert_eq!(
        catalog["canonicalOperationPolicies"]["host_thumbnail_lookup"]["retryClass"],
        "idempotent"
    );
    assert_eq!(
        catalog["canonicalOperationPolicies"]["host_thumbnail_generate"]["retryClass"],
        "idempotent"
    );
}

#[test]
fn schema_snapshot_declares_strict_plugin_scan_payload() {
    let catalog = catalog();
    let schema = &catalog["documents"]["pluginEffectScanRequest"];
    assert_eq!(schema["additionalProperties"], false);
    assert_eq!(schema["required"], serde_json::json!(["roots"]));
}
