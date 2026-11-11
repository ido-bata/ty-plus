# 05 State And Host Contracts

## State Layers

Use explicit state ownership:

| State | Owner | Notes |
| --- | --- | --- |
| React view state | component or hook | Dialog open internals, form edits, active tabs |
| Workspace state | `src/management/workspace/model.ts` and hooks | Widgets, layout, panel id, status, selected widget |
| Persisted workspace files | `src/management/workspace/storage.ts` and core services | Layout, background, settings |
| Cross-surface messages | `@ty-plus/contracts` channels and CEP transport | Panel/dialog synchronization |
| Host results | host executor services | Typed success/error values only |

Do not use DOM attributes as state. `data-ws-action` may stay as an event
delegation bridge during migration, but new feature state must live in React
hooks or services.

## Storage Contract

Persisted data must be structured and versionable:

- Workspace layout: widget layout records, panel id, grid settings.
- Workspace background: separate background payload, not mixed into layout.
- Settings: shell preferences, onboarding completion, theme, directories.
- Presets: local preset repository records and asset references.

Storage readers must normalize missing or legacy fields. Storage writers should
write the newest shape only.

## Dialog Result Contract

Dialogs communicate results through a typed request/result bridge:

1. Parent surface stores request payload.
2. Parent opens modeless dialog surface.
3. Dialog reads request by id.
4. Dialog validates user input.
5. Dialog writes result.
6. Parent consumes result and updates workspace state.

Dialog results must be serializable. Do not pass functions, DOM nodes, React
elements, or class instances.

## Host Execution Contract

UI components never assemble large ExtendScript strings directly. Host behavior
flows through one of these layers:

- `src/management/ae/host-executor.ts`
- `src/management/workspace/ae-scripts.ts` for small vetted scripts
- `@ty-plus/host-ae`
- `@ty-plus/host-scripts`

Every host call returns a typed result:

```ts
type HostCallResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string; code?: string } };
```

UI displays the message, updates status state, and keeps the workspace usable.

## Cross-Surface Contract

All panel, dialog, debug console, and onboarding messages use named channels
from `@ty-plus/contracts`. Surface-specific string literals belong in one
normalization file per feature. Avoid scattering raw event names across
components.

Required channels:

- workspace layout updated
- workspace presets updated
- workspace background updated
- onboarding completed
- theme changed
- dialog request/result ready
- debug logs written

