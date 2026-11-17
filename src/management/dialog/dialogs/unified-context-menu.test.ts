import { beforeEach, describe, expect, it } from "vitest";
import {
	buildEasingContextMenu,
	buildEasingLabelColorMenu,
	buildSavedLayoutsSubmenu,
	buildWorkspaceContextMenuPayload,
	setEasingClipboard,
	setValuesClipboard,
	updateEasingSettingsCache,
} from "@/management/dialog/dialogs/unified-context-menu";
import { CTX_MENU_IDS } from "@/management/dialog/dialogs/unified-context-menu-constants";
import { EASING_CURVE_COLOR_ROWS } from "@/management/workspace/literals/easing-color-catalog";
import type { SurfaceState } from "@/management/workspace/state";
import type { Snapshot } from "@/management/workspace/undo/history";

describe("buildEasingLabelColorMenu (per-curve-category label color submenu)", () => {
	it("produces one parent entry per curve category", () => {
		const menu = buildEasingLabelColorMenu({}, {});
		expect(menu).toHaveLength(EASING_CURVE_COLOR_ROWS.length);
		expect(menu.map((entry) => entry.label)).toEqual(
			EASING_CURVE_COLOR_ROWS.map((row) => row.label),
		);
	});

	it("parents use the stable category-root id scheme", () => {
		const menu = buildEasingLabelColorMenu({}, {});
		for (let i = 0; i < menu.length; i += 1) {
			const row = EASING_CURVE_COLOR_ROWS[i];
			expect(menu[i].id).toBe(
				`${CTX_MENU_IDS.easingLabelCategoryPrefix}${row.key}`,
			);
		}
	});

	it("each parent has 17 children (None + 16 AE colors)", () => {
		const menu = buildEasingLabelColorMenu({}, {});
		for (const parent of menu) {
			expect(parent.menu).toHaveLength(17);
			const noneEntry = parent.menu?.[0];
			expect(noneEntry?.label).toBe("None");
			expect(noneEntry?.id?.endsWith(".none")).toBe(true);
		}
	});

	it("uses bundled English names when no AE names are supplied", () => {
		const menu = buildEasingLabelColorMenu({}, {});
		const linear = menu.find(
			(parent) =>
				parent.id === `${CTX_MENU_IDS.easingLabelCategoryPrefix}linear`,
		);
		// Bundled defaults: color 1 = Red, color 3 = Aqua
		const redEntry = linear?.menu?.find(
			(child) =>
				child.id === `${CTX_MENU_IDS.easingLabelCategoryValuePrefix}linear.1`,
		);
		const aquaEntry = linear?.menu?.find(
			(child) =>
				child.id === `${CTX_MENU_IDS.easingLabelCategoryValuePrefix}linear.3`,
		);
		expect(redEntry?.label).toBe("Red");
		expect(aquaEntry?.label).toBe("Aqua");
	});

	it("prefers AE-supplied label names over bundled defaults", () => {
		const menu = buildEasingLabelColorMenu({}, { "3": "Custom Aqua" });
		const linear = menu.find(
			(parent) =>
				parent.id === `${CTX_MENU_IDS.easingLabelCategoryPrefix}linear`,
		);
		const aquaEntry = linear?.menu?.find(
			(child) =>
				child.id === `${CTX_MENU_IDS.easingLabelCategoryValuePrefix}linear.3`,
		);
		expect(aquaEntry?.label).toBe("Custom Aqua");
	});

	it("marks the current selection for each category", () => {
		const custom = { linear: 5, hold: -1 } as const;
		const menu = buildEasingLabelColorMenu(custom, {});
		const linear = menu.find(
			(parent) =>
				parent.id === `${CTX_MENU_IDS.easingLabelCategoryPrefix}linear`,
		);
		const hold = menu.find(
			(parent) => parent.id === `${CTX_MENU_IDS.easingLabelCategoryPrefix}hold`,
		);
		// linear custom = 5: that one entry is checked
		const linearFive = linear?.menu?.find(
			(child) =>
				child.id === `${CTX_MENU_IDS.easingLabelCategoryValuePrefix}linear.5`,
		);
		expect(linearFive?.checked).toBe(true);
		// hold custom = -1: the None entry is checked
		const holdNone = hold?.menu?.[0];
		expect(holdNone?.label).toBe("None");
		expect(holdNone?.checked).toBe(true);
		// linear none should NOT be checked (override is 5, not -1)
		const linearNone = linear?.menu?.[0];
		expect(linearNone?.checked).toBe(false);
	});

	it("falls back to defaults when customColors is empty for a category", () => {
		// linear default color is 8 per EASING_CURVE_COLOR_DEFAULTS
		const menu = buildEasingLabelColorMenu({}, {});
		const linear = menu.find(
			(parent) =>
				parent.id === `${CTX_MENU_IDS.easingLabelCategoryPrefix}linear`,
		);
		const linearEight = linear?.menu?.find(
			(child) =>
				child.id === `${CTX_MENU_IDS.easingLabelCategoryValuePrefix}linear.8`,
		);
		expect(linearEight?.checked).toBe(true);
	});

	it("does not surface 'Archive default' / 'Alternate 1' / 'Alternate 2' anywhere", () => {
		// Regression: the legacy flat submenu exposed three internal labels
		// ("Archive default", "Alternate 1", "Alternate 2") that referenced
		// internal color indices 9/10/11 with no relation to the user's
		// AE preferences. The new per-category structure renders AE's
		// actual names (or bundled English), never those legacy labels.
		const menu = buildEasingLabelColorMenu({}, {});
		const flat = JSON.stringify(menu);
		expect(flat).not.toContain("Archive default");
		expect(flat).not.toContain("Alternate 1");
		expect(flat).not.toContain("Alternate 2");
	});
});

