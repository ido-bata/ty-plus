# Runtime Entrypoints

This document describes ty-plus's current startup paths.

## Canonical Source Paths

| Role | Path |
|---|---|
| package scripts | `package.json` |
| vite manifest config | `cep.config.ts` |
| panel entry | `src/management/panel/` |
| dialog entry | `src/management/dialog/` |
| bootstrap | `src/management/` |
| AE host bridge | `src/management/ae/` |
| ExtendScript JSX | `src/management/ae/jsx/` |

## Current Execution Lane

```text
package.json script
  -> vite + cep.config.ts
  -> src/management/panel/ panel.tsx or dialog/
  -> src/management/ bootstrap
  -> src/management/ae/
  -> src/management/ae/jsx/*
```

## Build Commands

| command | behavior |
|---|---|
| `bun run build` | JSX build + CSS build + CEP dev bundle |
| `bun run host` | build + install + AE launch |
| `bun run host:deploy` | build + install only |
| `bun run ci` | lint / build / es3 check / bundle size / tests |

