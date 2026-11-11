# Phase 3 gate — host context and read-only filesystem

## Entry conditions

- `HFS-013 done`

## Exit criteria

| ID | Criterion | Verification |
| --- | --- | --- |
| `HFS-GATE-001` | `appRoot` is obtained from ExtendScript `app.path` only | `getHostContext` returns app_root from ExtendScript |
| `HFS-GATE-002` | No Rust/TS branch on AE version | No conditional logic based on AE version in scan path |
| `HFS-GATE-003` | Multiple AE sessions can scan simultaneously | Session isolation verified in HFS-004 tests |
| `HFS-GATE-004` | Windows/macOS produce identical result semantics | Platform scan tests pass on both OS |
| `HFS-GATE-005` | WIP appRoot discovery and old scan fallback removed | Boundary guard passes with 0 fallback violations |

## Verification

```bash
# Rust tests
cargo +1.85.0 test -p ty-plus-protocol
cargo +1.85.0 test -p ty-plus-host-filesystem

# TypeScript tests
npx vitest run src/management/ae/files/

# Boundary guard
bun run scripts/check/check-rust-runtime-boundaries.ts

# Lint and typecheck
npm run lint
npx tsc --noEmit
```

## Status

- [x] `HFS-GATE-001`: `getHostContext` returns app_root from ExtendScript
- [x] `HFS-GATE-002`: No AE version branching in scan path
- [x] `HFS-GATE-003`: Session isolation verified (HFS-004 tests)
- [x] `HFS-GATE-004`: Platform scan tests pass (HFS-007/HFS-008 tests)
- [x] `HFS-GATE-005`: Boundary guard passes (0 app-root-discovery/legacy-fallback violations)

## Verification Results

- Protocol tests: 35/35 passed
- Host-filesystem tests: 33/33 passed
- TypeScript tests: 7/7 passed
- Boundary guard: 0 app-root-discovery violations, 0 legacy-fallback violations
- child-process violation in transport.ts is expected (runtime transport)

## Result

Phase 3 gate **PASSED**.
