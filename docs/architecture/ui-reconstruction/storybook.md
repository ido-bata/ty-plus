# Storybook

Storybook 10 + Vite 8 で CEP host (After Effects) を通さず React component
単体を視覚確認する surface。`src/` 配下の component に CSF3 story (`*.stories.tsx`)
を置き、Storybook dev server / static build で個別に render できる。

CEP build とは **完全に分離** した Vite dev server で動くため、CEP cache による
stale UI も発生しない。React 19 + Tailwind v4 + `unplugin-icons` + `vscode-oniguruma`
WASM まで CEP と同一の依存グラフを使うので、CEP panel での見た目と Storybook
preview での見た目は token レベル一致する。

---

## Directory layout

```
.storybook/
├── main.ts          # Vite config: CEP plugin strip + @/ alias + WASM inline
└── preview.ts       # Decorator chain (mirrors PanelRoot.tsx nest order)

src/
├── storybook/
│   ├── Sanity.stories.tsx                    # Smoke test for decorators
│   └── decorators/
│       ├── cep-shim.ts                       # Module-load side-effect: window.__adobe_cep__
│       ├── CepMockDecorator.tsx              # Imports cep-shim
│       ├── CepContextDecorator.tsx           # <CepProvider value={...}>
│       ├── SettingsProviderDecorator.tsx
│       ├── LicenseProviderDecorator.tsx
│       ├── I18nDecorator.tsx                 # initializeI18n(window) once; lng="en"
│       ├── i18n-init-once.ts                 # Module-singleton guard
│       ├── FilesGatewayProviderDecorator.tsx
│       ├── ThemeDecorator.tsx                # applyCepShellTheme(document), no file API
│       └── SurfaceProviderDecorator.tsx      # PanelStateProvider + SelectionProvider
└── **/*.stories.tsx                          # CSF3 stories per component
```

> Note: there is no `.storybook/manager.ts`. Storybook 10 ships `@storybook/manager-api`
> as a bundled chunk under `node_modules/storybook/dist/`, not as a direct
> dependency. The manager chrome theme can be re-introduced later by either
> adding the package to `devDependencies` or using Storybook 10's internal
> API path. Until then, Storybook's default light chrome wraps the dark
> preview — acceptable for design review and CI smoke.

---

## CEP build との分離契約

`.storybook/main.ts:50-65` の `CEP_PLUGIN_NAME_PATTERNS` 配列は `vite.config.ts`
が CEP build で積む plugin 群 (`vite-cep-plugin` の `cep()`, ExtendScript shim,
`file://` redirect 書き換え, `dropConsoleLogInfoPlugin`) を **substring で strip**
する。CEP host が存在しない surface で `vite-cep-plugin` 系が走ると boot が
crash するか、CEP artifact を corrupt するため。

`viteFinal` callback は次の順で処理する (`main.ts:92-122`):

1. `stripCepPlugins(config.plugins)` — CEP plugin を全削除
2. `react()` / `Icons({ compiler: "jsx" })` / `tailwindcss()` を再注入
3. **`inlineOnigurumaWasmPlugin()` を再注入** — `@/management/preset` が
   `vscode-oniguruma/release/onig.wasm` を raw import するため、CEP と同じ
   base64 inlining が必須
4. `@/`, `@esTypes`, `@ui`, `@system`, `@infra` の alias を絶対 path で設定

`config.root` は **設定しない**。Storybook は root を `stories` glob の解決
起点に使うため、root を `src/` にすると glob が二重 prefix される。

### なぜ WASM plugin だけ strip しないか

`vscode-oniguruma` は CEP 専用ではなく、CEP と Storybook 双方で base64
inline が必要。`scripts/utils/vite-plugin-inline-oniguruma-wasm.ts` に
切り出して両方が import する。CEP 側に残る plugin instance は strip しない
(name が strip pattern に含まれていない)。

### glob は dot-prefix directory を match しない

