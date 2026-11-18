# Temporary Ambiguity Map

Bridges, compatibility paths, old/new duplicate paths, fallbacks, and copied definitions. Each entry has ownership, risk, and removal conditions where known.

## Snapshot Notice

This map is a dated evidence snapshot. References to `supabase/functions/`, the Supabase edge function, `PresetLibraryDialog`, or other unprovided online surfaces describe the pre-port repository or pre-#193 state; those surfaces do not exist in the current tree (see `docs/architecture/observation/index.md`).

## Bridges

| Bridge | Location | Owner | Risk | Removal Condition |
|--------|----------|-------|------|-------------------|
| ExtendScript eval | `src/management/storage/extendscript/` | Unknown | Fragile polling, no RPC semantics | After RPC mechanism confirmed |
| CSInterface | `src/management/ae/cep/vendor/CSInterface.js` | Unknown | Legacy polyfill | Unknown |

## Compatibility Paths

| Path | Location | Owner | Risk | Removal Condition |
|------|----------|-------|------|-------------------|
| Host detection fallback | `src/management/ae/host/` | Unknown | AE vs standalone ambiguity | Host targeting clarified |

## Duplicate Systems

| System | Locations | Owner | Risk | Removal Condition |
|--------|-----------|-------|------|-------------------|
| Dual widget registries | Legacy vs `src/function/widget/` | Unknown | Competing widget authority | Clarify canonical registry |

## Fallbacks

| Fallback | Location | Owner | Risk | Removal Condition |
|----------|----------|-------|------|-------------------|
| Supabase in-memory | `supabase/functions/typlus/index.ts` (fixture) | Unknown | Production behavior undefined | DB-first production confirmed |

## Unknown Entries

- Dialog polling via storage keys — no documented owner: **Unknown**
- CSInterface authority unclear: **Unknown**

## Debt Signals

1. Dual widget registries with no documented authority decision
2. Supabase edge function in-memory fallback — production behavior undefined
3. ExtendScript storage polling as sole bridge — no RPC alternative
