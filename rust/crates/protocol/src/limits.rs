use crate::ValidationError;

pub const MAX_FRAME_BYTES: usize = 1024 * 1024;
pub const MAX_PENDING_REQUESTS: usize = 128;
pub const MAX_STRING_BYTES: usize = 16 * 1024;
pub const MAX_UNKNOWN_METHODS_PER_SESSION: usize = 8;
pub const MAX_JSON_DEPTH: usize = 32;
pub const MAX_WARNINGS: usize = 32;

pub fn validate_frame_size(actual_bytes: usize) -> Result<(), ValidationError> {
    if actual_bytes > MAX_FRAME_BYTES {
        return Err(ValidationError::FrameTooLarge {
            max_bytes: MAX_FRAME_BYTES,
            actual_bytes,
        });
    }
    Ok(())
}

pub fn validate_pending_queue(actual_pending: usize) -> Result<(), ValidationError> {
    if actual_pending > MAX_PENDING_REQUESTS {
        return Err(ValidationError::QueueFull {
            max_pending: MAX_PENDING_REQUESTS,
            actual_pending,
        });
    }
    Ok(())
}

/// Per-session fail-closed budget for method names not present in the negotiated registry.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UnknownMethodBudget {
    rejected: usize,
}

impl UnknownMethodBudget {
    #[must_use]
    pub const fn new() -> Self {
        Self { rejected: 0 }
    }

    pub fn record_rejection(&mut self) -> Result<(), ValidationError> {
        if self.rejected >= MAX_UNKNOWN_METHODS_PER_SESSION {
            return Err(ValidationError::UnknownMethodBudgetExceeded {
                max_unknown: MAX_UNKNOWN_METHODS_PER_SESSION,
            });
        }
        self.rejected += 1;
        Ok(())
    }

    #[must_use]
    pub const fn rejected(&self) -> usize {
        self.rejected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_limits_are_accepted_and_one_over_is_rejected() {
        assert!(validate_frame_size(MAX_FRAME_BYTES).is_ok());
        assert!(matches!(
            validate_frame_size(MAX_FRAME_BYTES + 1),
            Err(ValidationError::FrameTooLarge { .. })
        ));
        assert!(validate_pending_queue(MAX_PENDING_REQUESTS).is_ok());
        assert!(matches!(
            validate_pending_queue(MAX_PENDING_REQUESTS + 1),
            Err(ValidationError::QueueFull { .. })
        ));
    }

    #[test]
    fn unknown_method_budget_fails_closed() {
        let mut budget = UnknownMethodBudget::new();
        for _ in 0..MAX_UNKNOWN_METHODS_PER_SESSION {
            budget.record_rejection().unwrap();
        }
        assert_eq!(budget.rejected(), MAX_UNKNOWN_METHODS_PER_SESSION);
        assert_eq!(
            budget.record_rejection(),
            Err(ValidationError::UnknownMethodBudgetExceeded {
                max_unknown: MAX_UNKNOWN_METHODS_PER_SESSION,
            })
        );
    }
}
