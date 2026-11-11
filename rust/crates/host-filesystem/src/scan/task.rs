//! Scan task with progress and cancel support.
//!
//! This module provides a scan task that can report progress
//! and be cancelled during execution.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use ty_plus_protocol::{ProgressEvent, ProgressStage};

use super::{ScanError, ScanOutput};

/// Progress callback type.
type ProgressCallback = Box<dyn Fn(ProgressEvent) + Send + Sync>;

/// Scan task with progress and cancel support.
pub struct ScanTask {
    capability: super::HostScanRoot,
    roots: Vec<PathBuf>,
    cancel_flag: Arc<AtomicBool>,
    progress_callback: Option<Arc<ProgressCallback>>,
}

impl ScanTask {
    /// Creates a new scan task.
    pub fn new(capability: super::HostScanRoot, roots: Vec<PathBuf>) -> Self {
        Self {
            capability,
            roots,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            progress_callback: None,
        }
    }

    /// Sets the progress callback.
    pub fn with_progress_callback(mut self, callback: ProgressCallback) -> Self {
        self.progress_callback = Some(Arc::new(callback));
        self
    }

    /// Gets a cancel handle for this task.
    pub fn cancel_handle(&self) -> CancelHandle {
        CancelHandle {
            flag: Arc::clone(&self.cancel_flag),
        }
    }

    /// Runs the scan task, reporting progress.
    ///
    /// # Errors
    ///
    /// Returns `ScanError` if an I/O error occurs or if the task is cancelled.
    pub fn run(&self) -> Result<ScanOutput, ScanError> {
        // Report initial progress
        self.report_progress(ProgressEvent {
            sequence: 0,
            stage: ProgressStage::Discovering,
            completed_units: Some(0),
            total_units: Some(self.roots.len() as u64),
            user_safe_detail: None,
        });

        let mut rows = Vec::new();
        let mut warnings = Vec::new();
        let mut completed = 0u64;

        for root in &self.roots {
            // Check for cancellation
            if self.cancel_flag.load(Ordering::Relaxed) {
                self.report_progress(ProgressEvent {
                    sequence: completed + 1,
                    stage: ProgressStage::Finished,
                    completed_units: Some(completed),
                    total_units: Some(self.roots.len() as u64),
                    user_safe_detail: Some("Scan cancelled".to_string()),
                });
                return Err(ScanError::IoError {
                    path: root.clone(),
                    detail: "Scan cancelled".to_string(),
                });
            }

            // Scan the root
            let result = super::scan_roots(&self.capability, std::slice::from_ref(root))?;
            rows.extend(result.rows);
            warnings.extend(result.warnings);

            completed += 1;

            // Report progress
            self.report_progress(ProgressEvent {
                sequence: completed + 1,
                stage: if completed == self.roots.len() as u64 {
                    ProgressStage::Finished
                } else {
                    ProgressStage::Discovering
                },
                completed_units: Some(completed),
                total_units: Some(self.roots.len() as u64),
                user_safe_detail: None,
            });
        }

        Ok(ScanOutput::new(rows, warnings))
    }

    /// Reports progress via the callback.
    fn report_progress(&self, event: ProgressEvent) {
        if let Some(callback) = &self.progress_callback {
            callback(event);
        }
    }
}

/// Handle for cancelling a scan task.
#[derive(Debug, Clone)]
pub struct CancelHandle {
    flag: Arc<AtomicBool>,
}

impl CancelHandle {
    /// Cancels the scan task.
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::Relaxed);
    }

    /// Returns true if the task has been cancelled.
    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::super::HostScanRoot;
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn scan_task_new() {
        let temp = tempfile::tempdir().unwrap();
        let capability = HostScanRoot::open(temp.path()).unwrap();
        let task = ScanTask::new(capability, vec![PathBuf::from("Plugins")]);
        assert_eq!(task.roots.len(), 1);
    }

    #[test]
    fn cancel_handle_new() {
        let temp = tempfile::tempdir().unwrap();
        let capability = HostScanRoot::open(temp.path()).unwrap();
        let task = ScanTask::new(capability, vec![]);
        let handle = task.cancel_handle();
        assert!(!handle.is_cancelled());
    }

    #[test]
    fn cancel_handle_cancel() {
        let temp = tempfile::tempdir().unwrap();
        let capability = HostScanRoot::open(temp.path()).unwrap();
        let task = ScanTask::new(capability, vec![]);
        let handle = task.cancel_handle();
        handle.cancel();
        assert!(handle.is_cancelled());
    }

    #[test]
    fn scan_task_run_empty_roots() {
        let temp = tempfile::tempdir().unwrap();
        let capability = HostScanRoot::open(temp.path()).unwrap();
        let task = ScanTask::new(capability, vec![]);
        let result = task.run().expect("Scan should succeed");
        assert!(result.rows.is_empty());
    }

    #[test]
    fn scan_task_run_with_progress() {
        let progress_events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = Arc::clone(&progress_events);

        let temp = tempfile::tempdir().unwrap();
        let capability = HostScanRoot::open(temp.path()).unwrap();
        let task =
            ScanTask::new(capability, vec![]).with_progress_callback(Box::new(move |event| {
                events_clone.lock().unwrap().push(event);
            }));

        let _ = task.run();

        let events = progress_events.lock().unwrap();
        assert!(!events.is_empty());
    }

    #[test]
    fn scan_task_cancel_during_run() {
        let temp = tempfile::tempdir().unwrap();
        let capability = HostScanRoot::open(temp.path()).unwrap();
        let task = ScanTask::new(capability, vec![PathBuf::from("missing")]);
        let handle = task.cancel_handle();

        // Cancel before running
        handle.cancel();

        let result = task.run();
        assert!(result.is_err());
    }
}
