Feature: Catalog and preset CRUD

  Post-onboarding CRUD on the catalog and on individual presets.
  Covers list / add / edit / delete of catalog entries and presets,
  plus the asset-existence assertion that blocks ghost presets.

  Background:
    Given an onboarding-completed panel
    And the local catalog is empty

  Rule: catalog CRUD keeps the catalog widget in sync with persisted state

    Scenario: SCN-CATALOG-01 — catalog CRUD round-trip
      Given an empty catalog and an empty workspace
      When the user adds a catalog entry named "Sample Catalog"
      Then the catalog list contains "Sample Catalog" and storage:catalog-list has the entry
      When the user renames "Sample Catalog" to "Renamed Catalog"
      Then the catalog list contains "Renamed Catalog" and "Sample Catalog" is absent
      When the user deletes "Renamed Catalog"
      Then the catalog list is empty and storage:catalog-list does not contain the entry

  Rule: preset CRUD preserves the asset on disk and refuses to create ghost presets

    Scenario: SCN-PRESET-CRUD-01 — preset CRUD round-trip
      Given an empty catalog and an empty workspace
      When the user creates a local preset named "QuickPreset" with body "app.alert('ok')"
      Then the catalog row "QuickPreset" is rendered and the asset file exists on disk
      When the user edits "QuickPreset" body to "app.alert('updated')"
      Then the catalog row "QuickPreset" body is updated and the asset file content matches
      When the user deletes "QuickPreset"
      Then the catalog list does not contain "QuickPreset" and the asset file is removed
