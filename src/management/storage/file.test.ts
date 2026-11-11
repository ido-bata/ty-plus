/**
 * Tests for file-management.ts path utilities.
 */

import { describe, expect, it } from "vitest";
import {
	resolveBrowseRoot,
	resolveControlPanelJsonPath,
	resolveCssPath,
	resolveGroupsJsonPath,
	resolveLocatorPathFromAppRoot,
	resolveLogPath,
	resolveManagedRoot,
	resolvePanelChromeJsonPath,
	resolvePanelJsonPath,
	resolvePresetsJsonPath,
	resolveSettingsAppJsonPath,
	resolveSettingsPathsJsonPath,
	resolveSettingsUiJsonPath,
	resolveSnapshotsJsonPath,
	resolveStylesThemeCssPath,
	resolveWidgetStateJsonPath,
	resolveWidgetsJsonPath,
} from "./file";

describe("file-management path utilities", () => {
	describe("resolveManagedRoot", () => {
		it("appends /ty-plus to base root", () => {
			expect(resolveManagedRoot("/path/to/support")).toBe(
				"path/to/support/ty-plus",
			);
		});

		it("does not append ty-plus if already present", () => {
			expect(resolveManagedRoot("/path/to/support/ty-plus")).toBe(
				"/path/to/support/ty-plus",
			);
		});

		it("handles trailing slashes", () => {
			expect(resolveManagedRoot("/path/to/support/")).toBe(
				"path/to/support/ty-plus",
			);
		});

		it("case-insensitive check for existing ty-plus", () => {
			expect(resolveManagedRoot("/path/to/support/TY-PLUS")).toBe(
				"/path/to/support/TY-PLUS",
			);
		});
	});

	describe("resolveBrowseRoot", () => {
		it("strips /ty-plus from managed root", () => {
			expect(resolveBrowseRoot("/path/to/support/ty-plus")).toBe(
				"/path/to/support",
			);
		});

		it("handles trailing slashes", () => {
			expect(resolveBrowseRoot("/path/to/support/ty-plus/")).toBe(
				"/path/to/support",
			);
		});

		it("case-insensitive strip", () => {
			expect(resolveBrowseRoot("/path/to/support/TY-PLUS")).toBe(
				"/path/to/support",
			);
		});
	});

	describe("resolveLocatorPathFromAppRoot", () => {
		it("returns appRoot/ty-plus-init.json", () => {
			expect(resolveLocatorPathFromAppRoot("/path/to/app")).toBe(
				"path/to/app/ty-plus-init.json",
			);
		});
	});

	describe("resolveSettingsAppJsonPath", () => {
		it("returns supportRoot/settings/app.json", () => {
			expect(resolveSettingsAppJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/settings/app.json",
			);
		});
	});

	describe("resolveSettingsPathsJsonPath", () => {
		it("returns supportRoot/settings/paths.json", () => {
			expect(resolveSettingsPathsJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/settings/paths.json",
			);
		});
	});

	describe("resolveSettingsUiJsonPath", () => {
		it("returns supportRoot/settings/ui.json", () => {
			expect(resolveSettingsUiJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/settings/ui.json",
			);
		});
	});

	describe("resolveControlPanelJsonPath", () => {
		it("returns supportRoot/settings/control-panel.json", () => {
			expect(resolveControlPanelJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/settings/control-panel.json",
			);
		});
	});

	describe("resolvePanelChromeJsonPath", () => {
		it("returns supportRoot/panels/panel-N.json", () => {
			expect(resolvePanelChromeJsonPath("/support/ty-plus", 1)).toBe(
				"support/ty-plus/panels/panel-1.json",
			);
			expect(resolvePanelChromeJsonPath("/support/ty-plus", 5)).toBe(
				"support/ty-plus/panels/panel-5.json",
			);
		});
	});

	describe("resolvePanelJsonPath", () => {
		it("returns supportRoot/workspaces/workspace-N.json", () => {
			expect(resolvePanelJsonPath("/support/ty-plus", 1)).toBe(
				"support/ty-plus/workspaces/workspace-1.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 2)).toBe(
				"support/ty-plus/workspaces/workspace-2.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 3)).toBe(
				"support/ty-plus/workspaces/workspace-3.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 4)).toBe(
				"support/ty-plus/workspaces/workspace-4.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 5)).toBe(
				"support/ty-plus/workspaces/workspace-5.json",
			);
		});
	});

	describe("resolvePresetsJsonPath", () => {
		it("returns supportRoot/presets/presets.json", () => {
			expect(resolvePresetsJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/presets/presets.json",
			);
		});
	});

	describe("resolveGroupsJsonPath", () => {
		it("returns supportRoot/groups/groups.json", () => {
			expect(resolveGroupsJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/groups/groups.json",
			);
		});
	});

	describe("resolveWidgetsJsonPath", () => {
		it("returns supportRoot/widgets/widgets.json", () => {
			expect(resolveWidgetsJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/widgets/widgets.json",
			);
		});
	});

	describe("resolveWidgetStateJsonPath", () => {
		it("returns supportRoot/widgets/state/<stateName>.json", () => {
			expect(
				resolveWidgetStateJsonPath("/support/ty-plus", "directory-browser"),
			).toBe("support/ty-plus/widgets/state/directory-browser.json");
			expect(
				resolveWidgetStateJsonPath("/support/ty-plus", "file-browser"),
			).toBe("support/ty-plus/widgets/state/file-browser.json");
		});
	});

	describe("resolveSnapshotsJsonPath", () => {
		it("returns supportRoot/workspaces/history/snapshots.json (shared across all panels)", () => {
			expect(resolveSnapshotsJsonPath("/support/ty-plus")).toBe(
				"support/ty-plus/workspaces/history/snapshots.json",
			);
		});
	});

	describe("resolveStylesThemeCssPath", () => {
		it("returns supportRoot/styles/theme.css", () => {
			expect(resolveStylesThemeCssPath("/support/ty-plus")).toBe(
				"support/ty-plus/styles/theme.css",
			);
		});
	});

	describe("resolveCssPath", () => {
		it("returns supportRoot/styles/workspaces/workspace-N.css", () => {
			expect(resolveCssPath("/support/ty-plus", 1)).toBe(
				"support/ty-plus/styles/workspaces/workspace-1.css",
			);
			expect(resolveCssPath("/support/ty-plus", 2)).toBe(
				"support/ty-plus/styles/workspaces/workspace-2.css",
			);
			expect(resolveCssPath("/support/ty-plus", 3)).toBe(
				"support/ty-plus/styles/workspaces/workspace-3.css",
			);
			expect(resolveCssPath("/support/ty-plus", 4)).toBe(
				"support/ty-plus/styles/workspaces/workspace-4.css",
			);
			expect(resolveCssPath("/support/ty-plus", 5)).toBe(
				"support/ty-plus/styles/workspaces/workspace-5.css",
			);
		});
	});

	describe("resolveLogPath", () => {
		it("returns supportRoot/logs/ty-plus.log", () => {
			expect(resolveLogPath("/support/ty-plus")).toBe(
				"support/ty-plus/logs/ty-plus.log",
			);
		});
	});
});
