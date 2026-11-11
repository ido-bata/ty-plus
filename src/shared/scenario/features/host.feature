Feature: Host actions

  Actions that reach from the CEP panel into the After Effects host:
  open settings, list dialog.  Each host action surfaces a measurable
  panel-side artefact (a dialog DOM anchor, a LogBus entry) so the
  oracle can verify completion without needing a Computer Use driver.

  Note on the "settings dialog" terminology: the panel mounts the
  ty-plus CEP Settings dialog (app.ty-plus.dialog-settings)
  as a modeless workspace shell surface, NOT the AE native Settings
  dialog.  AE's scripting API does not expose a handle to the AE
  native dialog, and the panel cannot observe whether AE itself
  rendered it from inside CEP.  All oracles for the settings-dialog
  surface therefore anchor on the panel-rendered dialog's
  `data-settings-sidebar` anchor (panel-state-oracle) rather than a
  synthetic host-state-oracle probe.  The oracle is ELEMENT PRESENCE
  on open and ELEMENT ABSENCE on close — production code MOUNTS /
  UNMOUNTS the dialog rather than toggling a data-state attribute
  (round-5 Blocker A).  The dialog boot is also recorded on the LogBus
  under the `modeless` scope with message
  `workspace shell dialog boot started` so the runner can verify the
  panel-side dispatch without relying on the dialog DOM alone
  (round-7 Blocker 1).

  Background:
    Given an onboarding-completed panel connected to a single After Effects host

  Rule: panel-originated host actions mount workspace shell dialogs through the canonical panel-side dispatch

    Scenario: SCN-HOST-01 — open ty-plus CEP Settings dialog through the panel's workspace shell
      Given the panel is at the post-onboarding home screen
      When the user clicks the host-menu "Settings" item
      Then the panel dispatches a workspace shell dialog boot and mounts the ty-plus CEP Settings dialog
      And the log bus records a modeless entry with message containing "workspace shell dialog boot started"
      When the user closes the ty-plus CEP Settings dialog
      Then the ty-plus CEP Settings dialog is no longer rendered in the DOM
      And the panel returns to the home screen
