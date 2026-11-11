# AEP fixture strategy (Issue #147, round-2 gap 2 + round-3 Blocker 4)

The Computer-Use / real-AE runner executes scenarios against a real
After Effects host.  Each scenario depends on a specific `.aep`
project file in a specific state (empty, with prebuilt comps, with a
catalog, etc.) — the runner must materialise the right fixture
before the scenario starts and tear it down after.

This document is the canonical answer to "for SCN-X, what is the
fixture, where does it live, and how is it generated?".

## Round-3 status: fixtures/ is NOT yet checked in

The `fixtures/aep/` tree described in round-2 was never committed.
A real `.aep` is a binary in After Effects' RIBD / ZIP-derived
project format and ranges from tens of KB to MB — none are checked
into the repo as of round-3.

Instead, the runner is expected to materialise each fixture from a
**validation host's fixed `.aep_root` directory**.  The
`FixtureSpec.projectPath` field (round-3 Blocker 4) carries the
host-relative path the runner reads:

```
validation.host.aep_root/<scenario-id>.aep
```

e.g. `validation.host.aep_root/SCN-LIFECYCLE-01.aep`.  Each
scenario's binding entry declares the canonical `projectPath` so
the runner has a deterministic place to look.  The validator's
rule E016 enforces that any scenario declaring
`environment.aeRequired === true` carries a non-empty `projectPath`
on at least one FixtureSpec.

When fixtures are eventually committed, the `projectPath` may switch
to a repo-root-relative path like
`fixtures/aep/SCN-LIFECYCLE-01/project.aep` — but the round-3 cut
keeps them on the validation host.

## Why a doc, not a runner

The fixture materialisation is the runner's responsibility (Issue
#147 defers runner implementation; this PR only declares the
contract).  This document pins the **strategy** — what states we
need, which scenarios depend on which, how the runner loads them —
so the future runner implementation has unambiguous inputs.

## Planned fixture directory layout (future commit)

When the fixtures move into the repo, the layout will be:

```
fixtures/
└── aep/
    ├── README.md                          # how the fixtures were created
    ├── SCN-BOOT-01/                       # per-scenario fixture bundle
    │   ├── project.aep                    # canonical first-boot project
    │   ├── state.json                     # persisted panel state snapshot
    │   └── catalog.json                   # local catalog snapshot
    ├── SCN-CATALOG-01/
    │   ├── project.aep
    │   ├── state.json
    │   └── catalog.json
    ├── ...
    └── shared/
        ├── typography-base.aep            # generic typography project
        └── project-tile-fixtures/         # reusable project tiles
```

Each `SCN-X/` directory carries:

1. **`project.aep`** — the canonical After Effects project file.  The
   runner opens this via `app.openFile()` (ExtendScript host bridge)
   before the scenario starts.
2. **`state.json`** — the persisted panel state (snapshot of the
   `storage:onboarding`, `storage:catalog-list`, `layout:panel-N`
   keys) the scenario expects.  The runner materialises this state
   via the canonical `management/storage` write path.
3. **`catalog.json`** — the local catalog snapshot.  Same idea — the
   runner writes it via the canonical path, not by patching the
   `.aep` file directly.

## Per-scenario fixture requirements

