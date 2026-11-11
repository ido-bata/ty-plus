# Storage topology audit

> Scope: `FND-001` / `FND-006` preparation and `STO-001` input. This is a
> review artifact, not canonical architecture. Existing source and data shapes
> were read-only during this audit.

## Conclusion

The target can use one visible managed application tree per AE session, with
only four persistent exceptions: installer-owned binaries, a user-level runtime
control root, OS credential storage, and user-selected export destinations.
OS temp is not a storage tier. It is allowed only for bytes whose disappearance
cannot change product state or prevent a requested operation from completing.

The current implementation is not ready for `FND-006` completion. In
particular, `ty-plus-init.json` is written below the AE installation folder,
path authority is duplicated, and several live files are absent from the
canonical tree. The decisions below are ready to integrate; the final section
lists the remaining values that still need explicit ratification.

## Target root resolution

| Root | Source and target rule | Sharing / lifetime | Owner | Tasks |
| --- | --- | --- | --- | --- |
| Extension root | CEP supplies the running extension root. Never discover it by scanning. | Per installed extension build. | installer / transport | `FND-006`, `PKG-003` |
| Runtime binaries | Resolve only from the signed package manifest relative to extension root: `bin/Win/ty-plus-runtime.exe`, `bin/Mac/ty-plus-runtime`; elevated worker is adjacent and manifest-addressed. | Updated atomically with the extension; never self-updated or copied into managed storage. | installer | `FND-006`, `PKG-002`–`PKG-007` |
| Application control root | Proposed fixed locations: Windows `%LOCALAPPDATA%/TyPlus/runtime-control/`; macOS `~/Library/Application Support/TyPlus/runtime-control/`. The resolver is implemented as adjacent `windows.rs` / `macos.rs`; UI exposes “Open runtime folder”. | One per OS user, independent of AE and managed roots. Contains only endpoint discovery, process identity, protocol/build identity, and lock material. | Rust runtime lifecycle | `FND-006`, `IPC-003`–`IPC-006` |
| Session `appRoot` | Opaque absolute path returned by ExtendScript from the running AE instance. Rust does not discover, repair, or compare AE versions. | Immutable per connected host session; may differ between simultaneous AE instances. | ExtendScript host context | `FND-004`, `HFS-001`–`HFS-004` |
| Session default support root | Opaque writable support root returned in the same ExtendScript host context. No registry, CEP `userData`, environment, hardcoded OS path, or AE-version branch may substitute for it. | Immutable per host session. The path may naturally differ by installed AE application, but no code branches on version. | ExtendScript host context | `FND-006`, `HFS-001`–`HFS-004` |
| Per-session locator | Move the locator out of `appRoot` to `<session-support-root>/ty-plus-init.json`. It selects either the default root or an explicit shared browse root. | One locator per AE support root. It is the bootstrap pointer and is not copied into a shared root. | Rust storage path resolver | `FND-006`, `STO-003`, `STO-020` |
| Default managed root | `<session-support-root>/ty-plus/`. | Used unless the locator explicitly selects a shared browse root. | Rust storage | `FND-006`, `STO-003` |
| Explicit shared managed root | `<user-selected-browse-root>/ty-plus/`. Every participating session keeps its own locator pointing here. Selecting the same path is the only way sessions share data. | Requests are serialized by the single runtime; last write is runtime commit-acceptance order, never client wall-clock order. Detach does not silently move or delete data. | Rust storage; React owns confirmation UI | `FND-006`, `STO-003`, `STO-007`, `STO-020` |

The locator move is deliberate: the current
`src/management/setting/onboarding/initialization.ts` resolves the AE install
folder using `Folder.appPackage` and writes the locator there, sometimes through
elevation. That contradicts the new writable support-root premise and preserves
an unnecessary UAC path. `appRoot` remains authoritative for AE installation
paths, but it must not be the storage bootstrap location.

## Persistent and runtime item map

All paths below are relative to the selected managed root unless stated
otherwise. The Rust manifest introduced by `STO-004` must enumerate every
persistent item and path template; reset and migration must not search for
unregistered remnants.

