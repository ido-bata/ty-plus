Feature: Runtime lifecycle

  The two runtime boundaries the panel shares: the ExtendScript host
  bundle that every surface calls into, and the per-attempt operation
  worker. Both must be attributable from the Debug Console — which host
  bundle action this panel run performed, and which logical job a
  spawned child belongs to — without the act of opening the console
  itself triggering a host probe, a bundle load, or a worker spawn.

  Background:
    Given an onboarding-completed panel connected to a single After Effects host

  Rule: host bundle loading and worker attempts are attributable to one logical job

    Scenario: SCN-RUNTIME-01 — host bundle reuse and worker attempt correlation
      Given an onboarding-completed panel at the post-onboarding home screen
      When the user opens the Debug Console
      Then the Debug Console mounts and lists a host bundle action from this panel run
      When the user opens the Online Preset Library
      Then the operation worker log records the queued attempt
      And the operation worker log records the spawned child for that attempt
