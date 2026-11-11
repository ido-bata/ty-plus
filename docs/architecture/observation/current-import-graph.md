# Current Import Graph Observation

Captured: 2026-05-10
Purpose: Baseline of cross-boundary imports for architecture migration

## Summary

This document records the current import relationships between `shared`, `management`, and `function` directories. These relationships must be refactored to enforce the target architecture rules:
- `shared` must NOT import `management` or `function`
- `management` must NOT import `function` (with limited allowlist)
- `function` UI must NOT import raw CEP/host executor

---

## shared -> management

Files in `src/shared/**` that import from `src/management/**`:

| File | Line | Import |
|------|------|--------|
| `src/shared/i18n/bundled-resources.ts` | 92 | `import type { SettingsCopy } from "../../management/panel/setting"` |
| `src/shared/i18n/config.ts` | 74 | `import type { CepShellLocale } from "../../management/i18n/locale-storage"` |
| `src/shared/i18n/config.ts` | 75 | `import { DEFAULT_CEP_SHELL_LOCALE } from "../../management/i18n/locale-storage"` |
| `src/shared/i18n/config.ts` | 79 | `} from "../../management/i18n/preference/i18n-preference-storage"` |
| `src/shared/contract/index.ts` | 6 | `export * from "../../management/setting/workspace-shell"` |
| `src/shared/style/index.ts` | 9 | `import { DESIGN_TOKENS_DEFAULTS } from "../../management/style/literals/design-tokens-defaults"` |
| `src/shared/style/index.ts` | 15 | `} from "../../management/style/literals/design-tokens-defaults"` |
| `src/shared/style/index.ts` | 17 | `export { CEP_SHELL_THEME_UI_PRESETS } from "../../management/style/literals/theme-presets"` |
| `src/shared/style/index.ts` | 22 | `} from "../../management/style/merge-theme"` |
| `src/shared/context/I18nContext.tsx` | 16 | `import { loadCepShellLocale } from "../../management/i18n/locale-storage"` |
| `src/shared/component/icons/ShellPresetIconField.tsx` | 6 | `import { EmojiPickerStub } from "../../../function/component/EmojiPickerStub"` |
| `src/shared/component/icons/ShellPresetIconField.tsx` | 7 | `import type { SettingsCopy } from "../../../management/panel/setting"` |

---

## shared -> function

Files in `src/shared/**` that import from `src/function/**`:

| File | Line | Import |
|------|------|--------|
| `src/shared/component/index.ts` | 40 | `} from "../../function/component/ShellMarkdownEditor"` |

---

## management -> function

Files in `src/management/**` that import from `src/function/**`:

| File | Line | Import |
|------|------|--------|
| `src/management/workspace/workspace-runtime.ts` | 1 | `import { createAfterEffectsAdapter } from "../../function/commands/dispatch"` |
| `src/management/dialog/DialogRoot.tsx` | 5 | `import { PresetLibraryDialog } from "../../function/online/catalog/OnlineCatalogDialog"` |
| `src/management/dialog/DialogRoot.tsx` | 6 | `import { MessagesDialog } from "../../function/online/notification/NotificationListDialog"` |
| `src/management/dialog/DialogRoot.tsx` | 7 | `import { PresetsDialog } from "../../function/preset/list/PresetListDialog"` |
| `src/management/widget/messaging/messaging-workspace-attach.ts` | (see note) | messaging widgets |
| `src/management/workspace/events.ts` | 4 | `} from "../../function/commands/align"` |
| `src/management/workspace/events.ts` | 5 | `import { isAeAnchorPosition } from "../../function/commands/scripts"` |
| `src/management/workspace/events.ts` | 9 | `} from "../../function/commands/time-align"` |
| `src/management/workspace/hook.ts` | 21 | `} from "../../function/commands/scripts"` |
| `src/management/ae/scripts/index.ts` | 1 | `import { createAfterEffectsHostScriptBridge } from "../../../function/commands/dispatch"` |
| `src/management/ae/jsx/index.ts` | 10 | `} from "../../../function/core/system"` |
| `src/management/ae/jsx/index.ts` | 14 | `} from "../../../function/effects/effects"` |
| `src/management/ae/jsx/index.ts` | 15 | `import { getEffectsCatalog } from "../../../function/effects/effects-catalog"` |
| `src/management/ae/jsx/index.ts` | 20 | `} from "../../../function/footage/filesystem"` |
| `src/management/ae/jsx/index.ts` | 21 | `import { addFootage, importFootage } from "../../../function/footage/footage"` |
| `src/management/ae/jsx/index.ts` | 26 | `} from "../../../function/layer/align"` |
| `src/management/ae/jsx/index.ts` | 27 | `import { getFontBrowserEntries } from "../../../function/text/font-browser"` |
| `src/management/ae/jsx/index.ts` | 31 | `} from "../../../function/text/fonts"` |
| `src/management/ae/jsx/index.ts` | 32 | `import { cleanupLayerNames } from "../../../function/text/naming"` |
| `src/management/ae/jsx/index.ts` | 37 | `} from "../../../function/text/text"` |
| `src/management/ae/jsx/index.ts` | 42 | `} from "../../../function/text/text-layer-ops"` |
| `src/management/ae/jsx/index.ts` | 46 | `} from "../../../function/widget/easing/easing"` |
| `src/management/ae/jsx/index.ts` | 53 | `} from "../../../management/preset/assets/aeft/presets"` |