| Item | Target location / lifecycle | Reset and migration rule | Source trace | Tasks |
| --- | --- | --- | --- | --- |
| Storage manifest and format version | `settings/system.json`; persistent. This is the reset inventory, format version, and migration record authority. | Rust owns migration, backup, commit, and recovery. Installer never edits user data. | A `systemJson` target exists in `docs/architecture/data/workspace-path-contracts.md` and `src/management/storage/contract.ts`, but no canonical writer exists. | `FND-006`, `STO-004`, `STO-020`, `STO-023` |
| Application settings | `settings/app.json` | Included in settings reset and all-root migration. | Definition: `src/management/setting/models/settings.ts`; persistence adapter: `src/management/storage/settings-files-store.ts`; UI consumers: `src/management/setting/context/`, `src/management/setting/dialog/`. | `STO-001`, `STO-009`, `STO-015` |
| Path selections | `settings/paths.json`; this stores product path preferences, not the bootstrap pointer. | Shared-root detach requires an explicit copy / keep / start-empty choice; never implicit deletion. | Current parsing/merge is spread across `src/management/setting/persistence/merge-settings-paths.ts`, `persist-settings-paths.ts`, and onboarding initialization. | `STO-001`, `STO-015`, `STO-020` |
| UI preferences | `settings/ui.json` | Settings reset only. | Definition: `src/management/setting/models/workspace-ui-settings.ts`; consumers: settings context/dialog and `src/management/i18n/preference/storage.ts`. | `STO-015`, `STO-016` |
| Control-panel / panel chrome | `panels/panel-N.json`; remove the competing `settings/control-panel.json` writer after migration. | Per-panel reset or full reset. | Definition and reader/writer: `src/management/panel/persistence/chrome-store.ts`; consumer adapter: `src/management/workspace/hooks/persistence.ts`. | `STO-001`, `STO-018` |
| Workspace layout records | `workspaces/workspace-N.json` | Per-workspace or full reset; atomic revisioned writes. | Definitions are reached through `docs/architecture/data/workspace-records/workspace/layout.md`; primary implementation is `src/management/workspace/layout/` and current persistence is `src/management/storage/workspace/layout-store.ts`. | `STO-012`, `STO-014` |
| Workspace backgrounds | `workspaces/background/background-N.json` | Per-workspace or full reset. | Definition: `src/management/workspace/background/contract.ts`; storage consumer: `src/management/storage/workspace/layout-store.ts`. | `STO-001`, `STO-014` |
| Named workspace snapshots | `workspaces/history/snapshots.json`; persistent. | Explicit history clear or full reset; migration reads old settings location once, then removes fallback. | Definition: `WorkspaceSnapshot` in `src/management/workspace/persistence/store.ts`; consumer: `src/management/workspace/undo/history.ts`; adapter: `src/management/storage/snapshot-store.ts`. Current fixed maximum is 10. | `STO-011`, `STO-021` |
| Operation / undo history | `workspaces/history/operations/<panel-id>.json`; persistent only up to configured count. Move it out of `cache/layout-undo/`. | `0` disables disk recovery, explicit history clear deletes it, full reset includes it. Trimming occurs in the same commit as append. | Definition/math: `src/management/workspace/undo/cache-stack.ts`; producer: `history.ts`; current adapter: `layout-undo-cache.ts`. Current fixed maximum is 30 and writes are fire-and-forget. | `STO-004`, `STO-021`, `STO-022` |
| Preset catalog | `presets/presets.json` | Catalog reset or full reset; shape is not changed during cutover. | Definition: `src/management/preset/contract.ts`; consumers are linked from `docs/architecture/data/workspace-records/preset/`. | `STO-009`, `STO-012` |
| Group catalog | `groups/groups.json` | Catalog reset or full reset. | Definition/consumers are linked from `docs/architecture/data/workspace-records/group/`; current catalog adapters live under `src/management/catalog/` and `src/management/preset/`. | `STO-009`, `STO-012` |
| Widget records | `widgets/widgets.json` | Workspace/catalog reset or full reset. | Definition: `src/management/widget/persistence/records-file.ts`; record consumers: `src/management/widget/record/`; widget type authority: `src/function/widget/contract.ts`. | `STO-012`, `STO-013` |
| Widget state | `widgets/state/<registered-name>.json` | Per-widget-state reset or full reset. Arbitrary names are not an IPC path primitive. | Definitions/readers/writers: `src/management/storage/widget-state-store.ts`; consumers under `src/function/widget/`. | `STO-013` |
| Workspace assets | `assets/workspace/{presets,scripts,footage,backgrounds,meta}/` | Asset/category reset or full reset; relocation uses manifest inventory. `footage` export exclusion remains a use-case rule. | Catalog definition: `src/management/preset/contract.ts`; operation consumers: `src/function/preset/`; current file service contract: `src/management/storage/contract.ts`. | `STO-004`, `STO-008`, `STO-020` |
| Persistent online caches | `cache/{notifications.json,remote-presets.json,public-links.json}` | Explicit cache clear or full reset. Offline-usable data is not removed merely for age; any bounded remote cache policy must be separately declared. | Definitions/adapters: `src/management/storage/read/cache-store.ts` and `write/cache-store.ts`; consumers include online notification and public-link modules. | `STO-010`, `NET-008` |
| Persistent search/index cache | `cache/candidates.json` plus `cache/candidates/<chunk-id>.json` | Kept across restart and offline use until explicit user deletion or full reset. Rebuild commits a new manifest last; orphan chunks are collected only after a successful commit. | Definition and codec: `src/management/storage/candidates-cache/candidates.ts`; runtime consumer: `candidates-cache/runtime.ts`; paths: `persistence/paths.ts`. | `STO-004`, `STO-010`, `NET-008` |
| Clipboard persistence | `widgets/state/easing-clipboard.json` (or another registered managed path chosen in `STO-017`); never a caller-supplied arbitrary path. | Explicit clipboard clear or full reset. | Definition: `src/management/storage/clipboard-types.ts`; adapter: `clipboard-store.ts`; consumer: easing widget. Current path is returned by ExtendScript as `Folder.userData/Aescripts/TyPlus/easing-clipboard.json`. | `STO-017`, `STO-022` |
| Logs | `logs/ty-plus.log` with bounded rotation | Diagnostic reset or full reset; migration need not preserve expired rotations. | Current path helpers: `src/management/storage/file.ts` and `src/management/workspace/contracts/paths.ts`; no single complete writer/retention authority found. | `FND-006`, `STO-004`, `STO-020` |
| Diagnostic bundle | User-selected export destination only. Runtime may construct it in a same-destination transaction file. | No retained duplicate after success; failed transaction is recovered/removed by transaction rules. | Planned operation only. | `FND-006`, `STO-005` |
| Non-secret license state | `settings/license.json`, if the licensing state machine requires durable non-secret timestamps/status. It must be manifest-registered. | Deactivation/reset can clear it without deleting local product data. | Current types: `src/management/online/licensing/types.ts`; current storage is process memory only. | `FND-006`, `LIC-002`, `LIC-004`, `LIC-010` |
| Refresh credential / activation secret | Outside managed root. Credential key recommendation: service/target `app.ty-plus/aescripts`, account keyed by provider account or installation ID. Windows Credential Manager and macOS Keychain implementations remain adjacent. | Cleared only by deactivation, credential repair, or explicit full credential reset; managed-root reset must state whether credentials are retained. Never copied during root relocation. | Current `src/management/online/licensing/storage.ts` is memory-only; validator is its consumer. | `FND-006`, `FND-007`, `LIC-003`, `LIC-009`, `LIC-010` |
| Runtime discovery / lock / endpoint | Application control root only; no user data or request payloads. | Runtime repair may clear stale entries after verifying process identity. Managed-root reset does not touch it. | New runtime lifecycle source. | `FND-006`, `IPC-003`–`IPC-006` |
| Surface handoff | Runtime in-memory request/event keyed by client and target surface; no persistent file. | Lost runtime means the operation fails explicitly and may be retried by the user; it is never recovered as product state. | Current preset handoff: `src/management/preset/tool-handoff-file.ts` plus duplicate watcher logic in `src/management/dialog/routes.tsx`. Current background root handoff: `src/management/workspace/background/dialog-root-handoff.ts`. | Broaden `STO-019` to both handoffs, or add a sibling task before `STO-022`. |
| Transaction files | In the destination directory, named `.<destination-name>.typlus-txn-<request-id>`; optional recovery backup is adjacent and manifest/journal referenced. Never create a permanent `temp/` directory. | Flush, validate, atomic replace, then immediate cleanup. Startup recovery prefers a valid committed destination and removes/recovers only recognized transaction names. | New Rust commit engine. Current JSON writer has no unified transaction authority. | `STO-005`, `STO-007`, `STO-023` |
| Disposable cache | Only a process-scoped child of the OS-provided temp directory. It may contain derived bytes that can be recreated with no user-visible state loss. | Remove on success/cancel; best-effort stale cleanup by product prefix. No manifest, locator, IPC discovery, download commit authority, handoff, search index, or transaction recovery may refer to it. | Current background dialog handoff in OS temp violates this rule. | `FND-006`, `STO-019`, `STO-022` |