`stories: ["../src/**/*.stories.@(ts|tsx)"]` は `src/.storybook/` を
**match しない** (glob `**` が dot-prefix を skip するため)。そのため
storybook 用 directory は `src/storybook/` (no leading dot) に置く。

---

## Decorator chain (preview.ts)

CEP の `PanelRoot.tsx` の nest 順と一致させる:

```
CepMockDecorator           (window.__adobe_cep__ shim)
└─ CepContextDecorator     (CepProvider)
   └─ SettingsProviderDecorator
      └─ LicenseProviderDecorator
         └─ I18nDecorator (initializeI18n(window), lng="en")
            └─ FilesGatewayProviderDecorator
               └─ ThemeDecorator (applyCepShellTheme, no file API)
                  └─ SurfaceProviderDecorator
                     └─ <Story />
```

### i18n の特殊性

- `i18n-init-once.ts` が module-singleton guard。Storybook preview は
  preview が再評価される経路 (HMR, Fast Refresh) を持つため、`initializeI18n`
  の 2 度呼びは避ける。
- `forceEnglishLocale()` で `saveLocaleAsync` (CEP file API 依存) を bypass
  して `lng: "en"` を強制。`vitest.setup.ts` と一致させる。
- `I18nDecorator` は `useEffect` 内で init を await。Story が render される
  前に `i18n.isInitialized === true && i18n.language === "en"` を保証する。

### ThemeDecorator の特殊性

- `applyCepShellTheme(document)` の **同期 path** を使う。
- `loadCepShellThemeFromCss()` (CEP file API 依存) は **使わない**。
- `--ty-*` design token は `import "../src/management/panel/styles/app.css"`
  で preview に読み込む (relative path — `@/` alias は preview 評価時点で
  まだ wire されていない)。

### CepMockDecorator の特殊性

- `cep-shim.ts` を module-load 副作用として import し、`window.__adobe_cep__`
  を最低限の API (`getHostEnvironment`, `getSystemPath`, `getExtensionID`,
  `dispatchEvent`, `evalScript`) で定義。
- decorator 自体は副作用なし — 既に shim が当たっていれば再評価しない。

---

## Story の書き方

CSF3 (`meta` + `StoryObj`) 必須。各 story は **default export する meta 1 個
と、named export する Story 群** を持つ。

### 2 つの meta pattern

