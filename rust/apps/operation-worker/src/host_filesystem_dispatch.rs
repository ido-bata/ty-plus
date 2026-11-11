//! Host filesystem adapters. Context discovery remains on the AE side.

use std::path::PathBuf;

use ty_plus_host_filesystem::scan::{HostScanRoot, ScanError, scan_roots_with_progress};
use ty_plus_protocol::{
    EventEnvelope, EventPayload, PluginEffectScanRequest, PluginEffectScanResult, ProgressEvent,
    RequestEnvelope,
};

use crate::{CancellationToken, EventSink};

/// Dispatches a scan with the request identity needed to forward the
/// host-filesystem progress contract to the worker event sink.
pub fn dispatch_plugin_effect_scan_for_request(
    request: &RequestEnvelope,
    scan_request: PluginEffectScanRequest,
    cancellation: &CancellationToken,
    events: &mut dyn EventSink,
) -> Result<PluginEffectScanResult, HostFilesystemError> {
    request
        .context
        .host_context
        .validate()
        .map_err(HostFilesystemError::Validation)?;
    scan_request
        .validate()
        .map_err(HostFilesystemError::Validation)?;
    let roots = scan_request
        .normalized_roots()
        .map_err(HostFilesystemError::Validation)?
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    let capability =
        HostScanRoot::open(&request.context.host_context.app_root).map_err(|error| {
            HostFilesystemError::Scan(ScanError::IoError {
                path: request.context.host_context.app_root.clone().into(),
                detail: error.to_string(),
            })
        })?;
    let total = roots.len() as u64;
    let sequence = std::cell::Cell::new(0_u64);
    let emitted = std::cell::Cell::new(false);
    let mut rows = Vec::new();
    for (index, root) in roots.iter().enumerate() {
        cancellation
            .checkpoint()
            .map_err(|error| HostFilesystemError::Progress(error.to_string()))?;
        let base = index as u64;
        let mut forward_progress = |mut progress_event: ProgressEvent| {
            if progress_event.sequence != 0 {
                cancellation
                    .checkpoint()
                    .map_err(|error| ScanError::Progress(error.to_string()))?;
            }
            if progress_event.stage == ty_plus_protocol::ProgressStage::Finished
                && index + 1 != roots.len()
            {
                progress_event.stage = ty_plus_protocol::ProgressStage::Discovering;
            }
            progress_event.sequence = if emitted.replace(true) {
                let next = sequence.get() + 1;
                sequence.set(next);
                next
            } else {
                0
            };
            progress_event.completed_units = progress_event
                .completed_units
                .map(|completed| base + completed);
            progress_event.total_units = Some(total);
            events
                .progress(EventEnvelope {
                    protocol_version: request.protocol_version,
                    session_id: request.metadata.session_id.clone(),
                    request_id: request.metadata.request_id.clone(),
                    payload: EventPayload::Progress(progress_event),
                })
                .map_err(|error| ScanError::Progress(error.to_string()))
        };
        let output = scan_roots_with_progress(
            &capability,
            std::slice::from_ref(root),
            &mut forward_progress,
        )
        .map_err(|error| {
            if let ScanError::Progress(detail) = error {
                HostFilesystemError::Progress(detail)
            } else {
                HostFilesystemError::Scan(error)
            }
        })?;
        rows.extend(output.rows);
    }
    rows.sort_by(|a, b| a.match_name.cmp(&b.match_name));
    rows.dedup_by(|a, b| a.match_name == b.match_name);
    Ok(PluginEffectScanResult { rows })
}

#[derive(Debug)]
pub enum HostFilesystemError {
    Validation(ty_plus_protocol::ValidationError),
    Scan(ScanError),
    Progress(String),
}

impl std::fmt::Display for HostFilesystemError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(error) => write!(f, "host request validation failed: {error}"),
            Self::Scan(error) => write!(f, "host filesystem scan failed: {error}"),
            Self::Progress(detail) => write!(f, "host filesystem progress failed: {detail}"),
        }
    }
}

impl std::error::Error for HostFilesystemError {}
