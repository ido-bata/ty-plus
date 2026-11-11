# Adobe CEP IME Composition Workaround

> Audience: implementers working on input fields, dialogs, or keyboard handlers.

## Problem

Adobe-CEP on Windows uses an embedded Chromium (CEF) runtime. Since CEP 10,
IME composition (Japanese, Chinese Pinyin, Korean) does not work in
modal/modeless dialogs and emits inconsistent `compositionstart` /
`compositionend` events. This is tracked as
[Adobe-CEP Issue #349](https://github.com/Adobe-CEP/CEP-Resources/issues/349)
and remains open as of CEP 12 (Premiere Pro 25, Dec 2024).

macOS and panel-mode are unaffected. The modeless dialogs that ship with
ty-plus (12 windows registered in `cep.config.ts`) all run on the affected
code path on Windows.

## Workaround

ty-plus guards every global and dialog-level `keydown` listener with a single
helper:

```ts
import { isIMEComposing } from "@/shared/util/keyboard";

if (isIMEComposing(event)) return; // bail out of app-level shortcuts / Enter handlers
```

`isIMEComposing()` returns `true` when `event.isComposing === true` (modern
CEF/Chromium signal) OR when `event.keyCode === 229` (legacy fallback used
by some IMEs that swallow keys before the actual character resolves).

## Where to add the guard

Add the guard at the top of any handler that:

- Runs at `document` / `window` level for shortcuts (Escape, Ctrl+Z, Ctrl+Y, ...).
- Submits, blurs, or activates on `Enter` and sits near a text input.
- Prevents default on any printable key.

Do not add it to local handlers that only mutate the input itself (the input
field already knows it is composing).

## Current call sites (search anchors)

**Management layer (`src/management/`):**

- `src/management/workspace/hooks/keyboard.ts` — global undo/redo/escape/Ctrl+`/Cmd+`
- `src/management/workspace/hook.ts` — duplicate inline handler in the workspace runtime hook
- `src/management/widget/catalog.tsx` — catalog keydown (consolidated to helper)
- `src/management/debug/console/ui/Panel.tsx` — debug console Enter-to-execute (consolidated)
- `src/management/setting/dialog/sections/PathsSection.tsx` — Enter-to-blur in path fields
- `src/management/storage/ui/DirectoryBrowser.tsx` — Enter-to-activate in directory list

**Function layer (`src/function/`):**

- `src/function/widget/core/easing/Component.tsx` — Space-key continuous redraw trigger
- `src/function/widget/utility/quick-actions/ActionList.tsx` — command palette (Enter activates, Escape closes, ArrowUp/Down navigate)
- `src/function/widget/utility/directory-browser/Component.tsx` — five Enter-to-activate sites (path input commit, file browser row, catalog preset row, file system list, file browser list)
- `src/function/onboarding/View.tsx` — Enter-to-finalize in support-root path field

## Out of scope

- Replacing the CEP runtime. Adobe ships CEP with each host app, and the
  minimum version we declare (`6.0` in `cep.config.ts`) is the floor — the
  actual runtime is whatever the installed AE bundles.
- Re-enabling the inlined composition window that CEP 9.4 provided. Adobe has
  no fix in CEP 10/11/12 for this regression.

## Out of scope

- Replacing the CEP runtime. Adobe ships CEP with each host app, and the
  minimum version we declare (`6.0` in `cep.config.ts`) is the floor — the
  actual runtime is whatever the installed AE bundles.
- Re-enabling the inlined composition window that CEP 9.4 provided. Adobe has
  no fix in CEP 10/11/12 for this regression.
