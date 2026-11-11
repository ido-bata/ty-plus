# Icon Rules

Conditional icon application within groups.

## Role

Icon rules are for applying icons to internal presets conditionally — separate from the group's own icon.

## Basic Structure

| Field | Meaning |
| --- | --- |
| `when` | Application condition |
| `icon` | Icon to apply |

`priority` and `applyTo` may be added in the future if needed, but initially closes with `when` and `icon`.

## Conditions

- `all`
- `any`
- `not`

Matcher specification for condition expressions follows [group/matchers.md](../group/matchers.md).
