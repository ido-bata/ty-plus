import fs from "node:fs";
import { describe, expect, test } from "vitest";

const unifiedSource = fs.readFileSync(
	new URL("./unified-context-menu.ts", import.meta.url),
	"utf8",
);
const contextMenuSource = fs.readFileSync(
	new URL("./context-menu.ts", import.meta.url),
	"utf8",
);
const settingsContextMenuBuildSource = fs.readFileSync(
	new URL(
		"../../setting/dialog/settings-context-menu-build.ts",
		import.meta.url,
	),
	"utf8",
);
const settingsContextMenuIdsSource = fs.readFileSync(
	new URL("../../setting/dialog/settings-context-menu-ids.ts", import.meta.url),
	"utf8",
);
const toolShellContextMenuSource = fs.readFileSync(
	new URL("../../preset/tool-shell/context-menu.ts", import.meta.url),
	"utf8",
);
const constantsSource = fs.readFileSync(
	new URL("./unified-context-menu-constants.ts", import.meta.url),
	"utf8",
);
const fontViewerSource = fs.readFileSync(
	new URL(
		"../../../function/widget/utility/font-viewer/Component.tsx",
		import.meta.url,
	),
	"utf8",
);
const directoryBrowserSource = fs.readFileSync(
	new URL("../../storage/ui/DirectoryBrowser.tsx", import.meta.url),
	"utf8",
);
const easingSource = fs.readFileSync(
	new URL(
		"../../../function/widget/core/easing/Component.tsx",
		import.meta.url,
	),
	"utf8",
);
const settingsDialogSource = fs.readFileSync(
	new URL("../../setting/dialog/Settings.tsx", import.meta.url),
	"utf8",
);
const settingsMenuSource = fs.readFileSync(
	new URL(
		"../../setting/dialog/useSettingsDialogContextMenu.ts",
		import.meta.url,
	),
	"utf8",
);
const widgetSelectorSource = fs.readFileSync(
	new URL("../../widget/add-dialog.tsx", import.meta.url),
	"utf8",
);
const widgetCatalogSource = fs.readFileSync(
	new URL("../../widget/catalog.tsx", import.meta.url),
	"utf8",
);
const backgroundDialogSource = fs.readFileSync(
	new URL("../../workspace/background/Dialog.tsx", import.meta.url),
	"utf8",
);
const presetLibrarySource = fs.readFileSync(
	new URL("../../online/catalog/Dialog.tsx", import.meta.url),
	"utf8",
);
const notificationsSource = fs.readFileSync(
	new URL("../../online/notification/Center.tsx", import.meta.url),
	"utf8",
);
const dialogRootSource = fs.readFileSync(
	new URL("../Root.tsx", import.meta.url),
	"utf8",
);

