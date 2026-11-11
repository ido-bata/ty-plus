# Group Matchers

Matcher meaning for folder-sync `include/exclude` and icon rule `when`.

## Principles

- `pathMatches` / `nameMatches` use minimal wildcard `*` / `?` not regex.
- `extensionIn` / `tagIn` / `presetTypeIn` are exact-match array comparisons.
- Matcher evaluation rules are shared between group and icon rule.

## Normalization

- Path separator normalizes to `/` for comparison.
- Case sensitivity handling is not left to file system — fixed in contract.
- Empty or unspecified values are treated as "no condition", not implicit partial match.

## Composite Conditions

- `all` — all conditions match
- `any` — any condition matches
- `not` — negation

Do not add too many condition expressions — start with what granularity is needed for exploration and sync.
