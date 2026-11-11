# Folder Sync

Group `type = "folder-sync"` `param` definition.

## Role

Folder-sync scans a folder to auto-compose a preset group.
This is a natural relation storage mechanism, not a special case of group — it is a canonical group `type`.

## Main Items

| Field | Meaning |
| --- | --- |
| `include` | Matcher group to include |
| `exclude` | Matcher group to exclude |
| `sort` | Sort order |
| `syncMode` | Sync method |
| `flattenDepth` | How far to flatten folder hierarchy |
| `iconRules` | Conditional icon application rules |

## Notes

- `path` points to the sync source folder.
- include/exclude meaning follows [matchers.md](matchers.md).
- Icon rule shape follows [icon/rules.md](../icon/rules.md).
- Do not expand and persist sync results directly into the layout file.