const makeSnapshot = (id: string, label: string): Snapshot => ({
	id,
	label,
	createdAt: "2026-01-01T00:00:00.000Z",
	panels: {},
});

describe("buildSavedLayoutsSubmenu", () => {
	it("returns a non-null submenu with a disabled placeholder when there are no snapshots", () => {
		const entry = buildSavedLayoutsSubmenu([], true);
		expect(entry).not.toBeNull();
		expect(entry?.id).toBe(CTX_MENU_IDS.savedLayoutsMenuRoot);
		expect(entry?.menu).toHaveLength(1);
		expect(entry?.menu?.[0]?.label).toBe("(No saved layouts)");
		expect(entry?.menu?.[0]?.enabled).toBe(false);
	});

	it("uses the Saved Layouts submenu root id", () => {
		const entry = buildSavedLayoutsSubmenu(
			[makeSnapshot("s1", "Morning")],
			true,
		);
		expect(entry?.id).toBe(CTX_MENU_IDS.savedLayoutsMenuRoot);
		expect(entry?.label).toBe("Saved Layouts");
	});

	it("lists snapshots in newest-first order", () => {
		const entry = buildSavedLayoutsSubmenu(
			[
				makeSnapshot("a", "Alpha"),
				makeSnapshot("b", "Beta"),
				makeSnapshot("c", "Gamma"),
			],
			true,
		);
		expect(entry?.menu?.map((c) => c.label)).toEqual([
			"Gamma",
			"Beta",
			"Alpha",
		]);
	});

	it("emits one child per snapshot with the stable restore-snapshot id", () => {
		const entry = buildSavedLayoutsSubmenu(
			[makeSnapshot("snap-1", "One"), makeSnapshot("snap-2", "Two")],
			true,
		);
		const ids = entry?.menu?.map((c) => c.id) ?? [];
		expect(ids).toEqual([
			`${CTX_MENU_IDS.restoreSnapshotPrefix}snap-2`,
			`${CTX_MENU_IDS.restoreSnapshotPrefix}snap-1`,
		]);
	});

	it("does not mutate the input snapshots array", () => {
		const input = [makeSnapshot("a", "A"), makeSnapshot("b", "B")];
		const inputCopy = input.slice();
		buildSavedLayoutsSubmenu(input, true);
		expect(input).toEqual(inputCopy);
	});

	it("disables entries when CEP is not the host", () => {
		const entry = buildSavedLayoutsSubmenu(
			[makeSnapshot("s1", "Morning")],
			false,
		);
		expect(entry?.enabled).toBe(false);
		expect(entry?.menu?.[0]?.enabled).toBe(false);
	});
});

