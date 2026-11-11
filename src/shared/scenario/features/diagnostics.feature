Feature: Diagnostics

  Diagnostics capture the panel-side and host-side evidence that a
  runner or a developer needs to triage a failure: log-bus tail,
  persisted-state dump, computed-style snapshot, and screenshot.  The
  capture MUST be deterministic and MUST not require the user to
  reproduce the failure.

  Background:
    Given an onboarding-completed panel
    And the diagnostics buffer is empty

  Rule: diagnostics capture produces a verifiable bundle of evidence

    Scenario: SCN-DIAGNOSTICS-01 — diagnostics capture bundle
      Given the log bus has at least one info entry and storage:diagnostics is empty
      When the user triggers diagnostics capture from the debug menu
      Then the diagnostics capture step records the current log-bus tail into the bundle
      And the diagnostics capture step records the persisted-state dump into the bundle
      And the diagnostics capture step records a computed-style snapshot for the home widget into the bundle
      When the user opens the diagnostics viewer
      Then storage:diagnostics contains the bundle and the viewer lists the captured entries
