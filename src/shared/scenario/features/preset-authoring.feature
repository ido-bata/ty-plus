Feature: Preset authoring under protected roots

  Authoring a preset asset into the protected AE Support Files root.
  The normal native write raises a permission error, the authoring
  orchestration escalates once to the privileged write adapter, and the
  asset is verified by read-back before the catalog record is
  committed. A dismissed elevation prompt must leave no catalog or
  workspace record behind.

  Background:
    Given an onboarding-completed panel
    And the local catalog is empty

  Rule: a protected-root authoring save escalates once and commits only after read-back verification

    Scenario: SCN-AUTHOR-01 — preset authoring under protected AE Support Files
      Given an empty catalog and an authoring target under the AE Support Files preset root
      When the user creates a local preset named "AuthoredPreset" and saves it into the protected root
      Then the save escalates to the privileged write after the permission failure and the asset is verified by read-back
      And the catalog row "AuthoredPreset" is present only after the read-back verification
      When the user deletes "AuthoredPreset"
      Then the catalog list does not contain "AuthoredPreset" and the asset file is removed
