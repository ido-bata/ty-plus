# Agent Toolchain Selection

**Date:** 2026-08-09
**Status:** Accepted (revised 2026-08-20 — quality gate re-tooling;
revised 2026-08-23 — single-skill-location consolidation;
revised 2026-08-23 — project-local LSP + Context7 MCP wiring)
**Supersedes / revises:** none — initial selection ADR.
**Superseded / revised by:** none yet — subsequent amendments apply
in-place under "revised" status rather than issuing a successor ADR.
Future supersession will be cross-referenced here.

## Context

This ADR records the AI coding agent toolchain for ty-plus. It is the
canonical reference when evaluating future additions, swaps, or
removals. It does **not** record application architecture (see
`docs/architecture/` for that) — only the surface that AI agents
consume: package manager, formatters, linters, type checker,
dependency analysis, test runner, browser automation, Skills,
documentation retrieval, and the policy that ties them together.

The selection was driven by the following fixed premises (already
recorded in `AGENTS.md`):

- After Effects CEP extension. Premiere Pro is out of scope.
- Bun is the package manager.
- React 19 + Tailwind CSS v4 + TypeScript in `src/`.
- Project-local reproducibility: nothing required to run the agent
  environment lives outside the repository.
- Demo phase: no backward-compat shims, no migration fallbacks.

## Decision

### Language and package manager

- **Language:** TypeScript (canonical). `.js` is not authored in `src/`.
- **Runtime / package manager:** Bun, pinned to `1.3.10` via
  `packageManager`. External project script entrypoints run through
  `bun run`. Reproducibility-sensitive package-local pinned CLI tools
  may be launched internally with `bunx --no-install`; floating or
  download-on-run specifications are forbidden. `bun build` is not used
  for project scripts.
- **Text search:** `rg` / `rg --files`.

The choice of Bun is unchanged from the initial setup. We do not
adopt npm / pnpm / Yarn.

### Quality gate

- **Formatter / linter:** Biome (`@biomejs/biome` 2.5.x). No
  alternative formatter or linter is layered on top.
- **Type checker:** `tsc --noEmit` against `tsconfig.json` (main)
  and `tsconfig.extendscript.json` (ExtendScript target).
- **Static / dependency analysis:** Knip with `--no-exit-code`.
  Reports unused files, exports, types, and dependencies. Surface
  is narrowed: only vendor / generated / build-output
  (`src/management/ae/cep/vendor/**`,
  `src/management/ae/jsx/**`,
  `src/management/preset/jsx-presets.ts`) and demo / uninstall
  scripts fall under `ignoreFiles`. Toolchain-internal
  dependencies (`@babel/plugin-transform-*`, `@babel/preset-env`,
  `@babel/preset-typescript`, `@rollup/pluginutils`) live in
  `ignoreDependencies` because they are referenced only through
  build-tool config strings. `ignoreIssues` is **not** used for
  blanket `src/**` / `scripts/**` / `tools/**` / `*.ts`
  relaxation; remaining ~487 signals (48 unused files, 309 unused
  exports, 126 unused exported types, 4 duplicate exports) are
  tracked as a follow-up initiative. The pre-existing
  management→function test-time import in
  `src/management/widget/workspace/TileContent.test.tsx` is
  captured in `tools/check/.baseline.json` and
  `tools/check/.baseline-mgmt-fn.json` so the boundary check
  (`bun run check:boundaries`) reports clean against reality.
  See `docs/architecture/quality/knip.md` for the cleanup
  sequence.
- **Test runner:** Vitest 4.x with `@vitest/coverage-v8`.
  Coverage threshold is **80% across lines, statements, functions,
  and branches**. Coverage is opt-in via `bun run test:coverage`.
- **Project-specific checks** (kept as scripts, not linter rules):
  bundle-size, ES3-compat (ExtendScript), MVP-manifest, design
  tokens, static guardrail, storage split, storage forbidden,
  storage read-write split, workspace class hooks, generated-types,
  CEP build artifacts, i18n locale coverage, i18n locked terms,
  import-boundary. Implemented under `scripts/check/`.
- **React regression scan:** `react-doctor` (npm package
  `react-doctor@0.9.12`, fixed as an exact devDependency), invoked via
  the package-local executable in `bun run doctor`. The scan
  ships a baseline gate: `bun run check:react-doctor` runs
  `scripts/check/check-react-doctor-baseline.ts` against the
  baseline captured in `tools/check/.react-doctor-baseline.json`
  (currently 89/100, 25 warnings, 0 errors) and fails on score or
  count regression. Its capture metadata records the same exact
  package version. The script is wired into `bun run ci` and
  `.github/workflows/ci.yml` as the final quality-gate step.

