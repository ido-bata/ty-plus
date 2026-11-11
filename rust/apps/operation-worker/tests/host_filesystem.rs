use ty_plus_operation_worker::{
    CancellationToken, EventSink, HostFilesystemError, Invocation, WorkerError,
    dispatch_plugin_effect_scan_for_request,
};
use ty_plus_protocol::{
    EventEnvelope, HostContext, InvocationContext, ManagedRootContext, PluginEffectScanRequest,
};

#[derive(Default)]
struct Events(Vec<EventEnvelope>);

impl EventSink for Events {
    fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError> {
        self.0.push(event);
        Ok(())
    }
}

struct FailingEvents {
    seen: usize,
    events: Vec<EventEnvelope>,
}

#[cfg(target_os = "windows")]
fn platform_plugin_filename(stem: &str) -> String {
    format!("{stem}.aex")
}

#[cfg(target_os = "macos")]
fn platform_plugin_filename(stem: &str) -> String {
    format!("{stem}.plugin")
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn platform_plugin_filename(stem: &str) -> String {
    format!("{stem}.plugin")
}

impl EventSink for FailingEvents {
    fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError> {
        self.seen += 1;
        self.events.push(event);
        if self.seen >= 2 {
            return Err(WorkerError::Protocol(
                ty_plus_protocol::StableErrorCode::ProtocolViolation,
            ));
        }
        Ok(())
    }
}

fn progress_event(event: &EventEnvelope) -> &ty_plus_protocol::ProgressEvent {
    match &event.payload {
        ty_plus_protocol::EventPayload::Progress(progress) => progress,
        other => panic!("expected progress event, got {other:?}"),
    }
}

#[test]
fn plugin_effect_scan_requires_invocation_host_context_and_delegates_to_scan() {
    let root = std::env::temp_dir().join("ow-rust-003-host-scan");
    std::fs::create_dir_all(root.join("Plugins")).unwrap();
    std::fs::write(
        root.join("Plugins").join(platform_plugin_filename("demo")),
        b"plugin",
    )
    .unwrap();

    let invocation = Invocation::for_test(
        InvocationContext {
            host_context: HostContext {
                app_root: root.to_string_lossy().into(),
                support_root: root.to_string_lossy().into(),
                session_id: "session-host".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        "host.scan",
    );
    let mut events = Events::default();
    let cancellation = CancellationToken::default();
    let result = dispatch_plugin_effect_scan_for_request(
        &invocation.request,
        PluginEffectScanRequest {
            roots: vec!["Plugins".to_owned()],
        },
        &cancellation,
        &mut events,
    )
    .unwrap();
    assert_eq!(result.rows.len(), 1);
    assert!(
        result.rows[0]
            .file_path
            .ends_with(&platform_plugin_filename("demo"))
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn plugin_effect_scan_rejects_empty_request_before_touching_filesystem() {
    let context = HostContext {
        app_root: "/Applications/After Effects".to_owned(),
        support_root: "/tmp/support".to_owned(),
        session_id: "session-host".to_owned(),
    };
    let mut events = Events::default();
    let cancellation = CancellationToken::default();
    let invocation = Invocation::for_test(
        InvocationContext {
            host_context: context,
            managed_root: ManagedRootContext::SessionDefault,
        },
        "host.scan",
    );
    assert!(
        dispatch_plugin_effect_scan_for_request(
            &invocation.request,
            PluginEffectScanRequest { roots: Vec::new() },
            &cancellation,
            &mut events,
        )
        .is_err()
    );
}

#[test]
fn plugin_effect_scan_for_request_forwards_monotonic_progress_events() {
    let root = std::env::temp_dir().join("ow-rust-003-host-progress");
    std::fs::create_dir_all(root.join("Plugins")).unwrap();
    std::fs::write(
        root.join("Plugins").join(platform_plugin_filename("demo")),
        b"plugin",
    )
    .unwrap();
    let invocation = Invocation::for_test(
        InvocationContext {
            host_context: HostContext {
                app_root: root.to_string_lossy().into(),
                support_root: root.to_string_lossy().into(),
                session_id: "session-host-progress".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        "host.scan",
    );
    let mut events = Events::default();
    let cancellation = CancellationToken::default();
    dispatch_plugin_effect_scan_for_request(
        &invocation.request,
        PluginEffectScanRequest {
            roots: vec!["Plugins".to_owned()],
        },
        &cancellation,
        &mut events,
    )
    .unwrap();
    assert_eq!(
        events.0.len(),
        3,
        "one root emits discover, item, and finish"
    );
    let progress: Vec<_> = events.0.iter().map(progress_event).collect();
    assert_eq!(
        progress
            .iter()
            .map(|event| event.sequence)
            .collect::<Vec<_>>(),
        [0, 1, 2]
    );
    assert_eq!(
        progress[0].stage,
        ty_plus_protocol::ProgressStage::Discovering
    );
    assert_eq!(progress[0].completed_units, Some(0));
    assert_eq!(progress[0].total_units, Some(1));
    assert_eq!(
        progress[1].stage,
        ty_plus_protocol::ProgressStage::Discovering
    );
    assert_eq!(progress[1].completed_units, Some(0));
    assert_eq!(progress[1].total_units, Some(1));
    assert_eq!(progress[2].stage, ty_plus_protocol::ProgressStage::Finished);
    assert_eq!(progress[2].completed_units, Some(1));
    assert_eq!(progress[2].total_units, Some(1));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn plugin_effect_scan_aborts_inside_live_progress_callback() {
    let root = std::env::temp_dir().join("ow-rust-003-host-progress-abort");
    std::fs::create_dir_all(root.join("Plugins")).unwrap();
    std::fs::write(
        root.join("Plugins").join(platform_plugin_filename("demo")),
        b"plugin",
    )
    .unwrap();
    let invocation = Invocation::for_test(
        InvocationContext {
            host_context: HostContext {
                app_root: root.to_string_lossy().into(),
                support_root: root.to_string_lossy().into(),
                session_id: "session-host-progress-abort".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        "host.scan",
    );
    let mut events = FailingEvents {
        seen: 0,
        events: Vec::new(),
    };
    let cancellation = CancellationToken::default();
    let error = dispatch_plugin_effect_scan_for_request(
        &invocation.request,
        PluginEffectScanRequest {
            roots: vec!["Plugins".to_owned()],
        },
        &cancellation,
        &mut events,
    )
    .unwrap_err();
    assert!(matches!(error, HostFilesystemError::Progress(_)));
    assert_eq!(events.seen, 2, "scan must stop at the rejected callback");
    assert_eq!(events.events.len(), 2);
    assert_eq!(
        progress_event(&events.events[0]).stage,
        ty_plus_protocol::ProgressStage::Discovering
    );
    let rejected = progress_event(&events.events[1]);
    assert_eq!(rejected.stage, ty_plus_protocol::ProgressStage::Discovering);
    assert_eq!(rejected.completed_units, Some(0));
    assert_eq!(rejected.total_units, Some(1));
    assert!(
        events.events.iter().all(|event| {
            progress_event(event).stage != ty_plus_protocol::ProgressStage::Finished
        })
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn plugin_effect_scan_multi_root_exposes_only_final_finished_stage() {
    let root = std::env::temp_dir().join("ow-rust-003-host-multi-progress");
    for name in ["Plugins", "Effects"] {
        std::fs::create_dir_all(root.join(name)).unwrap();
        std::fs::write(
            root.join(name).join(platform_plugin_filename("demo")),
            b"plugin",
        )
        .unwrap();
    }
    let invocation = Invocation::for_test(
        InvocationContext {
            host_context: HostContext {
                app_root: root.to_string_lossy().into(),
                support_root: root.to_string_lossy().into(),
                session_id: "session-host-multi".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        "host.scan",
    );
    let mut events = Events::default();
    let cancellation = CancellationToken::default();
    dispatch_plugin_effect_scan_for_request(
        &invocation.request,
        PluginEffectScanRequest {
            roots: vec!["Plugins".to_owned(), "Effects".to_owned()],
        },
        &cancellation,
        &mut events,
    )
    .unwrap();
    let progress: Vec<_> = events.0.iter().map(progress_event).collect();
    assert!(
        progress
            .windows(2)
            .all(|pair| pair[1].stage >= pair[0].stage)
    );
    assert_eq!(
        progress
            .iter()
            .map(|event| event.sequence)
            .collect::<Vec<_>>(),
        [0, 1, 2, 3, 4, 5]
    );
    assert_eq!(
        progress
            .iter()
            .map(|event| (event.completed_units, event.total_units))
            .collect::<Vec<_>>(),
        [
            (Some(0), Some(2)),
            (Some(0), Some(2)),
            (Some(1), Some(2)),
            (Some(1), Some(2)),
            (Some(1), Some(2)),
            (Some(2), Some(2)),
        ]
    );
    assert_eq!(
        progress
            .iter()
            .filter(|event| event.stage == ty_plus_protocol::ProgressStage::Finished)
            .count(),
        1
    );
    assert_eq!(
        progress.last().unwrap().stage,
        ty_plus_protocol::ProgressStage::Finished
    );
    let _ = std::fs::remove_dir_all(root);
}
