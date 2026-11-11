# Local Storage Contracts

Contract structure for local file operations under `src/management/storage/`.

## Principle

- Storage contracts are in `src/management/storage/` subdirectories.
- Each domain has its own contract file under `src/management/`.
- Do not accumulate record shapes into `platform.ts`.

## Storage Structure

### Files

| File | Role |
| --- | --- |
| `storage/contract.ts` | Storage operations interface |
| `workspace/background/contract.ts` | Workspace background record |
| `widget/persistence/records-file.ts` | Widget record files |
| `storage/migration.ts` | Migration utilities |

### `index.ts`

`src/management/storage/index.ts` re-exports storage capabilities.

## `WorkspacePaths` Target Shape

`WorkspacePaths` maps to the actual file tree:

| Field | Meaning |
| --- | --- |
| `root` | Managed root |
| `settingsDir` | `settings/` |
| `workspacesDir` | `workspaces/` |
| `presetsDir` | `presets/` |
| `widgetsDir` | `widgets/` |
| `groupsDir` | `groups/` |
| `stylesDir` | `styles/` |
| `workspaceStylesDir` | `styles/workspaces/` |
| `workspaceAssetsDir` | `assets/workspace/` |
| `workspaceBackgroundsDir` | `assets/workspace/backgrounds/` |

## Data Files

| Field | File |
| --- | --- |
| `workspaceNJson` | `workspaces/workspace-[1-5].json` |
| `workspaceNBackgroundJson` | `workspaces/background/background-[1-5].json` |
| `presetRecordsJson` | `presets/presets.json` |
| `widgetRecordsJson` | `widgets/widgets.json` |
| `groupRecordsJson` | `groups/groups.json` |
| `themeCss` | `styles/theme.css` |
| `workspaceNCss` | `styles/workspaces/workspace-[1-5].css` |

## Decisions

- `kind` is not used — `type` is the discriminator
- `detail` is not used — `param` holds type-specific data
- Icon is a common data type, not a separate file
- Style uses CSS files, not localStorage
- Workspace background is separate from layout file