`bun run ci` is the single entry point that runs the full quality
gate (`lint && build && check:es3 && check:bundle-size && check`).

### Agent Skills

- **Canonical home:** `.claude/skills/` — single project-local
  directory. AGENTS.md and CLAUDE.md treat this as the only
  authoritative placement; any other agent surfaces (Codex, Copilot,
  etc.) read the same Skills through their own thin root adapter
  (CLAUDE.md / `.github/copilot-instructions.md` / Codex skill
  adapters). A historical `.agents/skills/` mirror was removed on
  2026-08-23 because it duplicated the source of truth and drifted
  (notably `react-doctor/SKILL.md` carried a stale version pin and
  a `bunx` invocation that bypassed `--no-install`). No global
  Skill installation is required.
- **Existing Skill:** `react-doctor` — scans React code for
  security, performance, correctness, and architecture regressions
  before committing.
- **No additional Skills** are introduced as boilerplate. New
  Skills are added only when an activation condition is clear and
  the responsibility is not already covered by the canonical
  `AGENTS.md` / `CLAUDE.md` pair.

### Documentation retrieval

- **Primary:** repository `docs/architecture/`, `docs/user-guide/`,
  source code, and `package.json` / lockfile.
- **Installed dependency source:** when a contract is unclear, the
  installed package's source / types / schemas are read directly.
- **External official docs:** Context7 (via the configured MCP
  server) is used for framework / library / SDK docs that are
  not derivable from installed source. The MCP server is wired
  project-locally via `opencode.json` (see
  `### LSP / MCP integration` below). Free tier works without
  an API key; paying users may set `CONTEXT7_API_KEY`.
- **Web search:** used only for non-documentation news.

### LSP / MCP integration

Project-local editor / agent wiring lives at the repository root
in `opencode.json`. The file is **project-local only** — it does
not modify the user's global opencode config at
`~/.config/opencode/opencode.json`, in line with the policy on
hidden state in this ADR.

**Capability sought:** real-time language feedback during agent
sessions (LSP) and authoritative external documentation retrieval
(MCP), without introducing global install or hidden state.

**Selected LSPs (`opencode.json` — `lsp: true`):**

- `typescript` — built-in, activates on `.ts / .tsx / .js / .jsx /
  .mjs / .cjs / .mts / .cts`. Requirement: `typescript` devDependency.
  Already present (pinned 7.0.x). Extends `tsconfig.json` fallback
  for both `src/**` and the test project.
- `rust` — built-in (rust-analyzer wrapper). Requirement: `rust-analyzer`
  on `PATH`. Provided by `rustup` and pinned via
  `rust/rust-toolchain.toml` to channel `1.85.0`. Diagnostics,
  inlay hints, and go-to-definition for the `rust/` workspace.
- `yaml-ls` — built-in, auto-installed by opencode on first use.
  Used for `.github/workflows/*.yml`, `docs/architecture/**/*.md`
  YAML front-matter, and `supabase/config.toml` reads.
- `biome` — **custom** server via `@biomejs/biome lsp-proxy`,
  scoped to `.ts / .tsx / .js / .jsx / .json` (CSS is intentionally
  excluded; the only `.css` file is the Tailwind v4 token entry
  under `src/management/panel/styles/`, where Biome's CSS support
  would not add value over the v4 plugin). The command uses
  `bunx --no-install` to pin to the devDependency version
  (`@biomejs/biome ^2.5.7`) and to comply with this ADR's
  `bun run` / `--no-install` policy.
- All other built-in LSPs (`astro`, `bash`, `clangd`, `csharp`,
  `clojure-lsp`, `dart`, `deno`, `elixir-ls`, `eslint`, `fsharp`,
  `gleam`, `gopls`, `haskell-language-server`, `jdtls`, `julials`,
  `kotlin-ls`, `lua-ls`, `nixd`, `ocaml-lsp`, `oxlint`, `php
  intelephense`, `prisma`, `razor`, `ruby-lsp`, `sourcekit-lsp`,
  `svelte`, `terraform`, `tinymist`, `vue`, `zls`) stay enabled
  by `lsp: true` but auto-skip because their requirement binaries
  are not on `PATH` for this project (`eslint`, `prisma`,
  `terraform`, etc.) or because no matching file extensions
  exist (`astro`, `vue`, `svelte`, etc.).