| scenario_id          | fixture states required                                                | round-3 projectPath                                                | runner action at boot                                                  |
|----------------------|------------------------------------------------------------------------|--------------------------------------------------------------------|------------------------------------------------------------------------|
| SCN-BOOT-01          | first-boot, onboarding absent                                          | `validation.host.aep_root/SCN-BOOT-01.aep`                        | open `.aep`, clear `storage:onboarding`                                |
| SCN-CATALOG-01       | post-onboarding, empty catalog                                         | `validation.host.aep_root/SCN-CATALOG-01.aep`                     | open `.aep`, reset `storage:catalog-list` to `[]`                      |
| SCN-PRESET-CRUD-01   | post-onboarding, empty catalog + workspace                             | `validation.host.aep_root/SCN-PRESET-CRUD-01.aep`                 | open `.aep`, clear `preset:QuickPreset` + `asset:QuickPreset`          |
| SCN-GROUPS-01        | post-onboarding, catalog has PresetA + PresetB                         | `validation.host.aep_root/SCN-GROUPS-01.aep`                      | open `.aep`, write `storage:catalog-list` with two preset entries      |
| SCN-HOST-01          | post-onboarding, AE settings dialog dismissible                        | `validation.host.aep_root/SCN-HOST-01.aep`                        | open `.aep`, ensure no AE modal is on screen                           |
| SCN-SETTINGS-01      | post-onboarding, `storage:settings` empty                             | `validation.host.aep_root/SCN-SETTINGS-01.aep`                    | open `.aep`, reset `storage:settings`                                  |
| SCN-DEGRADED-01      | post-onboarding, cloud gateway reachable                               | `validation.host.aep_root/SCN-DEGRADED-01.aep`                    | open `.aep`, ensure `dataServices` resolves to the reachable probe     |
| SCN-DIAGNOSTICS-01   | post-onboarding, log bus has ≥1 info entry, `storage:diagnostics` empty| `validation.host.aep_root/SCN-DIAGNOSTICS-01.aep`                 | open `.aep`, seed a synthetic info entry, clear `storage:diagnostics`  |
| SCN-LIFECYCLE-01     | post-onboarding, empty workspace                                       | `validation.host.aep_root/SCN-LIFECYCLE-01.aep`                   | open `.aep`, ensure layouts `panel-1` / `panel-2` are empty            |
| SCN-LIFECYCLE-02     | post-onboarding, cloud gateway boot returns null                       | `validation.host.aep_root/SCN-LIFECYCLE-02.aep`                   | open `.aep`, inject `getDataServices() === null` boot stub             |
| SCN-FAILURE-01       | post-onboarding, `target.applyMove` injected to throw                  | `validation.host.aep_root/SCN-FAILURE-01.aep`                     | open `.aep`, install the `applyMove` throwing stub                     |

The `projectPath` is also surfaced on `FixtureSpec` (round-3 Blocker
4) so the validator's rule E016 can refuse to load a scenario that
needs the AE host bridge but declares no path.

## Runner load path

```
1. Read bindings[i].fixtures → materialise state.json / catalog.json
   via the canonical management/storage write path.
2. Resolve projectPath against validation.host.aep_root
   (or fixtures/aep/ when the future commit lands).
3. Call host-bridge evalScript: app.openFile(<fixturePath>)
4. Await project open event (CSX event "app.activeProject.changed").
5. Verify the post-conditions declared in the scenario's
   `postconditions` block (e.g. "Catalog is empty of HappyPathPreset").
6. Run the scenario.
7. Run the scenario's `cleanup` block.
8. Close the project without saving (evalScript:
   app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES)).
```

The runner MUST NOT modify the `.aep` file directly — fixtures are
immutable.  All state mutations go through the canonical storage
path so the runner exercises the same write path the production
code does.

## Versioning

Fixtures are pinned to a specific After Effects version.  When AE
updates the project format, regenerate the fixtures by:

1. Open the fixture's `.aep` in the new AE version.
2. Save-as (which preserves the new format).
3. Re-run all scenario rule-check + (future) runner to confirm no
   regression.

The current round-3 fixtures target **After Effects 2026.x**, which
reports its host version as `26.5.x` (round-5 Blocker C).  The
binding carries this as `environment.hostVersionRange: ">=26.5.0 <27.0.0"`
(marketing year `2026` ≠ host version `26.x`; the round-5 rename
moved `aeVersionRange` → `hostVersionRange` and required semver
syntax — validator rule E019).  The upper bound `<27.0.0` is the
round-7 needs-fix contract: AE 2027 reports its host version as
`27.x.y`, so a scenario intended to validate AE 2026 behaviour MUST
use a bounded range — otherwise AE 2027+ would falsely match and the
runner would run the wrong host-version expectations.  Future AE
versions add new `fixtures/aep/SCN-*/` directories under
`fixtures/aep/v2027/` etc., each with its own bounded range
(`">=27.0.0 <28.0.0"` for AE 2027, etc.).

## Hand-crafted vs scripted generation

For round-3 the fixtures live on the validation host
(`validation.host.aep_root/`), hand-crafted — a single engineer
opens AE, sets up the project, saves to
`validation.host.aep_root/SCN-X.aep`.  Scripted generation via
ExtendScript during CI is a future optimisation (it would let the
matrix regenerate when scenarios change); it's out of scope until
the runner exists.