---

## function -> management

Files in `src/function/**` that import from `src/management/**`:

| File | Line | Import |
|------|------|--------|
| `src/function/effects/effects.ts` | 4 | `} from "../../management/ae/jsx/aeft/core/utils"` |
| `src/function/core/system.ts` | 1 | `import type { AeSystemFolders } from "../../management/ae/jsx/aeft/core/types"` |
| `src/function/core/system.ts` | 10 | `} from "../../management/ae/jsx/aeft/core/utils"` |
| `src/function/core/system.ts` | 11 | `import type { JsxResult } from "../../shared/util/result"` |
| `src/function/footage/filesystem.ts` | 4 | `} from "../../management/ae/jsx/aeft/core/types"` |
| `src/function/footage/filesystem.ts` | 11 | `} from "../../management/ae/jsx/aeft/core/utils"` |
| `src/function/footage/footage.ts` | 5 | `} from "../../management/ae/jsx/aeft/core/utils"` |
| `src/function/layer/align.ts` | 6 | `} from "../../management/ae/jsx/aeft/core/types"` |
| `src/function/layer/align.ts` | 12 | `} from "../../management/ae/jsx/aeft/core/utils"` |
| `src/function/commands/align.ts` | 1 | `import type { AlignTargetId } from "../../management/workspace/state"` |
| `src/function/commands/scripts.ts` | 6 | `import type { WorkspaceCompInfo } from "../../management/workspace/state"` |
| `src/function/effects/effects-catalog.ts` | 1 | `import { createCepHostExecutor } from "../../management/ae/cep/host-executor"` |
| `src/function/widget/shell/shell.tsx` | 8 | `import { useSelectionContextOptional } from "../../../management/workspace/context/SelectionContext"` |
| `src/function/widget/shell/shell.tsx` | 9 | `import { getWidgetRect } from "../../../management/workspace/layout/engine"` |
| `src/function/widget/shell/shell.tsx` | 13 | `} from "../../../management/workspace/state"` |
| `src/function/widget/easing/widget.ts` | 4 | `} from "../../../management/workspace/state"` |
| `src/function/widget/anchor/body.tsx` | 7 | `import { useHostBridge } from "../../../management/ae/cep/hooks/useHostBridge"` |

---

## Raw Host Access in function UI

Files in `src/function/**` that import raw CEP/host executors:

| File | Line | Import |
|------|------|--------|
| `src/function/effects/effects-catalog.ts` | 1 | `import { createCepHostExecutor } from "../../management/ae/cep/host-executor"` |
| `src/function/widget/anchor/body.tsx` | 7 | `import { useHostBridge } from "../../../management/ae/cep/hooks/useHostBridge"` |

---

## Storage CEP Shared Storage Access

Files accessing CEP shared storage (runCepEvalScript):

| File | Line | Import |
|------|------|--------|
| `src/management/storage/workspace-store.ts` | 10 | `import { cepEvalScriptAvailable, runCepEvalScript } from "./cep-shared-storage"` |
| `src/management/storage/workspace-layout-store.ts` | 9 | `import { cepEvalScriptAvailable, runCepEvalScript } from "./cep-shared-storage"` |

---

## Notes

1. The `shared -> management` imports represent shared depending on management - this violates the target architecture where shared should be independent.

2. The `management -> function` imports through `ae/jsx/index.ts` are currently allowlisted for migration purposes.

3. The raw host access in `function` (effects-catalog.ts using host-executor directly) represents a pattern that needs to be migrated to use-case layer.