Downloads targeting managed storage should stream to a same-directory
transaction file, not OS temp. This avoids cross-volume replacement and makes
download verification plus asset commit one recoverable operation.

## Reset, relocation, and version ownership

- React owns scope selection, dry-run presentation, confirmation, and progress.
- Rust storage owns inventory, copy, validation, transaction, rollback, deletion,
  and the final result. ExtendScript and CEP Node do not participate.
- Reset scopes must be manifest-derived: settings, one workspace, history,
  persistent caches, assets/catalogs, logs/diagnostics, or full managed root.
- Credential reset and runtime-control repair are explicit separate actions;
  neither is silently included in managed-root reset.
- Relocation copies to a new root, validates the complete manifest and hashes,
  commits the per-session locator last, then offers source deletion. Cancellation
  before locator commit leaves the old root authoritative.
- Shared-root detach requires a user choice (keep shared, copy to default, or
  initialize empty). It never deletes the shared root.
- Data migration is owned by the installed Rust runtime. It reads format version,
  creates an adjacent recoverable backup/transaction, validates, commits, records
  the migration, and only then serves writes. The installer updates binaries but
  does not mutate user data.
- Last-write-wins means runtime acceptance order for local sessions. The write
  response returns the committed revision; no client silently retries a stale
  non-idempotent request.