describe("buildWorkspaceContextMenuPayload (Saved Layouts integration)", () => {
	const baseState: Pick<
		SurfaceState,
		| "layoutLocked"
		| "presets"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presetHoverId"
		| "panelPresetIds"
		| "panelId"
		| "openedGroupPresetId"
		| "groupCatalogEntries"
		| "widgetInstanceTypes"
	> = {
		layoutLocked: false,
		presets: [],
		surfaceTiles: [],
		selectedSurfaceIndices: [],
		presetSelectedIds: [],
		presetHoverId: null,
		panelPresetIds: [],
		panelId: "panel-1",
		openedGroupPresetId: null,
		groupCatalogEntries: [],
		widgetInstanceTypes: {},
	};

	const findLayoutSubmenu = (
		menu: ReturnType<typeof buildWorkspaceContextMenuPayload>["menu"],
	) => menu.find((entry) => entry.id === CTX_MENU_IDS.layoutMenuRoot);

	it("includes the Saved Layouts submenu under Layout when snapshots are present", () => {
		const payload = buildWorkspaceContextMenuPayload(
			{ zone: "workspace" },
			baseState,
			{ canUndo: false, canRedo: false },
			{
				isCep: true,
				hostCode: "AEFT",
				getSavedSnapshots: () => [makeSnapshot("s1", "Morning")],
			},
		);
		const layout = findLayoutSubmenu(payload.menu);
		const saved = layout?.menu?.find(
			(entry) => entry.id === CTX_MENU_IDS.savedLayoutsMenuRoot,
		);
		expect(saved).toBeDefined();
		expect(saved?.label).toBe("Saved Layouts");
		expect(saved?.menu?.length).toBe(1);
		expect(saved?.menu?.[0]?.id).toBe(
			`${CTX_MENU_IDS.restoreSnapshotPrefix}s1`,
		);
	});

	it("shows a disabled placeholder under Saved Layouts when no snapshots are present", () => {
		const payload = buildWorkspaceContextMenuPayload(
			{ zone: "workspace" },
			baseState,
			{ canUndo: false, canRedo: false },
			{
				isCep: true,
				hostCode: "AEFT",
				getSavedSnapshots: () => [],
			},
		);
		const layout = findLayoutSubmenu(payload.menu);
		const saved = layout?.menu?.find(
			(entry) => entry.id === CTX_MENU_IDS.savedLayoutsMenuRoot,
		);
		expect(saved).toBeDefined();
		expect(saved?.label).toBe("Saved Layouts");
		expect(saved?.menu?.[0]?.label).toBe("(No saved layouts)");
		expect(saved?.menu?.[0]?.enabled).toBe(false);
	});

	it("works without a getSavedSnapshots provider (defensive default)", () => {
		const payload = buildWorkspaceContextMenuPayload(
			{ zone: "workspace" },
			baseState,
			{ canUndo: false, canRedo: false },
			{ isCep: true, hostCode: "AEFT" },
		);
		const layout = findLayoutSubmenu(payload.menu);
		const saved = layout?.menu?.find(
			(entry) => entry.id === CTX_MENU_IDS.savedLayoutsMenuRoot,
		);
		expect(saved).toBeDefined();
		expect(saved?.menu?.[0]?.label).toBe("(No saved layouts)");
	});
});

