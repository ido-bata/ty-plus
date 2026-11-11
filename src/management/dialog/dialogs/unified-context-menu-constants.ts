/**
 * Stable command ids for the unified workspace context menu (`ty.ctx.*`).
 * Kept separate from menu construction / hit-testing so handlers and XML payloads
 * share a single source of truth.
 */

export const CTX_MENU_IDS = {
	undo: "ty.ctx.undo",
	redo: "ty.ctx.redo",
	saveSnapshot: "ty.ctx.save-snapshot",
	/** "Saved Layouts" submenu parent under the Layout submenu. */
	savedLayoutsMenuRoot: "ty.ctx.saved-layouts-root",
	/** Restore one snapshot: child id is `${restoreSnapshotPrefix}${snapshotId}`. */
	restoreSnapshotPrefix: "ty.ctx.restore-snapshot.",
	openPresets: "ty.ctx.open-presets",
	openPresetLibrary: "ty.ctx.open-preset-library",
	openMessages: "ty.ctx.open-messages",
	openSettings: "ty.ctx.open-settings",
	openDebug: "ty.ctx.open-debug",
	toggleLayoutLock: "ty.ctx.toggle-layout-lock",
	runPreset: "ty.ctx.run-preset",
	copyPresetId: "ty.ctx.copy-preset-id",
	qaToggle: "ty.ctx.qa-toggle",
	/** Archive: "Group selected items" (stub when selected since data model not yet supported) */
	groupSelectedPresets: "ty.ctx.preset-group-selected",
	/** Bulk delete when multiple presets selected on empty grid */
	deleteSelectedPresets: "ty.ctx.delete-selected-presets",
	/** Layout submenu parent (non-clickable; CEP shows only children) */
	layoutMenuRoot: "ty.ctx.layout-menu-root",
	/** Preset creation submenu parent */
	createPresetsMenuRoot: "ty.ctx.create-presets-menu-root",
	/** Preset row / multi-select "Move to panel" parent */
	movePresetToPanelMenuRoot: "ty.ctx.move-preset-to-panel-root",
	/** Root multi-select "Move to panel" parent */
	moveSelectedToPanelMenuRoot: "ty.ctx.move-selected-to-panel-root",
	/** Widget "Move to panel" parent */
	moveWidgetToPanelMenuRoot: "ty.ctx.move-widget-to-panel-root",
	/** Child: `ty.ctx.move-presets-to-panel.${n}` (currently opens other panel only; move not yet implemented) */
	movePresetsToPanelPrefix: "ty.ctx.move-presets-to-panel.",
	refreshProjectInfo: "ty.ctx.refresh-project-info",
	reloadPresets: "ty.ctx.reload-presets",
	/** Archive workspace:context.packTopLeft (grid packing not yet implemented) */
	packTopLeft: "ty.ctx.pack-top-left",
	addWidget: "ty.ctx.add-widget",
	openBackground: "ty.ctx.open-background",
	/** Workspace panel: grid alignment overlay visibility */
	toggleWorkspaceGridOverlay: "ty.ctx.toggle-workspace-grid-overlay",
	/** Workspace panel: preset tile title labels */
	toggleWorkspacePresetLabels: "ty.ctx.toggle-workspace-preset-labels",
	/** Open product docs in default browser (non-destructive) */
	openDocs: "ty.ctx.open-docs",
	createFilePreset: "ty.ctx.create-file-preset",
	createFolderPreset: "ty.ctx.create-folder-preset",
	createAnimationPreset: "ty.ctx.create-animation-preset",
	createLayerCompPreset: "ty.ctx.create-layer-comp-preset",
	createCodePreset: "ty.ctx.create-code-preset",
	createEasingPreset: "ty.ctx.create-easing-preset",
	createFootagePreset: "ty.ctx.create-footage-preset",
	createImportPreset: "ty.ctx.create-import-preset",
	easingPresetLinear: "ty.ctx.easing.preset-linear",
	easingPresetEaseOut: "ty.ctx.easing.preset-ease-out",
	easingPresetEaseIn: "ty.ctx.easing.preset-ease-in",
	easingPresetEaseInOut: "ty.ctx.easing.preset-ease-in-out",
	easingCopyFromSelection: "ty.ctx.easing.copy-from-selection",
	easingReverseCurve: "ty.ctx.easing.reverse-curve",
	easingApplyCurrent: "ty.ctx.easing.apply-current",
	easingBackgroundDot: "ty.ctx.easing.background-dot",
	easingBackgroundGrid: "ty.ctx.easing.background-grid",
	easingApplyModeSingle: "ty.ctx.easing.apply-mode-single",
	easingApplyModePair: "ty.ctx.easing.apply-mode-pair",
	easingAutoApplyOn: "ty.ctx.easing.auto-apply-on",
	easingAutoApplyOff: "ty.ctx.easing.auto-apply-off",
	/** Right-click submenu: Copy Ease (current curve to clipboard) */
	easingCopyEase: "ty.ctx.easing.copy-ease",
	/** Right-click submenu: Copy Values (selected KF values to clipboard) */
	easingCopyValues: "ty.ctx.easing.copy-values",
	/** Right-click submenu: Paste (both, by default). Modifier at click time
	 *  controls which slot is used: Alt=ease, Shift=values, none=both. */
	easingPaste: "ty.ctx.easing.paste",
	easingLabelNone: "ty.ctx.easing.label-none",
	easingLabelPrefix: "ty.ctx.easing.label-",
	/** Per-curve-category label color root (e.g. `ty.ctx.easing.label.linear`). */
	easingLabelCategoryPrefix: "ty.ctx.easing.label.",
	/** Per-curve-category color choice (e.g. `ty.ctx.easing.label.linear.3`). */
	easingLabelCategoryValuePrefix: "ty.ctx.easing.label-value.",
	/** Flat main-apply label color submenu root. */
	easingMainLabelColorPrefix: "ty.ctx.easing.main-label-color.",
	/** Flat main-apply label color choice
	 *  (e.g. `ty.ctx.easing.main-label-color.none`,
	 *   `ty.ctx.easing.main-label-color.3`). */
	easingMainLabelColorValuePrefix: "ty.ctx.easing.main-label-color-value.",
	editPreset: "ty.ctx.edit-preset",
	duplicatePreset: "ty.ctx.duplicate-preset",
	deletePreset: "ty.ctx.delete-preset",
	/** Remove a widget instance tile from the current panel grid */
	deleteWorkspaceWidget: "ty.ctx.delete-workspace-widget",
	releaseGroupPreset: "ty.ctx.release-group-preset",
	removePresetFromOpenedGroup: "ty.ctx.remove-preset-from-opened-group",
	openPanelPrefix: "ty.ctx.open-panel-",
	/** Lower-right probe tile (minimal menu) */
	probeLog: "ty.ctx.probe.log",
	probeOpenDebug: "ty.ctx.probe.open-debug",
	/** Bottom `.ty-control-panel` (fixed toolbar) */
	cpToggleCollapse: "ty.ctx.cp.toggle-collapse",
	cpLayoutTopLeft: "ty.ctx.cp.layout.top-left.horizontal",
	cpLayoutTopCenter: "ty.ctx.cp.layout.top-center.horizontal",
	cpLayoutTopRight: "ty.ctx.cp.layout.top-right.horizontal",
	cpLayoutBottomLeft: "ty.ctx.cp.layout.bottom-left.horizontal",
	cpLayoutBottomCenter: "ty.ctx.cp.layout.bottom-center.horizontal",
	cpLayoutBottomRight: "ty.ctx.cp.layout.bottom-right.horizontal",
	cpLayoutLeftCenter: "ty.ctx.cp.layout.left-center.vertical",
	cpLayoutRightCenter: "ty.ctx.cp.layout.right-center.vertical",
	cpOrientHorizontal: "ty.ctx.cp.orient.horizontal",
	cpOrientVertical: "ty.ctx.cp.orient.vertical",
	cpResetDefault: "ty.ctx.cp.reset-default",
	resetWorkspace: "ty.ctx.reset-workspace",
	/** Directory-browser widget (inside `data-directory-browser-body`) */
	dirBrowserRefresh: "ty.ctx.dir-browser.refresh",
	dirBrowserToggleFilters: "ty.ctx.dir-browser.toggle-filters",
	dirBrowserClearSearch: "ty.ctx.dir-browser.clear-search",
	dirBrowserDefaultDir: "ty.ctx.dir-browser.default-dir",
	dirBrowserOpenDirPrefix: "ty.ctx.dir-browser.open-dir:",
	dirBrowserSelectPrefix: "ty.ctx.dir-browser.select:",
	dirBrowserImportPrefix: "ty.ctx.dir-browser.import:",
	dirBrowserRunPresetPrefix: "ty.ctx.dir-browser.run-preset:",
	dirBrowserAudioPreviewPrefix: "ty.ctx.dir-browser.audio-preview:",
	fontViewerTileSquare: "ty.ctx.font-viewer.tile-square",
	fontViewerTileWide: "ty.ctx.font-viewer.tile-wide",
	fontViewerToggleResolved: "ty.ctx.font-viewer.toggle-resolved",
	/** Anchor-point widget */
	anchorPointResetCenter: "ty.ctx.anchor-point.reset-center",
	anchorPointApplyAllLayers: "ty.ctx.anchor-point.apply-all-layers",
	anchorPointApplyActiveComp: "ty.ctx.anchor-point.apply-active-comp",
	anchorPointPrefix: "ty.ctx.anchor-point.",
	/** Align widget */
	alignTargetSelection: "ty.ctx.align.target.selection",
	alignTargetComp: "ty.ctx.align.target.comp",
	alignTargetKeyObject: "ty.ctx.align.target.key-object",
	alignTargetTime: "ty.ctx.align.target.time",
	alignActionPrefix: "ty.ctx.align.action.",
} as const;

/** QA category ordering for context menu construction */
export const QA_ORDER = ["file", "edit", "view", "help"] as const;
