Feature: Boot and onboarding

  First-launch and first-launch-only flows.  Covers panel boot probes,
  SetupRequired widget rendering, and the onboarding path that
  transitions a fresh panel to a post-onboarding panel.

  Background:
    Given a single After Effects panel is launched for the first time
    And the local catalog is empty
    And the persisted onboarding state has not been recorded

  Rule: a fresh panel renders the SetupRequired widget until onboarding completes

    Scenario: SCN-BOOT-01 — first boot renders SetupRequired widget
      Given a freshly-launched panel with no persisted onboarding state
      When the panel finishes boot probes
      Then the SetupRequired widget is rendered and catalog/workspace are hidden
      And the persisted onboarding flag is absent
      When the user clicks the "Set up" button on the SetupRequired widget
      Then the SetupRequired widget disappears and the catalog widget is rendered
      And the persisted onboarding flag is set to "completed"
      When the user reloads the panel
      Then the SetupRequired widget does not reappear after the reload