describe("buildEasingContextMenu (Auto Apply submenu)", () => {
	beforeEach(() => {
		// Reset the module-level cache between tests so each case starts from
		// the documented default (autoApply = true).
		updateEasingSettingsCache({ autoApply: true });
	});

	const findAutoApply = (menu: ReturnType<typeof buildEasingContextMenu>) =>
		menu.find((entry) => entry.id === "ty.ctx.easing.autoApply");

	it("includes an Auto Apply submenu with the stable id and label", () => {
		const menu = buildEasingContextMenu();
		const entry = findAutoApply(menu);
		expect(entry).toBeDefined();
		expect(entry?.label).toBe("Auto Apply");
	});

	it("submenu has two checkable children with the expected ids and labels", () => {
		const entry = findAutoApply(buildEasingContextMenu());
		expect(entry?.menu).toHaveLength(2);
		const [first, second] = entry?.menu ?? [];
		expect(first?.id).toBe(CTX_MENU_IDS.easingAutoApplyOn);
		expect(first?.label).toBe("On");
		expect(first?.checkable).toBe(true);
		expect(second?.id).toBe(CTX_MENU_IDS.easingAutoApplyOff);
		expect(second?.label).toBe("Off");
		expect(second?.checkable).toBe(true);
	});

	it("marks the On child as checked when the cache is the default true", () => {
		updateEasingSettingsCache({ autoApply: true });
		const entry = findAutoApply(buildEasingContextMenu());
		const [on, off] = entry?.menu ?? [];
		expect(on?.checked).toBe(true);
		expect(off?.checked).toBe(false);
	});

	it("flips the checked state when the cache is set to false", () => {
		updateEasingSettingsCache({ autoApply: false });
		const entry = findAutoApply(buildEasingContextMenu());
		const [on, off] = entry?.menu ?? [];
		expect(on?.checked).toBe(false);
		expect(off?.checked).toBe(true);
	});

	it("keeps the existing Apply, Copy from selection, and Reverse items intact", () => {
		const menu = buildEasingContextMenu();
		const ids = menu.map((entry) => entry.id);
		expect(ids).toContain(CTX_MENU_IDS.easingApplyCurrent);
		expect(ids).toContain(CTX_MENU_IDS.easingCopyFromSelection);
		expect(ids).toContain(CTX_MENU_IDS.easingReverseCurve);
	});
});

describe("buildEasingContextMenu (Shortcuts submenu)", () => {
	const findShortcuts = (menu: ReturnType<typeof buildEasingContextMenu>) =>
		menu.find((entry) => entry.id === "ty.ctx.easing.shortcuts");

	it("includes a Shortcuts submenu with the stable id and label", () => {
		const menu = buildEasingContextMenu();
		const entry = findShortcuts(menu);
		expect(entry).toBeDefined();
		expect(entry?.label).toBe("Shortcuts");
	});

	it("lists 8 disabled (informational) entries", () => {
		const entry = findShortcuts(buildEasingContextMenu());
		expect(entry?.menu).toHaveLength(8);
		for (const child of entry?.menu ?? []) {
			expect(child.enabled).toBe(false);
		}
	});
});

describe("buildEasingContextMenu (Clipboard submenu)", () => {
	it("includes a Clipboard submenu with Copy Ease / Copy Values / Paste", () => {
		setEasingClipboard(null);
		setValuesClipboard(null);
		const menu = buildEasingContextMenu();
		const clip = menu.find((entry) => entry.id === "ty.ctx.easing.copyPaste");
		expect(clip).toBeDefined();
		expect(clip?.label).toBe("Clipboard");
		const ids = (clip?.menu ?? []).map((c) => c.id);
		expect(ids).toContain(CTX_MENU_IDS.easingCopyEase);
		expect(ids).toContain(CTX_MENU_IDS.easingCopyValues);
		expect(ids).toContain(CTX_MENU_IDS.easingPaste);
	});

	it("Paste is enabled only when at least one clipboard is set", () => {
		setEasingClipboard(null);
		setValuesClipboard(null);
		const menu1 = buildEasingContextMenu();
		const clip1 = menu1.find((e) => e.id === "ty.ctx.easing.copyPaste");
		const paste1 = (clip1?.menu ?? []).find(
			(c) => c.id === CTX_MENU_IDS.easingPaste,
		);
		expect(paste1?.enabled).toBe(false);

		setEasingClipboard({
			points: [{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.3, y: 0 } }],
		});
		const menu2 = buildEasingContextMenu();
		const clip2 = menu2.find((e) => e.id === "ty.ctx.easing.copyPaste");
		const paste2 = (clip2?.menu ?? []).find(
			(c) => c.id === CTX_MENU_IDS.easingPaste,
		);
		expect(paste2?.enabled).toBe(true);
	});
});

