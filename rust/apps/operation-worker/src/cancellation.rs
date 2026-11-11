use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use ty_plus_protocol::StableErrorCode;

use crate::lifecycle::WorkerError;

/// Cooperative cancellation shared by the lifecycle reader and operation executor.
#[derive(Clone, Debug, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    /// Returns a stable cancellation error at an executor-defined safe point.
    pub fn checkpoint(&self) -> Result<(), WorkerError> {
        if self.is_cancelled() {
            Err(WorkerError::Protocol(StableErrorCode::Cancelled))
        } else {
            Ok(())
        }
    }

    pub(crate) fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }
}
