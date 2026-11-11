# Icon Records

Common icon data type for preset and group.

## Principles

- Icon is not separated into a separate file — it is contained within records.
- Common parts use common structure; type-specific differences close in `param`.
- Icon is an auxiliary visual representation for record identification — not a substitute for record id or `type`.

## Icon `type`

- `text`
- `emoji`
- `image`
- `canvas`

## Type Assumptions

| type | Main content |
| --- | --- |
| `text` | Text string, text color, background color, etc. |
| `emoji` | Emoji itself, background and border info if needed |
| `image` | Image path or image source |
| `canvas` | Drawing parameter group |

## Implementation Notes

- Icon common type authority is in `src/management/` contracts.
- Icon is future-archived to be extracted as a standalone type if needed.