describe("buildWorkspaceContextMenuPayload (preset-row Duplicate entry)", () => {
	const baseState: Pick<
		SurfaceState,
		| "layoutLocked"
		| "presets"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presetHoverId"
		| "panelPresetIds"
		| "panelId"
		| "openedGroupPresetId"
		| "groupCatalogEntries"
		| "widgetInstanceTypes"
	> = {
		layoutLocked: false,
		presets: [
			{
				id: "p-1",
				type: "preset",
				title: "Sample",
				filePath: "/x",
			},
		],
		surfaceTiles: [],
		selectedSurfaceIndices: [],
		presetSelectedIds: [],
		presetHoverId: null,
		panelPresetIds: [],
		panelId: "panel-1",
		openedGroupPresetId: null,
		groupCatalogEntries: [],
		widgetInstanceTypes: {},
	};

	it("includes a Duplicate row between Edit and Delete for a known preset-row hit", () => {
		const payload = buildWorkspaceContextMenuPayload(
			{ zone: "preset-row", presetId: "p-1" },
			baseState,
			{ canUndo: false, canRedo: false },
			{ isCep: true, hostCode: "AEFT" },
		);
		const ids = payload.menu.map((entry) => entry.id);
		const editIdx = ids.indexOf(CTX_MENU_IDS.editPreset);
		const duplicateIdx = ids.indexOf(CTX_MENU_IDS.duplicatePreset);
		const deleteIdx = ids.indexOf(CTX_MENU_IDS.deletePreset);
		expect(editIdx).toBeGreaterThanOrEqual(0);
		expect(duplicateIdx).toBeGreaterThan(editIdx);
		expect(deleteIdx).toBeGreaterThan(duplicateIdx);
	});

	it("emits the Duplicate row with the stable id and the expected label", () => {
		const payload = buildWorkspaceContextMenuPayload(
			{ zone: "preset-row", presetId: "p-1" },
			baseState,
			{ canUndo: false, canRedo: false },
			{ isCep: true, hostCode: "AEFT" },
		);
		const dup = payload.menu.find(
			(entry) => entry.id === CTX_MENU_IDS.duplicatePreset,
		);
		expect(dup).toBeDefined();
		expect(dup?.label).toBe("Duplicate");
	});

	it("enables Duplicate only when the preset resolves and CEP is available", () => {
		const enabledPayload = buildWorkspaceContextMenuPayload(
			{ zone: "preset-row", presetId: "p-1" },
			baseState,
			{ canUndo: false, canRedo: false },
			{ isCep: true, hostCode: "AEFT" },
		);
		const enabledRow = enabledPayload.menu.find(
			(entry) => entry.id === CTX_MENU_IDS.duplicatePreset,
		);
		expect(enabledRow?.enabled).toBe(true);

		const noCepPayload = buildWorkspaceContextMenuPayload(
			{ zone: "preset-row", presetId: "p-1" },
			baseState,
			{ canUndo: false, canRedo: false },
			{ isCep: false, hostCode: "AEFT" },
		);
		const noCepRow = noCepPayload.menu.find(
			(entry) => entry.id === CTX_MENU_IDS.duplicatePreset,
		);
		expect(noCepRow?.enabled).toBe(false);

		const unknownPayload = buildWorkspaceContextMenuPayload(
			{ zone: "preset-row", presetId: "missing" },
			baseState,
			{ canUndo: false, canRedo: false },
			{ isCep: true, hostCode: "AEFT" },
		);
		const unknownRow = unknownPayload.menu.find(
			(entry) => entry.id === CTX_MENU_IDS.duplicatePreset,
		);
		expect(unknownRow?.enabled).toBe(false);
	});
});

