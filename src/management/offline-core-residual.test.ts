/**
 * Source-level contract checks for issue 170 (offline-core residuals)
 * and issue 193 (unsupported online surface removal).
 *
 * Pins the remaining gateway-boot boundary violations found by the
 * offline-core audit (docs/architecture/offline-core.md):
 *
 * - `usePublicLink` must resolve build-time bundled URLs without touching
 *   `getDataServices()` — the throwing cloud boot boundary — and must read
 *   the persisted public-links cache, not only the module-level Map.
 * - The Preset Library surface has no R0 backend, so every user-reachable
 *   affordance (status bar, context menus, tool dialog kind, dialog route,
 *   CEP manifest entry) must stay removed. The dormant service layer under
 *   `online/catalog/` (repository / gateway / sync) remains for a future
 *   backend per docs/architecture/offline-core.md.
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
const statusBarSource = read("./panel/control/StatusBar/Main.tsx");
const unifiedContextMenuConstantsSource = read(
	"./dialog/dialogs/unified-context-menu-constants.ts",
);
const unifiedContextMenuSource = read(
	"./dialog/dialogs/unified-context-menu.ts",
);
const widgetMenuSource = read("../function/widget/core/menu/Component.tsx");
const dialogRoutesSource = read("./dialog/routes.tsx");
const dialogIdsSource = read("./dialog/dialogs/ids.ts");
const surfaceIdSource = read("./dialog/modeless/surface-id.ts");
const cepConfigSource = read("../../cep.config.ts");
const presetUseCasesSource = read("./preset/use-cases.ts");

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

describe("Preset Library surface stays removed (issues 170/193)", () => {
	it("is not offered by the status bar", () => {
		expect(statusBarSource).not.toMatch(/presetLibrary/);
		expect(statusBarSource).not.toMatch(/dialog-preset-library/);
	});

	it("has no context-menu command id", () => {
		expect(unifiedContextMenuConstantsSource).not.toMatch(/openPresetLibrary/);
		expect(unifiedContextMenuSource).not.toMatch(/openPresetLibrary/);
		expect(widgetMenuSource).not.toMatch(/openPresetLibrary/);
	});

	it("has no dialog route, tool kind, or surface mapping", () => {
		expect(dialogRoutesSource).not.toMatch(/dialog-preset-library/);
		expect(dialogRoutesSource).not.toMatch(/PresetLibrary/);
		expect(dialogIdsSource).not.toMatch(/presetLibrary/);
		expect(dialogIdsSource).not.toMatch(/preset-library/);
		expect(surfaceIdSource).not.toMatch(/preset-library/);
	});

	it("has no CEP manifest extension entry", () => {
		expect(cepConfigSource).not.toMatch(/dialog-preset-library/);
	});
});

describe("dead cloud-sync code stays removed (issue 170)", () => {
	it("preset use-cases has no _syncPresets", () => {
		expect(presetUseCasesSource).not.toMatch(/\b_syncPresets\b/);
	});
});
