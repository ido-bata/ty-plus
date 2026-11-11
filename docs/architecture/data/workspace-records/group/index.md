# Group Records

`groups/groups.json` group record definition.

## Legacy Compatibility

Legacy path `data/group/groups.json` is read-only. New writes use `groups/`.

## Role

Group record holds preset group organization and resolution rules.
Group is referenced as 1 item from workspace layout, but internally bundles multiple presets.

## What Group Record Holds

- Common record base fields
- Group `type`
- `param` per `type`
- Internal preset references or sync source info
- Group's own icon
- Conditional icon application rules

## What Group Record Does Not Hold

- Position and size on workspace
- Preset entities themselves
- Folder sync scan result cache as the canonical body

## Reference Relationships

- Group may reference multiple preset ids internally.
- Icon rules in group assist visual application to presets, but do not override preset body.
- See [types.md](types.md) and [folder-sync.md](folder-sync.md).
