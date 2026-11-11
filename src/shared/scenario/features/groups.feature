Feature: Groups

  Group / ungroup of presets.  Groups are first-class objects in the
  catalog and are persisted as a group node in the catalog JSON.  Group
  delete is destructive (it removes the group AND the members IF the
  group is owned by the user; library / builtin groups remain).

  Background:
    Given an onboarding-completed panel
    And the catalog contains two local presets "PresetA" and "PresetB"

  Rule: groups can be created, renamed, and ungrouped

    Scenario: SCN-GROUPS-01 — group creation and ungroup
      Given the catalog contains "PresetA" and "PresetB"
      When the user selects "PresetA" and "PresetB" and clicks "Group"
      Then the catalog renders a new group "Group-1" containing both presets
      And storage:catalog-list contains the group node
      When the user renames "Group-1" to "My Group"
      Then the catalog renders "My Group" and storage:catalog-list reflects the rename
      When the user ungroups "My Group"
      Then "My Group" is removed and "PresetA" and "PresetB" are restored to the catalog root