**Selected MCP server (`opencode.json` — `mcp.context7`):**

- `context7` — remote MCP at `https://mcp.context7.com/mcp`,
  `enabled: true`. Free tier works without an API key; a paid
  user can provide `CONTEXT7_API_KEY` via the `{env:...}`
  substitution (see the upstream opencode docs). Used to fetch
  framework / library / SDK docs when the installed source does
  not carry the answer, per the *Documentation retrieval*
  subsection above. AGENTS.md does not gain any new authority
  from this — it remains the canonical project contract.

**Alternatives considered:**

- **Custom plugin under `.opencode/plugins/`** — deferred. No
  project-specific hook has a clear activation condition that is
  not already covered by `bun run ci` (commit / pre-commit
  gating is explicitly forbidden per `.gitignore` note) or by
  the existing Skill set. New plugins require a follow-up ADR
  with the same shape as this section.
- **VS Code / Cursor `.vscode/settings.json`** — rejected for
  project tracking. The path is in `.gitignore`, so any tracked
  config would be silently filtered. The recommended
  machine-local equivalent is documented in
  `docs/architecture/quality/editor-lsp.md` §VS Code / Cursor.
- **Tailwind CSS IntelliSense** — not added. Opencode does not
  bundle a Tailwind-aware LSP; the Tailwind v4 Vite plugin
  (`@tailwindcss/vite`) covers build-time class detection, and
  the only `.css` source is the Tailwind entry. Adding a custom
  Tailwind LSP server would duplicate the v4 plugin's coverage
  for one file.
- **GitHub MCP** — not added. AGENTS.md only requires local
  validation (`bun run ci`); PR / issue automation is the user's
  personal workflow and would add context tokens per the opencode
  MCP guidance.
- **Playwright MCP** — explicitly rejected per *Browser / UI
  verification* below.

**Project-local reproduction method:** `git pull` (or fresh
clone) is sufficient. opencode resolves `opencode.json` from the
project root on startup; no global file edit, no `npm install -g`
invocation, no `OPENCODE_CONFIG_DIR` override.

**Re-evaluation condition:** revisit when (a) a new agent
language (Go, Python, …) enters the deliverable, (b) Biome
ships a behavior change that breaks the `lsp-proxy` invocation,
or (c) the upstream opencode schema changes how `lsp: true`
interacts with custom server entries.

### Python scripts

- **New Python scripts are not added** under this ADR. New
  automation, generation, migration, validation, build, test, or
  maintenance work goes to TypeScript, JavaScript, shell, or
  PowerShell as appropriate.
- **Existing Python scripts** under `scripts/` (legacy i18n
  tooling) remain in place. They are explicitly tagged as
  legacy in the file header and are not the model for new work.
  Migration is out of scope for this ADR.

### Browser / UI verification

- **Visible UI changes** are verified in the actual CEP host
  (After Effects). The user reloads the panel; Playwright is not
  used inside the CEP surface. Artifacts go to `.tmp/`.

  Static UI inspection before host verification is delegated
  to `react-doctor`. `bun run check:react-doctor` is the gate:
  it diffs the current run against the JSON baseline captured in
  `tools/check/.react-doctor-baseline.json` and fails on score
  or warning-count regression. When the team improves quality,
  update the baseline — never loosen or remove the gate.
- **Out of scope:** Playwright integration is not adopted as a
  default. It would be added only when there is a non-CEP web
  surface to verify.

### Container / IaC

- **Not adopted.** ty-plus is a CEP extension distributed as a
  `.zxp` archive. There is no Dockerfile, Compose, Kubernetes, or
  Terraform in scope. Containerfile / Hadolint / Trivy are not
  introduced speculatively.

### Implicit / persistent memory

- **Project truth lives in the repository** (AGENTS.md, CLAUDE.md,
  ADR, Skills, docs). Implicit persistent memory is not treated
  as a source of truth and is not used to override repository
  declarations.

## Consequences

- The agent's working environment is reproducible from a fresh
  clone: `bun install --frozen-lockfile` is sufficient. No global
  tool or plugin is required.
- All non-destructive validation is reachable from `bun run ci`.
  Local and CI share the same entry point.
- Adding a new plugin, Skill, or tool requires an ADR update
  (supersede / extend this one) with the same shape: capability
  needed, alternatives considered, rejection reasons, license,
  version, and reproduction method.

