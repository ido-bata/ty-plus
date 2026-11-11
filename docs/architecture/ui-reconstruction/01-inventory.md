# 01 Inventory

## Current UI State

The repository already contains the intended React shell under
`src/management/`. The legacy UI under `src/js` is compatibility-only — do not
extend it.

Active build scripts in `package.json` point development toward
`src/management/`, while `cep.config.ts` still declares panel and
modeless dialog entries whose built paths are CEP artifact paths
(`./panel/index.html`, `./dialog/index.html`). The reconstruction must preserve
those artifact paths while sourcing the implementation from React.

## Reusable Foundations

Keep and reuse these modules:

| Area | Source | Keep because |
| --- | --- | --- |
| CEP shell app | `src/management/` | React panels, dialogs, contexts, host adapters, workspace runtime |
| Tailwind shell styles | `src/management/style/` | Tokenized CSS entry used by `build:cep:styles` |
| Domain contracts | `src/shared/contracts/` | Workspace, preset, platform, and shell message contracts |
| Core services | `src/management/` | Storage, execution, cloud, media, file, and surface services |
| Base UI | `src/shared/components/` | Reusable primitive controls |
| Widget registry | `src/function/widget/system/` | Widget type registry and shared widget metadata |
| Host bridge | `src/management/ae/` | After Effects command execution |
| Media surface | `src/management/media-surface/` | External media bridge surface |

**Note:** `src/media-surface/` as a physical path is legacy. Current authority is `src/{function,management,shared}` per `../repository/source-ownership.md`.

## Legacy Areas To Replace

`src/js` currently includes these deletion blockers:

| Legacy area | File count observed | Replacement owner |
| --- | ---: | --- |
| `dialog` | 4 | `src/management/` (dialog surfaces) |
| `infra` | 45 | `src/management/ae/`, `src/management/storage/` |
| `lib` | 42 | `src/management/`, `src/shared/` |
| `main` | 4 | `src/management/` (panel surfaces) |
| `monitor` | 2 | remove or recreate as a React diagnostic surface |
| `panel*` | 14 total | `src/management/` (panel surfaces) |
| `presets` | 2 | `src/function/preset/` |
| `quick`, `tools` | 4 total | command widgets or preset dialogs |
| `system` | 56 | split into `src/management/` and `src/function/` |
| `ui` | 97 | React components in `src/function/` and `src/shared/` |

**Note:** `src/cep-shell/`, `src/packages/`, `src/media-surface/` are legacy physical locations. Current authority is `src/{function,management,shared}` per `../repository/source-ownership.md`.

## Legacy Areas To Replace

## Existing React Anchors

Use these files as the behavioral anchors during reconstruction:

- `src/management/` (App, PanelRoot, DialogRoot): onboarding gate, provider stack, dialog router.
- `src/management/workspace/`: workspace model, layout, storage, runtime, and event helpers.
- `src/function/widget/`: React widget renderers.
- `src/management/ae/cep/`: CEP-specific host transport.

## Risk Register

- `WorkspacePanel.tsx` is too large and mixes state, event delegation, host
  execution, status UI, control UI, and widget rendering. Split by feature
  before expanding behavior.
- Some Vite aliases may point to `packages/...` without the `src/` prefix. Verify and normalize them during the build slice. **legacy — verify**
- Existing docs mention paths that may have moved. Use source code as truth
  when docs conflict.
- `cep.config.ts` currently keeps only `panel1`, `dialog`, `dialog-preset-add`,
  and `dialog-preset-edit` active. Other surfaces are frozen and need explicit
  revival decisions.

