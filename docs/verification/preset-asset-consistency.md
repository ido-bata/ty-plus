# Issue #130 — preset asset consistency (manual AE verification)

## What the fix guarantees

After applying this branch, the CEP panel guarantees:

1. Every text-based authored asset (Layer / Comp / Code / Easing) is
   written by the single CEP writer
   `src/management/storage/write/authoring-write.ts`: normal native write
   → permission failure only → privileged write → read-back verification.
   ExtendScript no longer owns the byte write (Issue #160).
2. The writer returns a typed result. The failure codes are
   `malformed-path`, `fs-unavailable`, `write-failed`,
   `permission-denied`, `elevation-unavailable`, `elevation-cancelled`,
   `elevation-failed`, and `verification-failed`. A read-back that does
   not match the expected bytes is never reported as success.
3. The React dialogs and the preset-tool controller re-verify the just
   written asset via `verifyPresetAsset` before calling
   `upsertLocalPreset`. A missing asset aborts the persist with a
   `PresetAssetMissingError` and never leaves a catalog / workspace
   record pointing at a non-existent file.
4. The startup path scans every preset's recorded `filePath` and
   surfaces a list of stale ids, so the user is informed instead of
   running an action that AE will reject with
   `Script file not found`.
5. Debug Console log shape:
   `[ty-plus:preset-asset] {event, presetId, type, filePath, ...}`.

## Issue #160 — protected AE Support Files write + UAC (Windows)

Save-root authority is one model for read, execute, and write. The
ExtendScript helper `authorizeSaveDir` classifies the target as
`ae-support`, `user-data`, or `extension` through the same
`classifyAllowedRoot` that `assertAllowedFilePath` uses, so a path that
can be written can also be executed; a path outside every root is
rejected. Root classification never implies escalation — UAC is requested
only after a normal write fails with a permission error.

### Scenario E — protected target, writable (no UAC)

1. Confirm the default save location is
   `<AE Support Files>/Scripts/ty-plus/<type>` (Settings → Paths).
2. Create a Layer, Comp, Code, and Easing preset.
3. **Expected**: all four succeed with no UAC prompt. Debug Console
   shows `[ty-plus:preset-authoring] preset.asset.write` with
   `writer=native`, `elevationRequested=false`,
   `verification=passed`, and the `preset.asset.authoring` outcome line
   with `rootClass=ae-support`.

### Scenario F — protected target, read-only (UAC allow)

1. Install After Effects under a folder the current user cannot write
   (e.g. `C:\Program Files\...`), or strip write permission from
   `<AE Support Files>/Scripts/ty-plus`.
2. Create a preset of each type.
3. **Expected**: a UAC prompt appears exactly once per save; Allow
   completes the save. Debug Console shows
   `writer=elevated-native`, `elevationRequested=true`,
   `elevationResult=requested-granted`.

### Scenario G — UAC cancel leaves no record

1. Repeat Scenario F and dismiss the UAC prompt.
2. **Expected**: the dialog stays open with an explicit "Administrator
   permission was declined" message, and no catalog / workspace record
   is created for that attempt.

### Scenario H — `.ffx` animation preset

1. Create an animation preset and save it through AE's native
   `Save Animation Preset...` dialog.
2. **Expected**: the save-root authorization and the target directory
   creation run before the dialog opens (`writer=host-native-dialog`);
   the detected `.ffx` is re-verified before the record commits.

## Manual AE 2026 (Windows) end-to-end check

Prerequisites:

- After Effects 2026 installed on Windows.
- The branch under review deployed via `bun run host:deploy` so the
  panel bundle is in `%PROGRAMDATA%/Adobe/CEP/extensions/com.ty-plus`.
- The CEP panel is launched (`Edit > Preferences > General > "Enable
  CEP Debugging"` if needed) and reloaded after the build.
- After Effects Debug Console is open from the menu
  (`Window > Extensions > Debug Console`).

### Scenario A — write → execute immediately (script preset)

1. Open the preset authoring dialog for a *script* preset
   (function path: `function/preset/code`).
2. Fill the dialog and save.
3. **Expected**: the dialog closes successfully and Debug Console logs
   `[ty-plus:preset-asset]` with the new preset id, type=`script`, and
   the recorded `filePath`.
4. Click the new preset to execute.
5. **Expected**: AE runs the .jsx / .jsxbin without
   `Script file not found`. Status banner reflects the run.

### Scenario B — apply `.ffx`

1. Open the preset authoring dialog for an *animation preset* (easing
   curve).
2. Fill the dialog and save.
3. **Expected**: dialog closes; Debug Console shows the
   `[ty-plus:preset-asset]` line with type=`preset` and the `.ffx`
   path.
4. Apply the new preset on a layer with at least two keyframes.
5. **Expected**: AE applies the easing via
   `applyAnimationPreset` and the curve interpolation updates
   immediately. No "preset not found" alert.

### Scenario C — write failure rollback

This scenario simulates a write that the disk rejects. The CEP
extension cannot directly inject an AE-level write failure, so we
short-circuit it through the host bundle:

1. Open `Windows > Preferences > Scripting & Expressions` in AE and
   verify the Support Files path. Note the writable location.
2. Open the file the preset authoring dialog just produced (the
   `.jsx` / `.ffx`) in a text editor.
3. Move the file to a sibling folder so the recorded `filePath` no
   longer resolves.
4. Open the preset authoring dialog, edit the preset, save again.
5. **Expected**: the write host call re-creates the file at the
   resolved path and the dialog closes with a successful status.
   If the user instead tries to *run* the preset, Debug Console logs
   `[ty-plus:preset-asset] {event:"preset.asset_missing.startup_scan", ...}`
   and the run affordance is disabled.

### Scenario D — stale catalog record on startup

1. Restart After Effects.
2. With the Debug Console open, watch the panel startup logs.
3. Manually rename one asset file on disk (e.g. move one `.jsx`
   elsewhere) so the catalog `filePath` no longer resolves.
4. **Expected**: Debug Console logs
   `[ty-plus:preset-asset] {event:"preset.asset_missing.startup_scan", presetId, type, filePath}`
   with `source:"startup-scan"`. The panel disables the *run* affordance
   for that preset and surfaces a non-blocking toast / banner.

## Known limits

- AE's "Support Files" folder can be on a network volume on managed
  workstations. The same flows work, but on slow shares the write +
  verify round-trip can take a few seconds. The dialog stays in its
  "Saving" state until the host returns; no progress bar is rendered.
- The startup scan issues host calls sequentially. With a large local
  catalog (≥ 200 records) expect a small startup latency hit.
- Mac ZXP packaging has separate Windows-only artefacts and is
  intentionally out of scope for this fix. Mac dev/install is verified
  only where the build artefact actually runs.

## Acceptance criteria mapping

| Required criterion | Where it is enforced |
| --- | --- |
| (1) Post-create file exists | `writeAuthoredTextAsset` reads the bytes back and requires `exists === true` plus a content match before it returns success, for the normal and the elevated path alike (Issue #160). |
| (2) Immediate execute works | React dialogs re-verify via `assertPresetAssetPresent` before calling `upsertLocalPreset`, so the catalog record is only committed after a successful verification. |
| (3) `.ffx` apply works | `saveAnimationPresetAsset` authorizes the save root and creates the directory (with elevation only on a permission failure), then opens AE's native dialog. The dialog re-verifies the resulting `.ffx` before persisting the record. |
| (4) No catalog record on write failure | `assertPresetAssetPresent` throws; the calling `onSave` aborts via the outer `try / catch` and `setStatus(errorMessage)`. |
| (5) Startup detects missing assets | `scanPresetsForMissingAssets` enumerates stale records. The host's `verifyPresetAsset` is the only source of truth. |
| (6) Debug Console logs preset id / type / path / failure | The write itself logs `[ty-plus:preset-authoring] preset.asset.write` and `... outcome` with `presetKind`, `rootClass`, `path`, `writer`, `firstAttempt`, `elevationRequested`, `elevationResult`, `verification`, `finalErrorCode` (Issue #160); the post-write re-check still logs `[ty-plus:preset-asset] {event, presetId, type, filePath, source}`. |
| (7) Windows AE 2026 E2E in release gate | See Scenarios A–D above. |
| (8) #76 Support Files allow-root in release package | Out of scope here; coordinated with #76 independently. |

## Related regressions covered by tests

| Test file | Coverage |
| --- | --- |
| `src/management/ae/jsx/host-bundle.test.ts` (`describe("preset authoring save-root authority (Issue #160)")`) | AE Support Files authoring targets are accepted, the stale userData-only gate is gone, ExtendScript performs no byte write, and read/execute/write share `classifyAllowedRoot` (including the `Support Files Evil/...` prefix-collision rejection). |
| `src/management/storage/write/authoring-write.test.ts` | Normal write success without elevation; `EACCES` / `EPERM` escalation exactly once; UAC-cancel / unavailable / non-permission failures as typed results; existence and content verification; single write per attempt. |
| `src/management/preset/authoring/write-preset-asset.test.ts` | Per-preset-type wiring, `path-rejected` without any write, elevation-cancelled propagation, and the `.ffx` order (authorize → directory → native dialog). |
| `src/management/preset/__e2e__/create.test.tsx` | A declined elevated write never reaches `upsertLocalPreset`. |
| `src/management/preset/asset-verification.test.ts` | `verifyPresetAsset` falls back to `exists:false` on transport failure; `assertPresetAssetPresent` throws `PresetAssetMissingError` for empty path or missing asset; `scanPresetsForMissingAssets` enumerates stale records in order and skips cloud presets with empty `filePath`. |
