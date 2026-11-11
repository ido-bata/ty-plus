# Common Records

Common record principles for preset, widget, and group.

## Common Principles

- Common information goes in the common structure.
- Type-specific differences go in a separate `param` structure.
- `type` is not a free-input string — it is selected from enumerated candidates in the contract.
- `path` represents either a实体 file, a sync source, or an auxiliary reference — meaning is fixed per record `type`.
- Layout placement and record body are separated.

## Common Record Fields

| Field | Meaning |
| --- | --- |
| `id` | Unique id |
| `type` | Record type discriminator |
| `name` | Display name |
| `icon` | Common icon data type |
| `description` | Auxiliary description |
| `descriptionImagePath` | Auxiliary image |
| `path` | Primary path per `type` |
| `param` | Type-specific additional parameters |

## `type` Usage

- `type` is the primary key that determines record behavior.
- `type` is not a storage-only concept — it affects dialog UI, execution, and sync conditions.
- Do not use ambiguous terms like `kind`.

## `param` Usage

- `param` is a differential area, not a free-form field.
- `param` is not "anything goes" — its meaning closes per `type`.
- Mandatory items, optional items, and `path` meaning are closed per `type`.
- `param` details are fixed in each domain document.