## Known gap (existing quality debt)

Subsequent revisions append here rather than re-opening closed
conversations.

### Knip debt (2026-08-20 revision; 2026-08-23 update)

- ~~**Duplicate exports (4) in `src/management/catalog/json-files.ts`** —
  deprecated `readGroupCatalogJson` / `writeGroupCatalogJson` /
  `readWidgetCatalogJson` / `writeWidgetCatalogJson` aliases
  survive in active callers (`src/management/preset/edit/Dialog.tsx`,
  `src/management/preset/catalog-browser/ListDialog.tsx`,
  `src/management/preset/group-catalog.ts`,
  `src/management/workspace/persistence/store.ts`).~~ Resolved
  2026-08-23: the only remaining caller
  (`workspace/persistence/store.ts`) was rewritten to use the
  canonical names; the four alias exports were removed from
  `catalog/json-files.ts`. The other three callers listed above
  had already migrated off the deprecated names in earlier
  revisions. `bun run knip` now reports zero duplicate exports.
- **Unused exports / exported types (~435)** — public API surface
  candidates. Decisions on which types remain public belong in a
  type-ownership ADR, not here.
- **Unused files (48)** — legacy module leftovers. Decisions on
  deletion vs archive belong in a separate cleanup initiative.

These items are tracked by `bun run knip` (now surfaced after
the narrow-config revision) and recorded in
`docs/architecture/quality/knip.md`. They are **not** hidden by
config — the boundary between "we know about this debt" and "we
hid this debt" matters more than the absolute number.

### Coverage gap

The 80% coverage threshold is enforced as configured, but the
current run (`bun run test:coverage`) reports:

- Statements: 57.26% (target 80%)
- Branches: 42.60% (target 80%)
- Functions: 52.72% (target 80%)
- Lines: 58.12% (target 80%)

The gap is driven by:

- Excluded test files in `vitest.config.ts` (monaco-editor
  browser deps, slow React component tests). The exclusions are
  narrow and justified individually, but the underlying
  implementation files remain in coverage scope.
- Storage / persistence modules with low coverage (notably
  `src/management/workspace/persistence/store.ts` at 13.35%
  lines, recently unified in the 2026-06-06 persistence ADR).
- Workspace hooks / widget-management paths with thin unit-test
  surface.

The threshold is **not lowered** to mask the gap. Closing the gap
requires test authoring work that is outside the scope of this
initialization ADR and is tracked separately.

## Alternatives considered

- **ESLint + Prettier:** rejected. Biome already covers both
  roles with one binary and one config; adding ESLint + Prettier
  duplicates the responsibility.
- **Jest:** rejected. Vitest is already in use and integrates
  with the existing Vite config without a separate transformer
  pipeline.
- **Playwright as default:** rejected. ty-plus has no web surface
  outside the CEP panel; the cost would not be amortized.
- **Containerfile / Hadolint / Trivy:** rejected. No container
  deliverable exists.
- **claude-mem / implicit persistent memory as source of truth:**
  rejected. Repository files are authoritative; memory is a
  convenience for cross-session recall, not a contract.
- **`.vscode/settings.json` as the canonical LSP home:** rejected.
  Project root `.vscode/` is gitignored; tracked editor config
  would be silently filtered. The LSP home for project-local
  reproducibility is `opencode.json` (this ADR's
  `### LSP / MCP integration`). VS Code / Cursor users get the
  equivalent recommendation in
  `docs/architecture/quality/editor-lsp.md`.
- **Custom opencode plugin under `.opencode/plugins/`:** deferred
  pending a hook with a clear activation condition. The current
  LSP + Skill + bun-run-ci surface is sufficient; adding
  boilerplate plugins would violate the ADR's "no boilerplate"
  stance.

## Re-evaluation condition

This ADR is revisited when:

- Bun's LTS status changes, or a critical incompatibility appears.
- Biome ships a behavior change that breaks the existing ruleset
  or its `lsp-proxy` invocation.
- Vitest's coverage defaults or v8 quirks shift materially.
- A new agent capability (browser, container, documentation
  service) becomes part of the deliverable.
- A new Python script is requested; the request must either be
  declined or trigger an ADR amendment.
- A new agent language (Go, Python, …) enters the deliverable
  and a built-in LSP needs to be added or removed from the
  `opencode.json` `lsp: true` set.
- The upstream opencode schema changes how `lsp: true` interacts
  with custom server entries.
