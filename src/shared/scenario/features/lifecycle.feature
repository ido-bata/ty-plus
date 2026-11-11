Feature: Preset lifecycle

  Preset lifecycle covers the full surface lifecycle: creation, catalog
  registration, workspace placement, within-workspace move, panel
  reload, cross-panel move, and panel restart.  This feature groups
  the happy path and the cross-panel write failure path.

  Background:
    Given a single After Effects panel is launched
    And the local catalog is empty
    And no preset assets exist on disk

  Rule: a freshly-created local preset survives the full lifecycle

    @cross-panel @reload @restart @persists-after-restart
    Scenario: SCN-LIFECYCLE-01 — preset lifecycle happy path
      Given an onboarding-completed panel with an empty local catalog and an empty workspace
      When the user creates a local preset named HappyPathPreset
      Then the preset row appears in the catalog and the local-catalog storage key returns the preset object
      When the user drags HappyPathPreset from the catalog onto workspace tile-A on panel-1
      Then tile-A renders HappyPathPreset and layout:panel-1 contains the placement
      When the user moves HappyPathPreset from tile-A to tile-B within the same workspace
      Then tile-B renders HappyPathPreset and tile-A is empty after the within-workspace move
      When the user reloads panel-1
      Then tile-B still renders HappyPathPreset and the persisted layout equals the pre-reload layout
      When the user performs a cross-panel move to panel-2 tile-X
      Then panel-2 tile-X renders HappyPathPreset and panel-1 has no surface tile referencing the preset
      When the user restarts panel-2
      Then panel-2 tile-X still renders HappyPathPreset post-restart and layout:panel-2 matches the post-move state

  Rule: the local fallback path keeps the lifecycle working when the cloud gateway is unavailable

    @cross-panel @persists-after-restart
    Scenario: SCN-LIFECYCLE-02 — cloud gateway unavailable, lifecycle still completes
      Given an onboarding-completed panel with cloud gateway unavailable
      When the user creates a local preset named OfflinePreset
      Then the preset row appears in the local catalog and the local-catalog storage key returns the preset object
      When the user drags OfflinePreset from the catalog onto workspace tile-A on panel-1
      Then tile-A renders OfflinePreset and layout:panel-1 contains the placement
      When the user moves OfflinePreset from tile-A to tile-B within the same workspace
      Then tile-B renders OfflinePreset and tile-A is empty after the within-workspace move
      When the user reloads panel-1 with cloud still unavailable
      Then tile-B still renders OfflinePreset and the persisted layout equals the pre-reload layout
      When the user performs a cross-panel move to panel-2 tile-X via the local fallback path
      Then panel-2 tile-X renders OfflinePreset and panel-1 has no surface tile referencing the preset
      When the user restarts panel-2 with cloud still unavailable
      Then panel-2 tile-X still renders OfflinePreset post-restart and a local-fallback-completed log is emitted

  Rule: a failed cross-panel write must fail-safe

    @cross-panel
    Scenario: SCN-FAILURE-01 — cross-panel move with target write failure
      Given an onboarding-completed panel with an empty local catalog and an empty workspace
      When the user creates a local preset named FailurePreset
      Then the preset row appears in the catalog and the local-catalog storage key returns the preset object
      When the user drags FailurePreset onto workspace tile-A on panel-1
      Then tile-A renders FailurePreset and layout:panel-1 contains the placement
      When the user performs a cross-panel move to panel-2 tile-X with target.applyMove injected to throw
      Then panel-1 tile-A still renders FailurePreset and panel-2 tile-X is empty
      And a workspace-scoped warn entry is recorded on the log bus
