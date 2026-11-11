# Source-Of-Truth Map

Active definitions for IDs, routes, schemas, and data entities. Classified without merging authorities.

## Legacy Notice

Some references are to legacy paths (`src/cep-shell/`, `src/js/`) which are being phased out. These are annotated as legacy.

## Entity Authority

| Entity | Definition Location | Authority Classification |
|--------|-------------------|------------------------|
| Widget Configs | `src/function/widget/contract.ts` | single authority |
| Panel Config | `cep.config.ts` | single authority |
| Supabase Schema | `supabase/functions/typlus/index.ts` | single authority (but in-memory fallback present) |
| Command IDs | Unknown | unknown |
| Environment IDs | Unknown | unknown |

## Widget Authority

| Authority | Location | Scope | Classification |
|-----------|----------|-------|----------------|
| Primary registry | `src/function/widget/contract.ts` | 6 active entries | **primary for current exposure** |

**Policy:** `src/function/widget/contract.ts` is primary authority for current widget exposure.

## Domain Entities

| Entity | Schema Location | Projected In |
|--------|---------------|-------------|
| PresetRow | `supabase/functions/typlus/index.ts` | unknown |
| NotificationRow | `supabase/functions/typlus/index.ts` | unknown |

## Unknown

- Command ID definitions — not yet traced to a single authority
- Environment ID definitions — not yet traced to a single authority

## Debt Signals

1. Supabase edge function in-memory fallback = production behavior undefined
