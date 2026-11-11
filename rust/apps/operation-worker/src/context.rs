//! Composition root for a single operation invocation.

use ty_plus_host_filesystem::HostFilesystemBoundary;
use ty_plus_protocol::{
    InvocationContext, ManagedRootContext, ProtocolVersion, RequestEnvelope, RequestId, SessionId,
    ValidationError,
};
use ty_plus_storage::{
    HostSessionRoots, InvocationId, ManagedRootSelection, ResolvedStorageRoots, SessionAppRoot,
    SessionSupportRoot, SharedBrowseRoot,
};

use crate::online_dispatch::OnlineBoundary;
use crate::storage_dispatch::{StorageBoundary, StorageError};

/// Immutable request plus the host/session context from which its boundaries are built.
#[derive(Debug, Clone)]
pub struct Invocation {
    pub context: InvocationContext,
    pub request: RequestEnvelope,
}

impl Invocation {
    /// Small constructor useful to boundary tests and adapters.
    pub fn for_test(context: InvocationContext, method: impl Into<String>) -> Self {
        let session_id =
            ty_plus_protocol::SessionId::parse(context.host_context.session_id.clone())
                .expect("test session id must be valid");
        Self {
            request: RequestEnvelope {
                protocol_version: ty_plus_protocol::CURRENT_PROTOCOL_VERSION,
                metadata: ty_plus_protocol::RequestMetadata {
                    request_id: ty_plus_protocol::RequestId::parse("test-request")
                        .expect("test request id must be valid"),
                    session_id,
                    deadline_unix_ms: ty_plus_protocol::DeadlineUnixMs::new(u64::MAX),
                    cancellable: true,
                    idempotency_key: None,
                },
                context: context.clone(),
                method: ty_plus_protocol::MethodName::parse(method)
                    .expect("test method must be valid"),
                payload: serde_json::Value::Null,
            },
            context,
        }
    }

    pub fn resolve(&self) -> Result<ResolvedInvocation, InvocationError> {
        resolve_invocation(self)
    }
}

/// All per-invocation domain boundaries. No field is process-global.
#[derive(Debug)]
pub struct ResolvedInvocation {
    pub managed_root: ResolvedStorageRoots,
    pub storage: StorageBoundary,
    pub host_filesystem: HostFilesystemBoundary,
    pub online: OnlineBoundary,
    pub protocol_version: ProtocolVersion,
    pub session_id: SessionId,
    pub request_id: RequestId,
}

impl ResolvedInvocation {
    #[must_use]
    pub fn managed_root(&self) -> &ResolvedStorageRoots {
        &self.managed_root
    }

    #[must_use]
    pub fn storage(&self) -> &StorageBoundary {
        &self.storage
    }

    #[must_use]
    pub fn host_filesystem(&self) -> &HostFilesystemBoundary {
        &self.host_filesystem
    }

    #[must_use]
    pub fn online(&self) -> &OnlineBoundary {
        &self.online
    }
}

pub fn resolve_invocation(invocation: &Invocation) -> Result<ResolvedInvocation, InvocationError> {
    invocation
        .context
        .validate()
        .map_err(InvocationError::Validation)?;
    if invocation.request.context != invocation.context {
        return Err(InvocationError::ContextMismatch);
    }
    if invocation.request.metadata.session_id.as_str() != invocation.context.host_context.session_id
    {
        return Err(InvocationError::ContextMismatch);
    }

    let host = &invocation.context.host_context;
    let session = HostSessionRoots::new(
        SessionAppRoot::new(&host.app_root).map_err(InvocationError::Root)?,
        SessionSupportRoot::new(&host.support_root).map_err(InvocationError::Root)?,
    );
    let selection = match &invocation.context.managed_root {
        ManagedRootContext::SessionDefault => ManagedRootSelection::SessionDefault,
        ManagedRootContext::ExplicitShared { root } => ManagedRootSelection::ExplicitShared(
            SharedBrowseRoot::new(root).map_err(InvocationError::Root)?,
        ),
    };
    let managed_root = session.resolve_storage(selection);
    let managed_root_path = managed_root.managed_root().to_path_buf();
    let managed_root_handle = managed_root
        .managed_root_handle()
        .map_err(InvocationError::Root)?;
    let invocation_id = InvocationId::new(invocation.request.metadata.request_id.as_str());
    let storage = StorageBoundary::new(managed_root_handle, invocation_id)
        .map_err(InvocationError::Storage)?;
    storage
        .recover_for_operation(&invocation.request.method, &invocation.request.payload)
        .map_err(InvocationError::Storage)?;

    Ok(ResolvedInvocation {
        managed_root,
        storage,
        host_filesystem: HostFilesystemBoundary::new(),
        online: OnlineBoundary::unconfigured(&managed_root_path),
        protocol_version: invocation.request.protocol_version,
        session_id: invocation.request.metadata.session_id.clone(),
        request_id: invocation.request.metadata.request_id.clone(),
    })
}

/// Resolves an invocation with an explicitly injected online composition.
pub fn resolve_invocation_with_online(
    invocation: &Invocation,
    online: OnlineBoundary,
) -> Result<ResolvedInvocation, InvocationError> {
    let mut resolved = resolve_invocation(invocation)?;
    if online.managed_root() != resolved.managed_root.managed_root() {
        return Err(InvocationError::ContextMismatch);
    }
    resolved.online = online;
    Ok(resolved)
}

#[derive(Debug)]
pub enum InvocationError {
    Validation(ValidationError),
    ContextMismatch,
    Root(ty_plus_storage::RootValidationError),
    Storage(StorageError),
}

impl std::fmt::Display for InvocationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(error) => write!(f, "invocation validation failed: {error}"),
            Self::ContextMismatch => f.write_str("request and invocation contexts differ"),
            Self::Root(error) => write!(f, "invocation root failed: {error}"),
            Self::Storage(error) => write!(f, "invocation storage failed: {error}"),
        }
    }
}

impl std::error::Error for InvocationError {}