describe("buildWorkspaceContextMenuPayload (directory-browser zone, Issue #141)", () => {
	const baseState: Pick<
		SurfaceState,
		| "layoutLocked"
		| "presets"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presetHoverId"
		| "panelPresetIds"
		| "panelId"
		| "openedGroupPresetId"
		| "groupCatalogEntries"
		| "widgetInstanceTypes"
	> = {
		layoutLocked: false,
		presets: [
			{
				id: "p-1",
				type: "preset",
				title: "Sample",
				filePath: "/preset/root/sample.ffx",
			},
		],
		surfaceTiles: [
			{ id: "widget-directory-browser", x: 0, y: 0, width: 1, height: 1 },
		],
		selectedSurfaceIndices: [],
		presetSelectedIds: [],
		presetHoverId: null,
		panelPresetIds: [],
		panelId: "panel-1",
		openedGroupPresetId: null,
		groupCatalogEntries: [],
		widgetInstanceTypes: { "widget-directory-browser": "directory-browser" },
	};

	const build = (hit: Parameters<typeof buildWorkspaceContextMenuPayload>[0]) =>
		buildWorkspaceContextMenuPayload(
			hit,
			baseState,
			{ canUndo: false, canRedo: false },
			{
				isCep: true,
				hostCode: "AEFT",
			},
		);

	it("dir row: Open / Refresh / Go up", () => {
		const payload = build({
			zone: "directory-browser",
			placementId: "0",
			entryKind: "dir",
			entryPath: "C:/demo/folder",
			canGoUp: true,
		});
		const ids = payload.menu.map((e) => e.id);
		expect(ids).toEqual([
			`${CTX_MENU_IDS.dirBrowserOpenDirPrefix}${encodeURIComponent("C:/demo/folder")}`,
			CTX_MENU_IDS.dirBrowserRefresh,
			CTX_MENU_IDS.dirBrowserGoUp,
		]);
	});

	it("dir row: disables Go up when the widget reports canGoUp=false", () => {
		const payload = build({
			zone: "directory-browser",
			entryKind: "dir",
			entryPath: "C:/demo/folder",
			canGoUp: false,
		});
		const goUp = payload.menu.find((e) => e.id === CTX_MENU_IDS.dirBrowserGoUp);
		expect(goUp?.enabled).toBe(false);
	});

	it("up-row (empty dir path): no Open item", () => {
		const payload = build({
			zone: "directory-browser",
			entryKind: "dir",
			entryPath: "",
		});
		const ids = payload.menu.map((e) => e.id);
		expect(
			ids.some((id) => id?.startsWith(CTX_MENU_IDS.dirBrowserOpenDirPrefix)),
		).toBe(false);
		expect(ids).toContain(CTX_MENU_IDS.dirBrowserRefresh);
		expect(ids).toContain(CTX_MENU_IDS.dirBrowserGoUp);
	});

	it("file row: Select / Import / Refresh / Go up, no audio preview for non-audio", () => {
		const payload = build({
			zone: "directory-browser",
			entryKind: "file",
			entryPath: "C:/demo/preset.ffx",
			fileType: "image",
		});
		const ids = payload.menu.map((e) => e.id);
		expect(ids).toEqual([
			`${CTX_MENU_IDS.dirBrowserSelectPrefix}${encodeURIComponent("C:/demo/preset.ffx")}`,
			`${CTX_MENU_IDS.dirBrowserImportPrefix}${encodeURIComponent("C:/demo/preset.ffx")}`,
			CTX_MENU_IDS.dirBrowserRefresh,
			CTX_MENU_IDS.dirBrowserGoUp,
		]);
		const select = payload.menu.find((e) =>
			e.id?.startsWith(CTX_MENU_IDS.dirBrowserSelectPrefix),
		);
		expect(select?.label).toBe("Select");
	});

	it("file row: shows Deselect when the path is the widget's selected file", () => {
		const payload = build({
			zone: "directory-browser",
			entryKind: "file",
			entryPath: "C:/demo/preset.ffx",
			selectedFilePath: "C:/demo/preset.ffx",
		});
		const select = payload.menu.find((e) =>
			e.id?.startsWith(CTX_MENU_IDS.dirBrowserSelectPrefix),
		);
		expect(select?.label).toBe("Deselect");
	});

	it("audio file row: adds Play audio preview", () => {
		const payload = build({
			zone: "directory-browser",
			entryKind: "file",
			entryPath: "C:/demo/take.wav",
			fileType: "audio",
		});
		const ids = payload.menu.map((e) => e.id);
		expect(ids).toContain(
			`${CTX_MENU_IDS.dirBrowserAudioPreviewPrefix}${encodeURIComponent("C:/demo/take.wav")}`,
		);
	});

	it("preset catalog row: reuses the preset-row menu (Run/Edit/Duplicate/Delete/Move to panel)", () => {
		const payload = build({
			zone: "directory-browser",
			placementId: "0",
			entryKind: "preset",
			entryPath: "/preset/root/sample.ffx",
			presetId: "p-1",
		});
		const ids = payload.menu.map((e) => e.id);
		expect(ids).toContain(CTX_MENU_IDS.runPreset);
		expect(ids).toContain(CTX_MENU_IDS.editPreset);
		expect(ids).toContain(CTX_MENU_IDS.duplicatePreset);
		expect(ids).toContain(CTX_MENU_IDS.deletePreset);
		expect(ids).toContain(CTX_MENU_IDS.movePresetToPanelMenuRoot);
		// Row ops must NOT leak widget/browser chrome items.
		expect(ids).not.toContain(CTX_MENU_IDS.dirBrowserRefresh);
		expect(ids).not.toContain(CTX_MENU_IDS.dirBrowserGoUp);
	});

	it("body hit: browser chrome ops + widget Move to panel / Delete", () => {
		const payload = build({
			zone: "directory-browser",
			placementId: "0",
			canGoUp: true,
		});
		const ids = payload.menu.map((e) => e.id);
		for (const id of [
			CTX_MENU_IDS.dirBrowserRefresh,
			CTX_MENU_IDS.dirBrowserGoUp,
			CTX_MENU_IDS.dirBrowserBrowseDrives,
			CTX_MENU_IDS.dirBrowserToggleFilters,
			CTX_MENU_IDS.dirBrowserClearSearch,
			CTX_MENU_IDS.dirBrowserDefaultDir,
		]) {
			expect(ids).toContain(id);
		}
		// Widget-level ops: Move to panel targets the widget tile, Delete the widget.
		expect(ids).toContain(CTX_MENU_IDS.moveWidgetToPanelMenuRoot);
		expect(ids).toContain(CTX_MENU_IDS.deleteWorkspaceWidget);
	});
});

