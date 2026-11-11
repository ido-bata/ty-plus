Feature: Settings and dialog

  In-panel settings dialog: open, edit a value, persist, close.  The
  dialog state and the persisted setting MUST be in sync after the
  dialog closes.

  Background:
    Given an onboarding-completed panel
    And the persisted settings store is empty

  Rule: the settings dialog persists edited values to the settings store

    Scenario: SCN-SETTINGS-01 — settings dialog round-trip
      Given the persisted settings store has no "autoVerify" key
      When the user opens the settings dialog
      Then the settings dialog is rendered and "autoVerify" defaults to "false"
      When the user toggles "autoVerify" to "true"
      Then the settings dialog preview shows "autoVerify" as "true"
      When the user clicks "Save" and closes the dialog
      Then storage:settings contains "autoVerify" equal to "true"
      And the dialog is no longer rendered
