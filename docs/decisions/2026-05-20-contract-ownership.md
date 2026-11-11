# Contract Ownership Decisions

## widget.ts
**Exports:** `WIDGET_TYPES`, `WidgetType`
**Primary Owner:** function/widget
**Reason:** Widget types are defined by widget runtime; comment in file states "Canonical types live here; runtime definitions live in `src/function/widget`"

**Imports:** function/widget (kinds.ts), management/workspace/state, management/workspace/state/normalize.ts, management/workspace/placement/*, management/widget/*, management/workspace/surface/Grid.tsx, management/workspace/events/handler.test.ts

---

## preset.ts
**Exports:** `PresetIcon`, `TextParams`, `EmojiParams`, `ImageParams`, `presetIconText`, `presetIconEmoji`, `presetIconImage`, `presetIconCanvas`, `coercePresetCatalogIcon`

**Primary Owner:** management/preset
**Reason:** Preset icon data model and coercion utilities are managed by preset system

**Imports:** management/preset/*, shared/component/fields/DirectoryBrowser.tsx

---

## placement.ts
**Exports:** `AutoAxis`, `AutoPackOptions`
**Primary Owner:** management/workspace/placement
**Reason:** Placement packing options used exclusively by placement system

**Imports:** management/workspace/placement/gateway.ts

---

## background.ts
**Exports:** `LayerType`, `PatternValue`, `Layer`, `Background`
**Primary Owner:** management/workspace/background
**Reason:** Workspace background data model; only imported via workspace-shell.ts for SurfaceMessageEnvelope payload type

**Note:** Not currently imported by any file directly from the new location (was at src/shared/contract/background.ts)

---

## surface.ts
**Exports:** `SurfaceInfo`, `CompInfo` (deprecated alias), `AlignTargetId`
**Primary Owner:** management/workspace/surface
**Reason:** Workspace UI surface types; imported by function/widget (ae-scripts.ts, align-script.ts)

**Imports:** function/widget/font-viewer/font-viewer-widget.tsx, function/widget/align/align-script.ts, management/workspace/state.ts

---

## workspace-shell.ts
**Exports:** `SHELL_CHANNELS`, `ShellChannel`, `PresetsPayload`, `MessagesPayload`, `SettingsPayload`, `LayoutPayload`, `BackgroundPayload`

**Primary Owner:** management/workspace/shell
**Reason:** Workspace shell channels and APPLICATION bus message payloads

**Imports:** management/setting/shell/workspace-shell.ts (re-export only)

---

## platform.ts
**Exports:** Large surface types including `Preset`, `PresetRecord`, `PresetType`, `CloudPresetMutation`, `WidgetRegistry`, `SnapshotStorage`, `SurfaceMessageEnvelope`, `SurfaceTransport`, `ExecutionRequest`, `ExecutionRecord`, `SyncStatus`, `CloudGateway`, `FileSystemGateway`, `AfterEffectsHostApi`, `HostAdapter`, `HostFunctionCaller`, `WidgetRegistry`, `Runtime`, `NotificationSummary`, `PresetSearchParams`, `PresetSearchItem`, `PresetDownload`, `PresetUpload`, `PresetEasingCurveV1`, `TyPlusHealthResponse`, `ReportCreateRequest`, `ReportCreateResponse`, `AexEffectScanRow`, and many internal types

**Primary Owner:** Mixed - platform-level integration concerns belong here; preset types belong to management/preset; widget registry belongs to function/widget

**Rationale for NOT moving to single domain:** This file is a large integration surface with cross-cutting concerns (HostAdapter, CloudGateway, FileSystemGateway, Runtime). It acts as the integration contract hub. Breaking it apart would require significant refactoring and is not warranted by current import patterns.

**Note:** `WidgetRegistry` and `Preset` types have separate domain owners but are correctly re-exported here as the canonical integration contract point.

---

## index.ts (barrel)
**Role:** Re-exports all contract types for convenience
**Note:** Should be removed or reduced once import paths are updated to point directly to owning domain contracts