describe("buildWorkspaceContextMenuPayload (menu widget, Issue #170)", () => {
	const baseState: Pick<
		SurfaceState,
		| "layoutLocked"
		| "presets"
		| "surfaceTiles"
		| "selectedSurfaceIndices"
		| "presetSelectedIds"
		| "presetHoverId"
		| "panelPresetIds"
		| "panelId"
		| "openedGroupPresetId"
		| "groupCatalogEntries"
		| "widgetInstanceTypes"
	> = {
		layoutLocked: false,
		presets: [],
		surfaceTiles: [{ id: "widget-menu", x: 0, y: 0, width: 1, height: 1 }],
		selectedSurfaceIndices: [],
		presetSelectedIds: [],
		presetHoverId: null,
		panelPresetIds: [],
		panelId: "panel-1",
		openedGroupPresetId: null,
		groupCatalogEntries: [],
		widgetInstanceTypes: { "widget-menu": "menu" },
	};

	it("does not offer the dormant Preset Library dialog", () => {
		const payload = buildWorkspaceContextMenuPayload(
			{ zone: "workspace-placement", id: "0" },
			baseState,
			{ canUndo: false, canRedo: false },
			{ isCep: true, hostCode: "AEFT" },
		);
		const ids = payload.menu.map((entry) => entry.id);
		// R0 has no catalog backend, so the entry was a dead affordance.
		expect(ids).not.toContain(CTX_MENU_IDS.openPresetLibrary);
		// The offline-capable dialog entries stay.
		expect(ids).toContain(CTX_MENU_IDS.openPresets);
		expect(ids).toContain(CTX_MENU_IDS.openMessages);
		expect(ids).toContain(CTX_MENU_IDS.openSettings);
		expect(ids).toContain(CTX_MENU_IDS.openDebug);
	});
});
