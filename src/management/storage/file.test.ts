/**
 * Tests for file-management.ts path utilities.
 *
 * Two invariants are pinned here (Issue #216):
 *  1. an absolute root stays absolute in every resolver (POSIX `/…` and
 *     Windows `C:\…`), a relative root stays relative;
 *  2. every resolver that overlaps the `PATHS` registry returns exactly the
 *     string the registry returns for the same file.
 */

import { describe, expect, it } from "vitest";
import { resolveInitializationLocatorPath } from "@/management/setting/onboarding/initialization";
import { PATHS } from "@/management/storage/persistence/paths";
import {
	joinPath,
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
	describe("joinPath (Issue #216 — absolute roots must survive)", () => {
		it("keeps the leading separator of a POSIX absolute first segment", () => {
			expect(joinPath("/abs/root", "settings", "ui.json")).toBe(
				"/abs/root/settings/ui.json",
			);
			expect(joinPath("/abs/root/", "settings")).toBe("/abs/root/settings");
			expect(joinPath("/", "settings")).toBe("/settings");
		});

		it("keeps a Windows absolute first segment intact", () => {
			expect(joinPath("C:\\abs\\root", "settings", "ui.json")).toBe(
				"C:\\abs\\root/settings/ui.json",
			);
			expect(joinPath("C:/abs/root", "settings")).toBe("C:/abs/root/settings");
		});

		it("keeps a UNC share's leading separator pair", () => {
			expect(joinPath("\\\\server\\share", "settings")).toBe(
				"\\\\server\\share/settings",
			);
		});

		it("leaves a relative first segment relative", () => {
			expect(joinPath("root/child", "settings", "ui.json")).toBe(
				"root/child/settings/ui.json",
			);
			expect(joinPath("root/", "child")).toBe("root/child");
		});

		it("trims separator runs at the joints", () => {
			expect(joinPath("/abs/root/", "/settings/", "/ui.json")).toBe(
				"/abs/root/settings/ui.json",
			);
		});

		it("ignores empty segments", () => {
			expect(joinPath("", "settings")).toBe("settings");
			expect(joinPath("/abs/root", "", "ui.json")).toBe("/abs/root/ui.json");
		});
	});

	describe("resolveManagedRoot", () => {
		it("appends /ty-plus to an absolute base root and keeps it absolute", () => {
			expect(resolveManagedRoot("/path/to/support")).toBe(
				"/path/to/support/ty-plus",
			);
			expect(resolveManagedRoot("/abs/base")).toBe("/abs/base/ty-plus");
		});

		it("keeps a Windows absolute base root absolute", () => {
			expect(resolveManagedRoot("C:\\abs\\base")).toBe("C:\\abs\\base/ty-plus");
		});

		it("keeps a relative base root relative", () => {
			expect(resolveManagedRoot("path/to/support")).toBe(
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
				"/path/to/support/ty-plus",
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
				"/path/to/app/ty-plus-init.json",
			);
		});
	});

	describe("resolveSettingsAppJsonPath", () => {
		it("returns supportRoot/settings/app.json", () => {
			expect(resolveSettingsAppJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/settings/app.json",
			);
		});
	});

	describe("resolveSettingsPathsJsonPath", () => {
		it("returns supportRoot/settings/paths.json", () => {
			expect(resolveSettingsPathsJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/settings/paths.json",
			);
		});
	});

	describe("resolveSettingsUiJsonPath", () => {
		it("returns supportRoot/settings/ui.json", () => {
			expect(resolveSettingsUiJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/settings/ui.json",
			);
		});

		it("keeps a POSIX absolute root absolute (Issue #216 AC)", () => {
			expect(resolveSettingsUiJsonPath("/abs/root")).toBe(
				"/abs/root/settings/ui.json",
			);
		});

		it("keeps a Windows absolute root absolute", () => {
			expect(resolveSettingsUiJsonPath("C:\\abs\\root")).toBe(
				"C:\\abs\\root/settings/ui.json",
			);
		});

		it("keeps a relative root relative", () => {
			expect(resolveSettingsUiJsonPath("root/child")).toBe(
				"root/child/settings/ui.json",
			);
		});
	});

	describe("resolveControlPanelJsonPath", () => {
		it("returns supportRoot/settings/control-panel.json", () => {
			expect(resolveControlPanelJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/settings/control-panel.json",
			);
		});
	});

	describe("resolvePanelChromeJsonPath", () => {
		it("returns supportRoot/panels/panel-N.json", () => {
			expect(resolvePanelChromeJsonPath("/support/ty-plus", 1)).toBe(
				"/support/ty-plus/panels/panel-1.json",
			);
			expect(resolvePanelChromeJsonPath("/support/ty-plus", 5)).toBe(
				"/support/ty-plus/panels/panel-5.json",
			);
		});
	});

	describe("resolvePanelJsonPath", () => {
		it("returns supportRoot/workspaces/workspace-N.json", () => {
			expect(resolvePanelJsonPath("/support/ty-plus", 1)).toBe(
				"/support/ty-plus/workspaces/workspace-1.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 2)).toBe(
				"/support/ty-plus/workspaces/workspace-2.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 3)).toBe(
				"/support/ty-plus/workspaces/workspace-3.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 4)).toBe(
				"/support/ty-plus/workspaces/workspace-4.json",
			);
			expect(resolvePanelJsonPath("/support/ty-plus", 5)).toBe(
				"/support/ty-plus/workspaces/workspace-5.json",
			);
		});
	});

	describe("resolvePresetsJsonPath", () => {
		it("returns supportRoot/presets/presets.json", () => {
			expect(resolvePresetsJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/presets/presets.json",
			);
		});
	});

	describe("resolveGroupsJsonPath", () => {
		it("returns supportRoot/groups/groups.json", () => {
			expect(resolveGroupsJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/groups/groups.json",
			);
		});
	});

	describe("resolveWidgetsJsonPath", () => {
		it("returns supportRoot/widgets/widgets.json", () => {
			expect(resolveWidgetsJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/widgets/widgets.json",
			);
		});
	});

	describe("resolveWidgetStateJsonPath", () => {
		it("returns supportRoot/widgets/state/<stateName>.json", () => {
			expect(
				resolveWidgetStateJsonPath("/support/ty-plus", "directory-browser"),
			).toBe("/support/ty-plus/widgets/state/directory-browser.json");
			expect(
				resolveWidgetStateJsonPath("/support/ty-plus", "file-browser"),
			).toBe("/support/ty-plus/widgets/state/file-browser.json");
		});
	});

	describe("resolveSnapshotsJsonPath", () => {
		it("returns supportRoot/workspaces/history/snapshots.json (shared across all panels)", () => {
			expect(resolveSnapshotsJsonPath("/support/ty-plus")).toBe(
				"/support/ty-plus/workspaces/history/snapshots.json",
			);
		});
	});

	describe("resolveStylesThemeCssPath", () => {
		it("returns supportRoot/styles/theme.css", () => {
			expect(resolveStylesThemeCssPath("/support/ty-plus")).toBe(
				"/support/ty-plus/styles/theme.css",
			);
		});
	});

	describe("resolveCssPath", () => {
		it("returns supportRoot/styles/workspaces/workspace-N.css (1-5)", () => {
			expect(resolveCssPath("/support/ty-plus", 1)).toBe(
				"/support/ty-plus/styles/workspaces/workspace-1.css",
			);
			expect(resolveCssPath("/support/ty-plus", 2)).toBe(
				"/support/ty-plus/styles/workspaces/workspace-2.css",
			);
			expect(resolveCssPath("/support/ty-plus", 3)).toBe(
				"/support/ty-plus/styles/workspaces/workspace-3.css",
			);
			expect(resolveCssPath("/support/ty-plus", 4)).toBe(
				"/support/ty-plus/styles/workspaces/workspace-4.css",
			);
			expect(resolveCssPath("/support/ty-plus", 5)).toBe(
				"/support/ty-plus/styles/workspaces/workspace-5.css",
			);
		});
	});

	describe("resolveLogPath", () => {
		it("returns supportRoot/logs/ty-plus.log", () => {
			expect(resolveLogPath("/support/ty-plus")).toBe(
				"/support/ty-plus/logs/ty-plus.log",
			);
		});
	});

	/**
	 * Issue #216 happened because two path systems covered one directory and
	 * only the `PATHS` one kept the absolute root. Every overlapping pair is
	 * pinned here so the systems cannot disagree again.
	 */
	describe("agreement with the PATHS registry", () => {
		const posixRoot = "/Applications/Adobe After Effects 2026/ty-plus";
		const windowsRoot = "C:\\Program Files\\Adobe\\ty-plus";

		const agreement: Array<
			[string, (root: string) => string, (root: string) => string]
		> = [
			["settings/app.json", resolveSettingsAppJsonPath, PATHS.app],
			["settings/paths.json", resolveSettingsPathsJsonPath, PATHS.paths],
			["settings/ui.json", resolveSettingsUiJsonPath, PATHS.ui],
			[
				"settings/control-panel.json",
				resolveControlPanelJsonPath,
				PATHS.controlPanel,
			],
			["presets/presets.json", resolvePresetsJsonPath, PATHS.presetCatalog],
			["groups/groups.json", resolveGroupsJsonPath, PATHS.groupCatalog],
			["widgets/widgets.json", resolveWidgetsJsonPath, PATHS.widgetRecords],
			[
				"panels/panel-3.json",
				(root) => resolvePanelChromeJsonPath(root, 3),
				(root) => PATHS.panelChrome(root, 3),
			],
			[
				"workspaces/workspace-4.json",
				(root) => resolvePanelJsonPath(root, 4),
				(root) => PATHS.workspace(root, 4),
			],
			[
				"workspaces/history/snapshots.json",
				resolveSnapshotsJsonPath,
				PATHS.snapshots,
			],
			[
				"widgets/state/easing.json",
				(root) => resolveWidgetStateJsonPath(root, "easing"),
				(root) => PATHS.widgetState(root, "easing"),
			],
		];

		it.each(agreement)(
			"%s resolves identically from both systems (POSIX root)",
			(_file, fromResolvers, fromRegistry) => {
				expect(fromResolvers(posixRoot)).toBe(fromRegistry(posixRoot));
				expect(fromResolvers(posixRoot)).toBe(`${posixRoot}/${_file}`);
			},
		);

		it.each(agreement)(
			"%s resolves identically from both systems (Windows root)",
			(_file, fromResolvers, fromRegistry) => {
				expect(fromResolvers(windowsRoot)).toBe(fromRegistry(windowsRoot));
				expect(fromResolvers(windowsRoot)).toBe(`${windowsRoot}/${_file}`);
			},
		);

		it("agrees on the managed root both systems start from", () => {
			const managedRoot = resolveManagedRoot(
				"/Applications/Adobe After Effects 2026",
			);
			expect(managedRoot).toBe(
				"/Applications/Adobe After Effects 2026/ty-plus",
			);
			expect(PATHS.ui(managedRoot)).toBe(
				resolveSettingsUiJsonPath(managedRoot),
			);
		});

		/**
		 * The onboarding locator file has a second spelling in
		 * `setting/onboarding/initialization`, which normalises `\` to `/`.
		 * Before the fix the two disagreed: this one was cwd-relative while
		 * that one kept the absolute app folder, so different readers of
		 * `ty-plus-init.json` looked in different places.
		 */
		it("agrees with the onboarding locator spelling of ty-plus-init.json", () => {
			const normalize = (p: string): string => p.replace(/\\/g, "/");
			for (const root of ["/abs/app", "C:\\abs\\app", "app/relative"]) {
				expect(normalize(resolveLocatorPathFromAppRoot(root))).toBe(
					normalize(resolveInitializationLocatorPath(root)),
				);
			}
			expect(resolveLocatorPathFromAppRoot("/abs/app")).toBe(
				"/abs/app/ty-plus-init.json",
			);
		});
	});
});
