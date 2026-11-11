Feature: Online and degraded mode

  Online gateway health is observable; degraded mode MUST switch the
  panel to the local fallback path without blocking the user.  The
  degraded indicator is rendered in the cloud-status widget.

  Background:
    Given an onboarding-completed panel
    And the cloud gateway is reachable at boot

  Rule: the panel renders the degraded indicator and switches to local fallback when the gateway fails

    Scenario: SCN-DEGRADED-01 — degraded cloud switches the panel to local fallback
      Given the cloud gateway is reachable and the cloud-status widget shows "online"
      When the cloud gateway becomes unreachable (network probe fails)
      Then the cloud-status widget switches to "degraded"
      And the log bus records a warn entry with scope "online" and message "gateway degraded"
      When the user creates a local preset named "FallbackPreset"
      Then the local-fallback path writes the preset and the catalog row appears
      And no online write is attempted during the fallback