## Current authority and drift to resolve in `STO-001`

1. `src/management/storage/persistence/paths.ts` is documented as the single
   registry, but `src/management/storage/file.ts` and
   `src/management/workspace/contracts/paths.ts` independently construct paths.
   Panel chrome, layout undo, handoff, clipboard, styles, and legacy reads bypass
   `PATHS`.
2. Managed-root resolution has three competing sources:
   `storage/persistence/managed-root.ts` trusts the install-folder locator;
   `setting/persistence/ty-plus-managed-root.ts` also reads settings and probes
   Node `fs`; `workspace/support-root.ts` derives from CEP host paths.
3. `docs/architecture/storage/workspace-tree.md` omits `panels/`,
   `cache/public-links.json`, candidate chunks, layout undo, and the manifest.
   It contains `presets/assets/`, while `preset-assets.md` declares
   `assets/workspace/`.
4. `docs/architecture/data/local-storage-contracts.md` places backgrounds under
   assets, while source and the canonical workspace tree use
   `workspaces/background/`. `workspace-path-contracts.md` also spells workspace
   style paths differently from the implementation.
5. `docs/architecture/storage/ownership-map.md` says `core.supportRoot` belongs
   to `settings/paths.json`; the current `Settings` definition and consumers read
   `core.paths.supportRoot` from app settings and locator fallbacks.
6. `docs/architecture/storage-policy.md` is outside the indexed storage directory
   and contains stale paths/violation claims. It must be reconciled or removed
   from canonical architecture during `FND-008`, not treated as a second policy.
7. `src/management/workspace/undo/history.ts` uses fixed limits (30 undo entries,
   10 named snapshots), clears the disk undo cache at startup, and saves undo
   state fire-and-forget. This conflicts with observable Rust commits and the new
   configurable persistent-history requirement.
8. `src/management/workspace/background/dialog-root-handoff.ts` stores a required
   support-root handoff in OS temp. `STO-019` currently names only preset handoff,
   so its scope or the ledger must be updated before the storage cleanup gate.

## Concrete values requiring supervisor ratification

These are implementation-ready recommendations, but are not yet user-approved
product constants:

| Value | Recommendation | Why / task |
| --- | --- | --- |
| Persistent operation-history count | default `100`, user range `0..500`, hard maximum `500`; `0` disables disk recovery but not the in-memory undo needed by the active surface. | Replaces fixed `30`; ratify in `FND-006`, implement/test in `STO-021`. |
| Named snapshot maximum | preserve default `10`, configurable `1..100`, hard maximum `100`; never trim silently without surfacing the limit. | Current behavior is 10; ratify in `FND-006`, implement in `STO-011` / `STO-021`. |
| Runtime control-root product spelling | `TyPlus/runtime-control` as above, with stable product ID `app.ty-plus` inside metadata. | Must match installer and runtime exactly; `FND-006` / `IPC-003`. |
| Non-secret license-state path | `settings/license.json`. | Needed only if `LIC-002` proves durable state is required; secret remains in credential store. |
| Log rotation / diagnostic retention | No source-backed value exists. Choose maximum files, bytes per file, and diagnostic bundle retention before `FND-006` can close. | Required by architecture section 22 and `STO-004`. |
| Default support-root API | The plan says ExtendScript returns it, but current source exposes no single authoritative implementation; `Folder.appPackage`, CEP `hostApplication`, CEP `userData`, and `Folder.userData` are all used for different purposes. Name and test the exact ExtendScript resolver before `FND-006` completion. | Blocking detail for `HFS-001` and `STO-003`; do not substitute discovery. |
| Full-reset credential behavior | Recommend retaining credentials by default and offering a separate checked “deactivate and remove credential” action. | Prevents an ordinary data reset from unexpectedly consuming activation/device state; ratify in `FND-006` / `FND-007`. |

`FND-006` should not be marked done until the last table is either accepted or
replaced with explicit values, the locator move is confirmed, and `STO-019`
covers every required handoff file.