#### Pattern A — `Meta<typeof Component>` (props を controls に出したい時)

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Shared/Controls/Button",
  component: Button,
  args: { variant: "default", uiSize: "md", children: "Click me" },
  argTypes: {
    variant: { control: { type: "select" }, options: [...] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
```

`component` を meta に置くと Story controls に **全 props が露出** する。
callback や ref を見せたくない時は `argTypes: { onClick: { control: false } }`
で個別に hide する。

#### Pattern B — `Meta<Args>` (controls を絞りたい時)

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { FilesystemIconGrid } from "./FilesystemIconGrid";

type Args = {
  entries: readonly FileBrowserEntry[];
  currentDir: string;
  iconTileAspect: "square" | "wide";
};

const meta = {
  title: "DirectoryBrowser/FilesystemIconGrid",
  args: { entries: [...], currentDir: "/preset/root", iconTileAspect: "square" },
  argTypes: {
    iconTileAspect: { control: { type: "inline-radio" }, options: ["square", "wide"] },
  },
  render: (args: Args) => {
    const ref = useRef<HTMLDivElement | null>(null);
    return (
      <FilesystemIconGrid
        {...args}
        siblingSourceEntries={[]}
        iconGridHostRef={ref}
        hintTitle="..."
        onWheel={noop}
        // ... other required props as inline no-ops
      />
    );
  },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;
```

`Meta<Args>` 型は `args` フィールドを `Args` に限定する。callback / ref /
label string などの plumbing は `render` の中に閉じる。Storybook controls
panel には `Args` のみ露出する。

### 原則

- 各 story は `Default` + 2-3 variants を持つ (空 / populated / edge case)。
- English copy 固定。i18n key (`t("...")`) は使わない。
- `appRoot` を取得する path を import しない — CEP host 外では undefined。
- 副作用 import (`service.ts`, `local-preset-store.ts`, etc.) は import せず、
  props 注入で完結させる。

---

## Stories inventory

2026-09-09 時点で **123 stories** が `src/**/*.stories.tsx` に置かれている。

| Wave | Scope | Story count |
| --- | --- | --- |
| Wave 0/1 | scaffold + decorator infra | 0 (Sanity 1 は decorator smoke) |
| Wave 2 | shared (controls/fields/feedback) + directory-browser | 28 |
| Wave 3 | online (catalog/notification) + onboarding | 18 |
| Wave 4.1 | shared storage/surface/debug + misc | 14 (+1 skip) |
| Wave 4.2 | preset surfaces (group/tool-shell/catalog-add/catalog-browser/markdown) | 28 (+3 skip) |
| Wave 4.3 | dialog/setting/widget/background | 30 (+4 partial) |

`bun run ci` の非 Rust パートは全 gate pass (lint / typecheck / storybook build /
boundary / cep-artifacts / es3 / bundle-size / react-doctor baseline / knip /
storage-split)。

### Known stubs / skips

Wave 3-4 で Storybook build が通らないことが確認された component は、
Dialog の surface を模した **structural stub** に降格している。CEP panel 側
の挙動は変更しない (実 component はそのまま)。理由は各 stories ファイルの
header に inline で書いてある。

- `online/catalog/Dialog.stories.tsx` — `@/management/preset` →
  `editor/textmate` → `vscode-oniguruma` WASM の import 経路が Storybook
  preview では resolve できない (Wave 3.1 時点)。inline-oniguruma-wasm
  plugin を再追加した Wave 2 cleanup 後も、Dialog.tsx は `getDataServices()`
  と `useEffect` での catalog sync を発火するため副作用を抑える mock が必要
  で、structural stub を選択。
- `info/preset.stories.tsx` — 同じ textmate WASM 経路 (Wave 4.3)。
- `quick-actions/ActionList.stories.tsx` — 同じ textmate WASM 経路 +
  `canUseCepNodeFileBrowser` が CEP window を inspect (Wave 4.3)。
- `core/easing/Component.stories.tsx`, `core/align/Component.stories.tsx` —
  `useWidgetRuntime` が noop に fallback するため storage 連携は無効
  (Wave 4.3)。
- `workspace/surface/GridTile.stories.tsx` — `Widget` →
  `renderDescriptor` の依存ツリーが Storybook decorator chain に未供給
  (Wave 4.1)。
- `preset/group/{WorkspaceCatalogTileBody,WorkspaceLayer,PanelOverlay}.stories.tsx` —
  `PanelContext` 未供給 (Wave 4.2)。

これらを **real component import** に昇格させるには、副作用 init を切り出す
mockable seam を component 側に用意する必要がある。Stories 側で
`vi.mock("@/...")` する選択肢もあるが、Stories は test fixture ではなく
visual fixture という方針 (CEP build 巻き込み検出器としての位置づけ) と
衝突するため取らない。

---

## Verification gates

各 story 追加後に必ず通す:

```bash
bun run typecheck:main      # Meta<T> 型と component props の不一致を検出
bun run lint                # import order / formatter / biome rules
bun run test -- <dir>       # component 既存の test と衝突しないこと
bunx storybook build        # preview / module resolution が壊れていないこと
```

`bunx storybook build` は `MISSING_EXPORT` や module not found で失敗する。
これらは CEP build では検出できない (CEP では webpack が緩く fallback する)

---

## Verification status (2026-09-10)

User reported `bun run storybook` stuck on "loading forever" right after
`bun install`. Reproduced and fixed.

### Before

- `bun run storybook` printed "Storybook ready!" quickly, but Vite optimizer
  took **5+ minutes** to finish scanning dependencies on first request.
  User-visible: index.json / iframe.html hang / return incomplete modules.
- `iframe.html` immediately threw `SyntaxError: Identifier 'RefreshRuntime'
  has already been declared` because `viteFinal` was appending `react()` on
  top of the framework preset.
- Any story that transitively imports `src/management/ipc/transport.ts`
  (via `node:child_process`) failed with
  `Module "node:child_process" has been externalized for browser
  compatibility`.

### After

- `bun run storybook` reaches "Storybook ready!" in ~0.8s. First request
  serves 200 with the right module graph.
- `bunx storybook build` succeeds in ~12s for all 462 story variants
  (123 unique `.stories.tsx` files). Static output under `storybook-static/`
  contains every story bundle.
- Vite optimizer scoped to `entries: ["./.storybook/preview.ts"]` so it
  does not crawl every story on every startup. Story modules are
  transformed lazily on first navigation, exactly as production does.

### Files changed

- `.storybook/main.ts`:
  - `viteFinal` no longer re-appends `react()` (RefreshRuntime duplicate).
  - Adds aliases for 6 `node:*` builtin patterns → `.storybook/empty-node-module.js`.
  - Adds `optimizeDeps.entries` scoping.
- `.storybook/empty-node-module.js`: inert stand-ins for `node:child_process`,
  `node:events`, `node:fs`, `node:fs/promises`, `node:crypto`, `node:path`.
  Stories that reach this path through decorative imports never actually
  invoke the Node side at render time; the stubs satisfy the import
  resolution.
- `package.json`, `bun.lock`: adds `playwright@^1.63.0` as devDep for e2e.

### E2E verification

The story suite runs through the Vitest browser project
(`bun run test:storybook`, i.e. `--project storybook`); the standalone
`sb-e2e-verify.ts` driver was removed as unused. Playwright's bundled
chromium still needs system libraries this WSL host does not ship:

- `apt-get download libnspr4 libnss3 libasound2t64` into `~/tmp-debs/` and
  extract with `dpkg-deb -x` into `~/chrome-libs/` (or install them with
  sudo / `bunx playwright install-deps`).
- Run with `LD_LIBRARY_PATH=~/chrome-libs/usr/lib/x86_64-linux-gnu` —
  this is exactly what the `test:storybook` scripts already set.

**`bun run test` does not set `LD_LIBRARY_PATH`**, so on a host that only has
the `~/chrome-libs` extraction the Storybook project fails to launch and
`check` / `check:coverage` go red even though every assertion passes. For the
bare command to be green, install the three packages system-wide instead
(`sudo apt-get install -y libnspr4 libnss3 libasound2t64`), or export the
variable in the shell that runs the gate.

### Headless render lifecycle verdict (2026-09-17)

> **Storybook lifecycle is healthy.** The previous 192/464 result was
> caused by the custom capture path bypassing project annotations /
> decorators — not by Storybook itself.

The 78-story A/B below is decisive enough to retire the original
"Storybook 10 + Vite 8 + React 19 + headless Chromium can't render"
hypothesis. It is **not** a general conclusion about Storybook; it is
a statement about *this project's* choice of capture pipeline. Storybook
officially recommends Vitest addon + Playwright + headless Chromium for
browser-mode tests ([storybook.js.org/docs/writing-tests/integrations/vitest-addon][vitest-addon]),
and that path renders every story we tested under headless Chromium.

What was proven:

- The official `@storybook/addon-vitest` path renders **78 / 78 (100%)**
  of the sampled stories under headless Chromium.
- The sample is not just the easy cases. It includes stories whose
  `sb-snapshot-all.ts` PNGs were in the "empty" bucket
  (`BackgroundPreview`, `DownloadProgressIconButton`,
  `PresetLibrarySidePanel`, `BrowserFilterPanel`, `EntryGlyph`,
  `EntryThumb`, `CatalogPresetIconTile`, `SearchField`, `Settings`)
  and stories whose PNGs were "missing" (`Sanity/DecoratorChain`).
  Every one of them renders correctly under the official path.
- Root cause is identified to a **single common-cause failure mode** in
  the manual capture path (see next subsection), not to 256
  independently broken stories.

What was **not** proven yet:

- That all 464 stories render correctly under the official path. The
  78-story A/B sample was deliberately chosen to cover the failure
  modes observed in the 192/464 sweep, but extending it to the full 464
  is the responsibility of the next PR (the capture pipeline below),
  not the diagnostic A/B.

[vitest-addon]: https://storybook.js.org/docs/writing-tests/integrations/vitest-addon

### Why the old `sb-snapshot-all.ts` 192/464 result is misleading

The official path drives Storybook's intended render lifecycle:

```
Storybook / React / Chromium
   │
   │  (setProjectAnnotations / project annotations)
   ▼
preview.ts decorators
   CepMock
   → CepContext
   → Settings
   → License
   → I18n
   → FilesGateway
   → Theme
   → Surface
   │
   ▼
Story
```

The manual `sb-snapshot-all.ts` path entered at the story step and
bypassed everything in between:

```
importFn()
   → currentRender.renderToScreen(...)
   → Story
```

`renderToScreen` only wraps with Storybook's `StorybookRootDecorator`
and the project-annotations *global* decorator (the internal Hz/Vz
layers). It does **not** re-apply the user-defined chain in
`preview.ts`. Components that read from `CepContext`, `Theme`,
`Surface`, `Settings`, `FilesGateway`, or `i18n` therefore:

- do not throw (the providers' absence is silent — `useContext` returns
  the default value, `useTranslation` returns the key, theme tokens
  resolve to PandaCSS fallbacks);
- render to an apparently valid DOM tree, just one without the panel's
  real data flow;
- look like "empty" PNGs because the rendered tree is mostly null
  placeholders or zero-data skeletons.

That single structural bypass explains the 192/256/16 distribution:

- 192 visible — stories that happened not to depend on any of the
  bypassed providers.
- 256 empty — stories that depend on at least one bypassed provider,
  rendering to a placeholder tree.
- 16 missing — stories whose `importFn` or `renderToScreen` call hung
  past the hard timeout because the manual path also bypasses Storybook's
  internal cancellation wiring; a side-effect of the same bypass.

The shape of the 192/256/16 numbers is therefore a property of the
capture pipeline, not of the stories. Treating the 256 "empty" PNGs as
a list of intentional stubs would be wrong; treating the whole sweep
as evidence that Storybook is broken would be wrong; the correct read
is "manual Storybook lifecycle invocation is unsafe because it can
silently omit decorators without throwing".

### Historical status of `sb-snapshot-all.ts`

`scripts/verify/sb-snapshot-all.ts` and `scripts/verify/sb-snapshot-gallery.ts`
are kept as **diagnostic / historical workarounds**, not as the
production capture path. They are intentionally not deleted because
the 192/256/16 result is a useful regression fixture for "manual
Storybook lifecycle invocation can silently omit decorators without
throwing". A future Storybook upgrade that re-introduces a real
preview-load regression would be detected by re-running this script
and observing the breakdown shift.

`bun run snapshot:storybook` continues to be available for that
diagnostic purpose. It is **not** the path to use for image collection
in CI / design review / Storybook gallery use cases.

Pipeline summary (kept verbatim for reference):

1. `bunx storybook build` produces `storybook-static/` (464 entries).
2. `python3 -m http.server 6007 --directory storybook-static` serves
   the static output (bunx serve would rewrite iframe.html query
   strings away).
3. For each entry, playwright loads `iframe.html?id=<id>&viewMode=story`
   in headless Chromium, waits for `__STORYBOOK_PREVIEW__`, reads the
   storyIndex entry, calls `importFn` to resolve the CSF module,
   extracts the unboundStoryFn, and invokes `currentRender.renderToScreen`
   directly. Screenshot to `.tmp/storybook-screenshots/<id>.png`.
4. `bun scripts/verify/sb-snapshot-gallery.ts` rebuilds
   `.tmp/storybook-screenshots/index.html` from the PNGs on disk.

Historical output breakdown (2026-09-17):

| Bucket   | Count | Share | Interpretation                                     |
| -------- | ----: | ----: | -------------------------------------------------- |
| visible  |   192 |  41%  | Stories that did not depend on the bypassed providers |
| empty    |   256 |  55%  | Single common-cause: manual path bypasses preview decorator chain |
| missing  |    16 |   3%  | Stories whose `importFn` or `renderToScreen` call hung past the hard timeout |

### Production capture path direction

The production capture pipeline for "collect PNGs of every Storybook
story under headless Chromium" lives **on top of** the official
Vitest Storybook integration, not as a parallel script that reaches
into `currentRender`:

```
Storybook
   ↓
addon-vitest  ← lifecycle ownership stays here
   ↓
browser project (test:storybook)
   ↓
Playwright   ← already in place via @vitest/browser-playwright
   ↓
page.screenshot()
```

The rationale for keeping lifecycle ownership on the addon side:

- Storybook's internal API (`setProjectAnnotations`,
  `getProjectAnnotations`, `currentRender`, `renderToScreen`) can shift
  shape across minor releases. Re-implementing them in
  `sb-snapshot-all.ts` is what produced the 41% pass rate; it is the
  exact failure mode we want to avoid.
- The Vitest addon restores the same lifecycle a developer sees when
  opening the Storybook UI in headless Chromium. Whatever Storybook
  considers "correct render" is what we capture, by construction.
- The Playwright provider is already a transitive dep of the addon. No
  new browser dependency is needed — `page.screenshot()` runs against
  the same headless Chromium the addon is already launching.

The current scaffolding (added in this PR) sets up exactly this
arrangement:

- `@storybook/addon-vitest` + `@vitest/browser` + `@vitest/browser-playwright`
  in `package.json`.
- `addons: ["@storybook/addon-vitest"]` in `.storybook/main.ts`.
- `vitest.config.ts:projects[storybook]` declaring the browser project
  and pointing at `@storybook/addon-vitest/internal/setup-file-with-project-annotations`
  so `setProjectAnnotations(getProjectAnnotations())` runs before each
  test (this is the line the manual path was missing).
- `bun run test:storybook` script that runs the full storybook project
  in headless Chromium.

What is **not** in this PR (intentionally — separate work):

- The `page.screenshot()` hook itself.
- The `.tmp/storybook-screenshots/` writer + per-story metadata
  emission.
- The gallery rebuilder that consumes the new metadata.

### Next PR — capture mechanism requirements

The capture PR has to satisfy at least these 10 conditions to be
useful as a UI-reconstruction image source. They are written so a
fresh agent can pick them up without re-reading the A/B history.

1. **Enumerate all 464 stories through the official renderer.** Drive
   `bun run test:storybook` over the full `stories` glob from
   `.storybook/main.ts`, not a hand-picked subset. Coverage should be
   machine-checkable (every entry in `storybook-static/index.json`
   produces a PNG).
2. **Capture `console.error` and `pageerror` per story.** Attach the
   collected errors to the per-story metadata so a render failure and
   a screenshot failure are distinguishable in CI output.
3. **Wait for `play()` / loader / async decorator completion before
   screenshotting.** The addon exposes story lifecycle hooks; use
   them. A story whose `play()` mutates state after mount should not
   be screenshotted before that mutation runs.
4. **Pin viewport.** Document and pin the viewport size (currently the
   addon default) so per-pixel diffs across CI runs are not viewport
   artifacts.
5. **Disable or settle animations / transitions.** Either inject a
   global `* { animation: none !important; transition: none !important; }`
   stylesheet in the storybook browser project's setup, or wait for a
   `prefers-reduced-motion`-style signal, so that the same Story
   produces pixel-identical PNGs across runs.
6. **Wait for font load.** `await document.fonts.ready` before
   `page.screenshot()`. Without this, the first render uses a fallback
   font and the second uses the loaded font — pure noise.
7. **Distinguish screenshot failure from render failure.** If
   `page.screenshot()` rejects but the test render passed, that is a
   capture-mechanism bug, not a Story bug. Report it as such so the
   CI signal stays meaningful.
8. **Emit machine-readable per-story metadata.** At minimum:
   `storyId → { pngPath, width, height, byteLength, consoleErrors,
   pageErrors, renderMs, viewportMs, capturedAt }`. JSON sidecar is
   fine; SQLite or NDJSON also fine; do not bury this in stdout.
9. **Determinism across shards.** The capture pipeline must produce
   the same PNG byte-for-byte when sharded. This means deterministic
   ordering of story iteration, no shared mutable state across
   stories, and viewport / fonts / animation flags that survive the
   shard split.
10. **Gallery reads from the metadata.** `sb-snapshot-gallery.ts`
    (or its successor) consumes the per-story metadata, not the PNG
    filenames alone. The empty / missing / ok distinction comes from
    the metadata, not from PNG size heuristics on disk.

Failure to satisfy any of (1)–(7) means the resulting PNGs are not
usable as a UI-reconstruction image source. Failure to satisfy any of
(8)–(10) means the capture is not maintainable — every change to the
pipeline will require hand-checking output.

### Reproducing the 78-story A/B locally

```bash
LD_LIBRARY_PATH=~/chrome-libs/usr/lib/x86_64-linux-gnu \
  bunx vitest --project storybook \
    src/storybook/Sanity.stories.tsx \
    src/shared/component/controls/Button.stories.tsx \
    src/shared/component/controls/SegmentedControl.stories.tsx \
    src/shared/component/feedback/LoadingSpinner.stories.tsx \
    src/shared/component/feedback/ErrorBoundary.stories.tsx \
    src/shared/component/icons/Icon.stories.tsx \
    src/shared/component/layout/ScrollArea.stories.tsx \
    src/shared/component/shell/DialogBody.stories.tsx \
    src/shared/component/fields/Input.stories.tsx \
    src/shared/component/fields/Textarea.stories.tsx \
    src/management/storage/ui/BackgroundPreview.stories.tsx \
    src/management/online/catalog/download/DownloadProgressIconButton.stories.tsx \
    src/management/online/catalog/PresetLibrarySidePanel.stories.tsx \
    src/function/widget/utility/directory-browser/BrowserFilterPanel.stories.tsx \
    src/function/widget/utility/directory-browser/EntryGlyph.stories.tsx \
    src/function/widget/utility/directory-browser/CatalogPresetIconTile.stories.tsx \
    src/function/widget/utility/directory-browser/EntryThumb.stories.tsx \
    src/management/setting/dialog/Settings.stories.tsx
```

(The `LD_LIBRARY_PATH` is the WSL workaround for missing libnspr4 /
libnss3 / libasound2 in the system path — same trick used by
`sb-snapshot-all.ts`.)

---

## なぜ CEP cache を疑わなくていいか

CEP panel は CEP host の file:// origin + Symlinks で cache が効くが、
Storybook は完全に独立した Vite dev server (port 6006) で動く。Storybook
更新時はブラウザの Storybook UI を reload するだけで反映される。**CEP
panel の Reload は Storybook 変更では不要** (CEP build を巻き込んでいない
ため)。

逆も真: CEP panel で UI を変えても Storybook preview には反映されない
(debounce しないため即時反映されるが source は同じ `src/` なので次の
refresh で同期する)。

---

## 関連 docs

- [AGENTS.md](../../../AGENTS.md) — canonical agent contract
- [CLAUDE.md](../../../CLAUDE.md) — Claude 固有の運用詳細
- [index.md](./index.md) — UI 再構築全体のロードマップ
- [02-target-architecture.md](./02-target-architecture.md) — surface 設計
- [04-component-system.md](./04-component-system.md) — component 規約
