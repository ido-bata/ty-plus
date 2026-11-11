use std::fmt;

/// A local validation failure detected before a message reaches domain code.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum ValidationError {
    Empty {
        field: &'static str,
    },
    TooLong {
        field: &'static str,
        max_bytes: usize,
        actual_bytes: usize,
    },
    InvalidCharacters {
        field: &'static str,
    },
    InvalidFormat {
        field: &'static str,
    },
    DeadlineExpired,
    DeadlineTooFar,
    MissingIdempotencyKey,
    UnexpectedIdempotencyKey,
    FrameTooLarge {
        max_bytes: usize,
        actual_bytes: usize,
    },
    QueueFull {
        max_pending: usize,
        actual_pending: usize,
    },
    UnknownMethodBudgetExceeded {
        max_unknown: usize,
    },
    TooManyCapabilities {
        max: usize,
        actual: usize,
    },
    JsonNestingTooDeep {
        max_depth: usize,
    },
    TooManyWarnings {
        max: usize,
        actual: usize,
    },
    CompletedExceedsTotal,
    ProgressSequenceNotIncreasing,
    ProgressRegressed,
    ProgressTotalChanged,
    ProgressStageRegressed,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty { field } => write!(formatter, "{field} must not be empty"),
            Self::TooLong {
                field,
                max_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "{field} is {actual_bytes} bytes; maximum is {max_bytes}"
            ),
            Self::InvalidCharacters { field } => {
                write!(formatter, "{field} contains invalid characters")
            }
            Self::InvalidFormat { field } => write!(formatter, "{field} has an invalid format"),
            Self::DeadlineExpired => formatter.write_str("request deadline has expired"),
            Self::DeadlineTooFar => {
                formatter.write_str("request deadline is too far in the future")
            }
            Self::MissingIdempotencyKey => {
                formatter.write_str("this operation requires an idempotency key")
            }
            Self::UnexpectedIdempotencyKey => {
                formatter.write_str("this operation does not accept an idempotency key")
            }
            Self::FrameTooLarge {
                max_bytes,
                actual_bytes,
            } => write!(
                formatter,
                "frame is {actual_bytes} bytes; maximum is {max_bytes}"
            ),
            Self::QueueFull {
                max_pending,
                actual_pending,
            } => write!(
                formatter,
                "queue contains {actual_pending} pending requests; maximum is {max_pending}"
            ),
            Self::UnknownMethodBudgetExceeded { max_unknown } => write!(
                formatter,
                "unknown method budget exceeded; maximum is {max_unknown}"
            ),
            Self::TooManyCapabilities { max, actual } => {
                write!(formatter, "capability count is {actual}; maximum is {max}")
            }
            Self::JsonNestingTooDeep { max_depth } => {
                write!(formatter, "JSON nesting exceeds maximum depth {max_depth}")
            }
            Self::TooManyWarnings { max, actual } => {
                write!(formatter, "warning count is {actual}; maximum is {max}")
            }
            Self::CompletedExceedsTotal => {
                formatter.write_str("completed units exceed total units")
            }
            Self::ProgressSequenceNotIncreasing => {
                formatter.write_str("progress sequence must increase")
            }
            Self::ProgressRegressed => formatter.write_str("completed progress regressed"),
            Self::ProgressTotalChanged => formatter.write_str("progress total changed"),
            Self::ProgressStageRegressed => formatter.write_str("progress stage regressed"),
        }
    }
}

impl std::error::Error for ValidationError {}

pub(crate) fn validate_bounded_text(
    field: &'static str,
    value: &str,
    max_bytes: usize,
) -> Result<(), ValidationError> {
    if value.is_empty() {
        return Err(ValidationError::Empty { field });
    }
    if value.len() > max_bytes {
        return Err(ValidationError::TooLong {
            field,
            max_bytes,
            actual_bytes: value.len(),
        });
    }
    if value.chars().any(char::is_control) {
        return Err(ValidationError::InvalidCharacters { field });
    }
    Ok(())
}

pub(crate) fn validate_identifier(
    field: &'static str,
    value: &str,
    max_bytes: usize,
) -> Result<(), ValidationError> {
    validate_bounded_text(field, value, max_bytes)?;
    if value
        .bytes()
        .any(|byte| !byte.is_ascii_alphanumeric() && !matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(ValidationError::InvalidCharacters { field });
    }
    Ok(())
}

pub(crate) fn validate_qualified_name(
    field: &'static str,
    value: &str,
    max_bytes: usize,
) -> Result<(), ValidationError> {
    validate_bounded_text(field, value, max_bytes)?;
    let segments_are_valid = value.split('.').all(|segment| {
        !segment.is_empty()
            && segment.as_bytes()[0].is_ascii_lowercase()
            && segment
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    });
    if !segments_are_valid {
        return Err(ValidationError::InvalidFormat { field });
    }
    Ok(())
}
