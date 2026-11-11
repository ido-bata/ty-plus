use ty_plus_operation_worker::{Invocation, ResolvedInvocation, resolve_invocation};
use ty_plus_protocol::{
    CURRENT_PROTOCOL_VERSION, DeadlineUnixMs, HostContext, InvocationContext, ManagedRootContext,
    MethodName, RequestEnvelope, RequestId, RequestMetadata, SessionId,
};

/// Fixture root scoped to the running test, so parallel tests do not race on
/// first-time directory creation (Issue #200). The harness runs each test on
/// its own thread, which separates tests without changing any single test's
/// own view of its fixture.
fn fixture_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "ow-rust-003-{label}-{:?}",
        std::thread::current().id()
    ))
}

fn invocation(root: ManagedRootContext) -> Invocation {
    let session_id = SessionId::parse("session-invocation").unwrap();
    let app_root = fixture_path("app");
    let support_root = fixture_path("support");
    std::fs::create_dir_all(&app_root).unwrap();
    std::fs::create_dir_all(&support_root).unwrap();
    let mut invocation = Invocation {
        context: InvocationContext {
            host_context: HostContext {
                app_root: app_root.to_string_lossy().into(),
                support_root: support_root.to_string_lossy().into(),
                session_id: session_id.as_str().to_owned(),
            },
            managed_root: root,
        },
        request: RequestEnvelope {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            metadata: RequestMetadata {
                request_id: RequestId::parse("request-invocation").unwrap(),
                session_id,
                deadline_unix_ms: DeadlineUnixMs::new(u64::MAX),
                cancellable: true,
                idempotency_key: None,
            },
            context: InvocationContext {
                host_context: HostContext {
                    app_root: app_root.to_string_lossy().into(),
                    support_root: support_root.to_string_lossy().into(),
                    session_id: "session-invocation".to_owned(),
                },
                managed_root: ManagedRootContext::SessionDefault,
            },
            method: MethodName::parse("test.resolve").unwrap(),
            payload: serde_json::json!({}),
        },
    };
    invocation.request.context = invocation.context.clone();
    invocation
}

#[test]
fn resolve_invocation_uses_support_root_for_session_default() {
    let resolved: ResolvedInvocation =
        resolve_invocation(&invocation(ManagedRootContext::SessionDefault)).unwrap();
    assert_eq!(
        resolved.managed_root().source(),
        ty_plus_storage::ManagedRootSource::SessionDefault
    );
    assert!(
        !resolved
            .managed_root()
            .managed_root()
            .to_string_lossy()
            .contains("24.0.0")
    );
    let _ = resolved.storage();
    let _ = resolved.host_filesystem();
    let _ = resolved.online();
}

#[test]
fn resolve_invocation_rejects_shared_root_escape_and_missing_root() {
    let relative = invocation(ManagedRootContext::ExplicitShared {
        root: String::from("relative/root"),
    });
    assert!(resolve_invocation(&relative).is_err());

    let missing = invocation(ManagedRootContext::ExplicitShared {
        root: std::env::temp_dir()
            .join("ow-rust-003-explicit-shared")
            .to_string_lossy()
            .into(),
    });
    let resolved = resolve_invocation(&missing).unwrap();
    assert_eq!(
        resolved.managed_root().source(),
        ty_plus_storage::ManagedRootSource::ExplicitShared
    );
}

#[test]
fn resolve_invocation_rejects_request_context_mismatch() {
    let mut mismatched = invocation(ManagedRootContext::SessionDefault);
    mismatched.request.context.host_context.session_id = "other-session".to_owned();
    assert!(matches!(
        resolve_invocation(&mismatched),
        Err(ty_plus_operation_worker::InvocationError::ContextMismatch)
    ));
}

#[test]
fn injected_online_boundary_cannot_cross_invocation_root() {
    let invocation = invocation(ManagedRootContext::SessionDefault);
    let other_root = std::env::temp_dir().join("ow-rust-003-other-online-root");
    std::fs::create_dir_all(&other_root).unwrap();
    let online = ty_plus_operation_worker::OnlineBoundary::unconfigured(&other_root);
    assert!(matches!(
        ty_plus_operation_worker::resolve_invocation_with_online(&invocation, online),
        Err(ty_plus_operation_worker::InvocationError::ContextMismatch)
    ));
}