describe("unified workspace context menu composition", () => {
	test("builds widget Move/Delete from one base menu only", () => {
		expect(unifiedSource).toContain("function buildWorkspacePlacementBaseMenu");
		expect(unifiedSource).toContain(
			"...buildWorkspacePlacementBaseMenu(wid, state, opts)",
		);
		expect(
			unifiedSource.match(/moveWidgetToPanelMenuRoot/g) ?? [],
		).toHaveLength(1);
		expect(unifiedSource.match(/deleteWorkspaceWidget/g) ?? []).toHaveLength(1);
	});

	test("routes font viewer actions through unified menu instead of local HTML menu", () => {
		expect(constantsSource).toContain("fontViewerTileSquare");
		expect(unifiedSource).toContain("function buildFontViewerContextMenu");
		expect(unifiedSource).toContain(
			'if (widgetType === "fonts" || widgetType === "font")',
		);
		expect(fontViewerSource).toContain("ty-plus:font-viewer-context-menu");
		expect(fontViewerSource).not.toContain("setCtxMenu");
		expect(fontViewerSource).not.toContain("onFontListContextMenu");
	});

	test("lets unified workspace hit-test directory browser entries directly", () => {
		expect(directoryBrowserSource).toContain("data-directory-browser-body");
		expect(directoryBrowserSource).toContain("data-directory-browser-entry");
		expect(directoryBrowserSource).toContain("data-entry-kind");
		expect(directoryBrowserSource).not.toContain("onContextMenu={");
		expect(unifiedSource).toContain('zone: "directory-browser"');
		expect(unifiedSource).toContain("placementId?: string");
	});

	test("registers dialog-settings CEP JSON context menu with dialog and field actions", () => {
		expect(settingsDialogSource).toContain("useSettingsDialogContextMenu");
		expect(settingsMenuSource).toContain(
			"registerCepJsonContextMenuSurface(SETTINGS_DIALOG_SURFACE_ID",
		);
		expect(settingsMenuSource).toContain("SETTINGS_CTX.dialogSave");
		expect(settingsDialogSource).toContain("data-settings-footer");
	});

	test("routes easing widget actions through the unified CEP menu", () => {
		expect(constantsSource).toContain("easingApplyCurrent");
		expect(unifiedSource).toContain("function buildEasingContextMenu");
		expect(unifiedSource).toContain('widgetType === "easing"');
		expect(unifiedSource).toContain('wid === "widget-easing"');
		expect(easingSource).toContain("ty-plus:easing-context-command");
		expect(easingSource).toContain('data-ws-action="easing-apply-current"');
	});

	test("registers widget selector context menu with widget-specific actions", () => {
		expect(widgetSelectorSource).toContain(
			"registerCepJsonContextMenuSurface(DIALOG_SURFACE_ID",
		);
		expect(widgetCatalogSource).toContain("data-add-widget-type");
		expect(widgetSelectorSource).toContain("Add this widget");
		expect(widgetSelectorSource).toContain("Add selected widget");
		expect(widgetSelectorSource).toContain("checkable: true");
		expect(widgetSelectorSource).not.toContain("generic");
	});

	test("registers background panel context menu with layer hierarchy and checked state", () => {
		expect(backgroundDialogSource).toContain(
			"registerCepJsonContextMenuSurface(PANEL_ID",
		);
		expect(backgroundDialogSource).toContain("data-background-layer-id");
		expect(backgroundDialogSource).toContain('label: "Layer Type"');
		expect(backgroundDialogSource).toContain('label: "Order"');
		expect(backgroundDialogSource).toContain("checkable: true");
		expect(backgroundDialogSource).not.toContain("generic");
	});

	test("gives probe and unknown dialogs explicit surface actions", () => {
		expect(dialogRootSource).toContain("ty.ctx.probe.log-surface");
		expect(dialogRootSource).toContain("ty.ctx.unknown-dialog.copy-surface-id");
		expect(dialogRootSource).toContain("registerCepJsonContextMenuSurface");
	});

	test("keeps shell catalog and message dialogs on explicit context menus", () => {
		expect(presetLibrarySource).toContain("data-surface-id={SURFACE_ID}");
		expect(presetLibrarySource).toContain("CTX.viewGallery");
		expect(presetLibrarySource).toContain("checkable: true");
		expect(notificationsSource).toContain('id: "ctx.close"');
		expect(notificationsSource).toContain("checked: isRead");
	});

	test("dialog context menu defaults to an empty payload (no non-functional Ty Plus header)", () => {
		// Regression: previously `defaultPayload` rendered a single disabled
		// `Ty Plus · ${surfaceId || "dialog"}` row, which surfaced as the
		// "no-action right-click remains" the user reported after override.
		expect(contextMenuSource).not.toContain("ty.ctx.dialog.header");
		expect(contextMenuSource).not.toContain(
			'`Ty Plus · ${surfaceId || "dialog"}`',
		);
		// The no-override / no-customMenu fallback must be an empty `CepMenuPayload`.
		expect(contextMenuSource).toContain(
			"customMenu ?? ({ menu: [] } as CepMenuPayload)",
		);
	});

	test("unified workspace prime menu is empty (no non-functional Ty Plus header)", () => {
		// Regression: the prime call used to inject a single disabled
		// "Ty Plus" item which survived until a payload overwrote it.
		expect(unifiedSource).not.toContain('Label="Ty Plus"');
		expect(unifiedSource).not.toContain('label: "Ty Plus"');
		expect(unifiedSource).not.toContain("ty.ctx.__prime");
		// The prime constants must now be empty menus.
		expect(unifiedSource).toMatch(/CEP_CTX_PRIME_XML\s*=\s*`<Menu><\/Menu>`/);
		expect(unifiedSource).toMatch(
			/CEP_CTX_PRIME_JSON\s*=\s*JSON\.stringify\(\{\s*menu:\s*\[\s*\]\s*\}\)/,
		);
	});

	test("dialog context menu treats `null` buildPayload as 'skip, let other listener take over'", () => {
		// When a surface registration returns `null` to mean "not my surface,
		// please don't override the menu", the onContextMenu path must bail
		// out without calling `setContextMenuByJSON` so a sibling listener
		// (e.g. the workspace menu) keeps the menu it set. The empty fallback
		// is reserved for the no-registration case.
		expect(contextMenuSource).toMatch(
			/if\s*\(\s*built\s*===\s*null\s*\)\s*\{[\s\S]{0,200}return\s*;?[\s\S]{0,40}\}/,
		);
		expect(contextMenuSource).toContain(
			"customMenu ?? ({ menu: [] } as CepMenuPayload)",
		);
	});

	test("settings dialog default fallback is empty (no Ty Plus · Settings header)", () => {
		// Regression: the user reported "Ty Plus · Settings" still showing up.
		// The default fallback in `buildSettingsContextMenuPayload` (the
		// `buildSettingsSurfaceDefaultMenu` export) must produce an empty
		// `CepMenuPayload` so generic-area right-clicks stay clean.
		expect(settingsContextMenuBuildSource).not.toMatch(
			/label:\s*"Ty Plus · Settings"/,
		);
		// `SETTINGS_CTX.headerClose` is unrelated; the check is for the
		// exact member `header` (no suffix). Use a word boundary.
		expect(settingsContextMenuBuildSource).not.toMatch(
			/\bSETTINGS_CTX\.header\b(?!Close)/,
		);
		// The exported default function must return `{ menu: [] }`.
		expect(settingsContextMenuBuildSource).toContain(
			"export function buildSettingsSurfaceDefaultMenu",
		);
		expect(settingsContextMenuBuildSource).toMatch(
			/export function buildSettingsSurfaceDefaultMenu[\s\S]{0,200}\{\s*menu:\s*\[\s*\]\s*\}/,
		);
		// The `ty.ctx.settings.header` id is now orphan and must be removed
		// from the IDs module to keep the contract lean.
		expect(settingsContextMenuIdsSource).not.toContain(
			'ty.ctx.settings.header"',
		);
		expect(settingsContextMenuIdsSource).not.toMatch(/^\s*header:\s*"/m);
		// `headerClose` (used in the [data-dialog-header] branch) is unrelated
		// and must remain.
		expect(settingsContextMenuIdsSource).toContain("headerClose:");
		expect(settingsContextMenuIdsSource).toContain(
			"ty.ctx.settings.header.close",
		);
	});

	test("preset tool-shell context menu has no Ty Plus header rows", () => {
		// Regression: all 4 tool-shell menu branches (data-dialog-header,
		// data-preset-tool-footer, data-preset-tool-area, default fallback)
		// used to inject `Ty Plus · ${surfaceId}` as a non-functional
		// header. Project rule: menus must only carry actionable rows.
		expect(toolShellContextMenuSource).not.toMatch(
			/label:\s*`Ty Plus · \$\{surfaceId\}`/,
		);
		expect(toolShellContextMenuSource).not.toMatch(
			/label:\s*`Ty Plus · \$\{surfaceId\} · \$\{name\}`/,
		);
		// The `header` id is orphan after the removal.
		expect(toolShellContextMenuSource).not.toContain("PRESET_TOOL_CTX.header");
		expect(toolShellContextMenuSource).not.toMatch(
			/header:\s*"ty\.ctx\.presetTool\.header"/,
		);
		// Each of the 4 branches must produce a menu without the header.
		// Use a coarse check: no `enabled: false` (the legacy header was
		// the only disabled row).
		expect(toolShellContextMenuSource).not.toContain("enabled: false");
	});
});
