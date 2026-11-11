# Preset Records

`presets/presets.json` preset record definition.

## Legacy Compatibility

Legacy path `data/preset/presets.json` is read-only. New writes use `presets/`.

## Role

Preset record holds the execution target and associated information.
Referenced by id from workspace layout, not holding placement itself.

## What Preset Record Holds

- Common record base fields
- Preset `type`
- Execution target or primary path
- `param` per `type`
- Icon, description, auxiliary images

## What Preset Record Does Not Hold

- Position and size on workspace
- Group resolution rules
- Widget display state

## `path` Meaning

`path` meaning is fixed per preset `type`.
Usually a reference to an entity file, but may also represent auxiliary references or import sources.
The difference is closed in [types.md](types.md).

## Collection File Responsibility

`presets.json` is the index file for preset records, not the entity asset itself.
Asset file storage location follows `src/management/storage/`.
