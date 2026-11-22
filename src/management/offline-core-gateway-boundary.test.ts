/**
 * Source-level contract checks for issue 170 (offline-core residuals).
 *
 * Pins the remaining gateway-boot boundary violations found by the
 * offline-core audit (docs/architecture/offline-core.md):
 *
 * - `usePublicLink` must resolve build-time bundled URLs without touching
 *   `getDataServices()` — the throwing cloud boot boundary — and must read
 *   the persisted public-links cache, not only the module-level Map.
 * - The Preset Library catalog dialog has no R0 backend, so no menu surface
 *   may keep offering it as a live affordance.
 * - `PresetLibrary`'s `checkDownloaded` effect must use the non-throwing
 *   `tryGetDataServices` so an unbooted gateway cannot reject out of the
 *   `void`-ed async callback.
 * - Dead cloud-sync code paths (`_syncPresets`, `listPresetsForSnapshot`)
 *   stay deleted.
 *
 * Like `workspace/hook-offline-core.test.ts`, these are source checks: the
 * surfaces involved (CEP menus, modeless dialogs) are impractical to mount
 * in jsdom.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
	fs.readFileSync(new URL(path, import.meta.url), "utf8");

const usePublicLinkSource = read("./online/public-link/usePublicLink.ts");
const catalogDialogSource = read("./online/catalog/Dialog.tsx");
const unifiedContextMenuSource = read("./dialog/unified-context-menu.ts");
const widgetMenuSource = read("../function/widget/core/menu/Component.tsx");
const presetUseCasesSource = read("./preset/operations.ts");
const catalogUseCasesSource = read("./online/catalog/operations.ts");

describe("usePublicLink — gateway-independent bundled resolution (issue 170)", () => {
	it("does not call the throwing getDataServices() boundary", () => {
		expect(usePublicLinkSource).not.toMatch(/\bgetDataServices\s*\(/);
	});

	it("resolves via the build-time bundled link table", () => {
		expect(usePublicLinkSource).toMatch(
			/import\s*\{[^}]*\bresolveBundledPublicLink\b[^}]*\}\s*from\s*["']@\/management\/online\/public-link\/bundled["']/,
		);
		expect(usePublicLinkSource).toMatch(
			/\bresolveBundledPublicLink\s*\(\s*key\s*\)/,
		);
	});

	it("reads the persisted public-links cache file", () => {
		expect(usePublicLinkSource).toMatch(
			/import\s*\{[^}]*\breadPublicLinks\b[^}]*\}\s*from\s*["']@\/management\/storage\/read\/cache-store["']/,
		);
		expect(usePublicLinkSource).toMatch(/\breadPublicLinks\s*\(\s*window\s*\)/);
	});
});

describe("Preset Library dormant surface (issue 170)", () => {
	it("is not offered by the CEP workspace context menu", () => {
		expect(unifiedContextMenuSource).not.toMatch(
			/id:\s*CTX_MENU_IDS\.openPresetLibrary/,
		);
	});

	it("is not offered by the widget flyout menu", () => {
		expect(widgetMenuSource).not.toMatch(
			/action:\s*CTX_MENU_IDS\.openPresetLibrary/,
		);
	});
});

describe("PresetLibrary checkDownloaded — no unhandled rejection (issue 170)", () => {
	it("uses the non-throwing tryGetDataServices accessor", () => {
		expect(catalogDialogSource).not.toMatch(/\bgetDataServices\s*\(/);
		expect(catalogDialogSource).toMatch(
			/import\s*\{[^}]*\btryGetDataServices\b[^}]*\}\s*from\s*["']@\/management\/workspace\/core\/services["']/,
		);
	});
});

describe("dead cloud-sync code stays removed (issue 170)", () => {
	it("preset use-cases has no _syncPresets", () => {
		expect(presetUseCasesSource).not.toMatch(/\b_syncPresets\b/);
	});

	it("catalog use-cases has no listPresetsForSnapshot", () => {
		expect(catalogUseCasesSource).not.toMatch(/\blistPresetsForSnapshot\b/);
	});
});
