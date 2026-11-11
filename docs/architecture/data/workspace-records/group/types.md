# Group Types

Group record `type` and `param` branches.

## Current Basic Candidates

- `manual`
- `folder-sync`

## Type Meanings

| type | Main role | `param` center |
| --- | --- | --- |
| `manual` | Explicitly bundle preset id group | Internal preset order, auxiliary display, application rules |
| `folder-sync` | Scan folder to compose preset group | include / exclude / sort / syncMode / flattenDepth / iconRules |

## Decision Criteria

- Use `manual` when you want to directly specify multiple presets with fixed composition.
- Use `folder-sync` when you want to resolve group by syncing with actual folder structure.

## Extension Policy

- Add a new group `type` only when `path` and `param` meaning are clearly independent.
- If adding conditions to `folder-sync` suffices, do not add a new `type`.
