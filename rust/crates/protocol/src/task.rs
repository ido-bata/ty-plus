use serde::{Deserialize, Serialize};

use crate::{RequestId, ValidationError, MAX_STRING_BYTES};

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProgressStage {
    Preparing,
    Discovering,
    Downloading,
    Reading,
    Writing,
    Verifying,
    Committing,
    Finished,
}

impl ProgressStage {
    #[must_use]
    pub const fn accepts_cancellation(self) -> bool {
        !matches!(self, Self::Committing | Self::Finished)
    }
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProgressEvent {
    pub sequence: u64,
    pub stage: ProgressStage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_units: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_units: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_safe_detail: Option<String>,
}

impl ProgressEvent {
    pub fn validate(&self) -> Result<(), ValidationError> {
        if let (Some(completed), Some(total)) = (self.completed_units, self.total_units) {
            if completed > total {
                return Err(ValidationError::CompletedExceedsTotal);
            }
        }
        if let Some(detail) = &self.user_safe_detail {
            crate::validation::validate_bounded_text(
                "progress.user_safe_detail",
                detail,
                MAX_STRING_BYTES,
            )?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProgressState {
    last: ProgressEvent,
}

impl ProgressState {
    pub fn start(first: ProgressEvent) -> Result<Self, ValidationError> {
        first.validate()?;
        Ok(Self { last: first })
    }

    pub fn advance(&mut self, next: ProgressEvent) -> Result<(), ValidationError> {
        next.validate()?;
        if next.sequence <= self.last.sequence {
            return Err(ValidationError::ProgressSequenceNotIncreasing);
        }
        if next.stage < self.last.stage {
            return Err(ValidationError::ProgressStageRegressed);
        }
        if matches!(self.last.stage, ProgressStage::Finished)
            && !matches!(next.stage, ProgressStage::Finished)
        {
            return Err(ValidationError::ProgressStageRegressed);
        }
        if let (Some(previous), Some(current)) = (self.last.completed_units, next.completed_units) {
            if current < previous {
                return Err(ValidationError::ProgressRegressed);
            }
        }
        if let Some(previous) = self.last.total_units {
            if next.total_units != Some(previous) {
                return Err(ValidationError::ProgressTotalChanged);
            }
        }
        self.last = next;
        Ok(())
    }

    #[must_use]
    pub const fn current(&self) -> &ProgressEvent {
        &self.last
    }
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CancelRequest {
    pub target_request_id: RequestId,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancellationDecision {
    Accepted,
    RejectedNotCancellable,
    RejectedCommitInProgress,
    AlreadyFinished,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CancellationAcknowledgement {
    pub target_request_id: RequestId,
    pub decision: CancellationDecision,
}

impl CancellationDecision {
    #[must_use]
    pub const fn for_stage(cancellable: bool, stage: ProgressStage) -> Self {
        if matches!(stage, ProgressStage::Finished) {
            return Self::AlreadyFinished;
        }
        if matches!(stage, ProgressStage::Committing) {
            return Self::RejectedCommitInProgress;
        }
        if !cancellable {
            return Self::RejectedNotCancellable;
        }
        Self::Accepted
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn progress(sequence: u64, stage: ProgressStage, completed: u64) -> ProgressEvent {
        ProgressEvent {
            sequence,
            stage,
            completed_units: Some(completed),
            total_units: Some(10),
            user_safe_detail: None,
        }
    }

    #[test]
    fn progress_transitions_are_monotonic() {
        let mut state = ProgressState::start(progress(0, ProgressStage::Preparing, 0)).unwrap();
        state
            .advance(progress(1, ProgressStage::Downloading, 4))
            .unwrap();
        state
            .advance(progress(2, ProgressStage::Verifying, 10))
            .unwrap();
        assert_eq!(state.current().stage, ProgressStage::Verifying);

        assert_eq!(
            state.advance(progress(3, ProgressStage::Downloading, 10)),
            Err(ValidationError::ProgressStageRegressed)
        );
    }

    #[test]
    fn invalid_progress_counts_are_rejected() {
        assert_eq!(
            progress(0, ProgressStage::Preparing, 11).validate(),
            Err(ValidationError::CompletedExceedsTotal)
        );
        let mut state = ProgressState::start(progress(1, ProgressStage::Downloading, 5)).unwrap();
        assert_eq!(
            state.advance(progress(2, ProgressStage::Downloading, 4)),
            Err(ValidationError::ProgressRegressed)
        );
    }

    #[test]
    fn committing_is_an_explicit_non_cancellable_stage() {
        assert_eq!(
            CancellationDecision::for_stage(true, ProgressStage::Committing),
            CancellationDecision::RejectedCommitInProgress
        );
        assert_eq!(
            CancellationDecision::for_stage(true, ProgressStage::Verifying),
            CancellationDecision::Accepted
        );
    }

    #[test]
    fn cancellation_messages_name_the_target_request() {
        let request = CancelRequest {
            target_request_id: RequestId::parse("request-target").unwrap(),
        };
        let encoded = serde_json::to_string(&request).unwrap();
        assert_eq!(
            serde_json::from_str::<CancelRequest>(&encoded).unwrap(),
            request
        );

        let acknowledgement = CancellationAcknowledgement {
            target_request_id: request.target_request_id,
            decision: CancellationDecision::RejectedCommitInProgress,
        };
        assert_eq!(
            serde_json::from_value::<CancellationAcknowledgement>(
                serde_json::to_value(&acknowledgement).unwrap()
            )
            .unwrap(),
            acknowledgement
        );
    }
}
