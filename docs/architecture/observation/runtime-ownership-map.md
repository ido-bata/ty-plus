# Runtime Ownership Map

Code classified by runtime. Cross-runtime imports and calls are recorded without resolving ownership conflicts.

## Legacy Notice

This document references `src/js/` paths which are legacy. Current architecture uses only `src/{function,management,shared}` (see CLAUDE.md).

## Layer Classification

| Layer | Primary Location(s) |
|-------|---------------------|
| React/Browser | `src/function/`, `src/management/` (UI components) |
| ExtendScript | `src/management/ae/` (host scripts) |
| Node/Build | `scripts/build/*`, `scripts/dev/*` |
| Supabase Edge | `supabase/functions/typlus/index.ts` |
| Shared Pure Logic | `src/shared/*` (type definitions, utilities) |

## Cross-Runtime Bridges

| Bridge | Location | Mechanism |
|--------|-----------|-----------|
| ExtendScript eval | `src/management/storage/extendscript/` | evalScript wrapper via CSInterface |
| CSInterface | `src/management/ae/cep/vendor/CSInterface.js` | CEP→AE communication |
| Host detection | `src/management/ae/host/` | AE vs standalone fallback |

## Ownership Conflicts

- **Dual i18n systems**: Legacy path references exist in observation — current authority is being consolidated.
- **Dual widget registries**: Legacy registry exists — primary authority is `src/function/widget/contract.ts`.
- **Supabase edge function**: `supabase/functions/typlus/index.ts` contains in-memory fallback fixtures when DB unavailable — production behavior undefined.

## Unknown

- Whether `archive/` is active product infrastructure or abandoned prototype
- Whether archive tests are run in any CI pipeline

## Runtime Debt Signals

1. ExtendScript storage polling (no RPC) between dialog processes
2. Mock infrastructure for non-CEP dev suggests testing gaps
3. Supabase edge function has hardcoded fallback behavior instead of graceful degradation
