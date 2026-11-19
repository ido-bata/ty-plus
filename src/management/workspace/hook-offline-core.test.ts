/**
 * Source-level contract checks for issue 139 (offline-core).
 *
 * Local preset reads/writes in the workspace hook must go through the
 * file-backed local catalog (`listPresets` / `getPreset` from
 * `@/management/preset/operations`), never through `getDataServices()` —
 * the cloud boot boundary that throws `GatewayBootRequiredError` when the
 * gateway has not booted (degraded / offline / unimplemented network).
 *
 * Spinning up the full hook for this is impractical (CEP, persistence,
 * bus, and event listeners), so — like `hook.test.ts` — these checks pin
 * the wiring at the source level.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);
const persistFolderGroupSource = fs.readFileSync(
	new URL("../preset/group/persist-folder.ts", import.meta.url),
	"utf8",
);
const onboardingViewSource = fs.readFileSync(
	new URL("../../function/onboarding/View.tsx", import.meta.url),
	"utf8",
);

describe("useWorkspaceRuntime hook — offline-core preset access (issue 139)", () => {
	it("does not call getDataServices() — the cloud boot boundary", () => {
		expect(hookSource).not.toMatch(/\bgetDataServices\s*\(/);
		expect(hookSource).not.toMatch(
			/import\s*\{[^}]*\bgetDataServices\b[^}]*\}\s*from\s*["']@\/management\/workspace\/services["']/,
		);
	});

	it("reads the preset list via the local-catalog use-case", () => {
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\blistPresets\b[^}]*\}\s*from\s*["']@\/management\/preset\/operations["']/,
		);
		expect(hookSource).toMatch(/\blistPresets\s*\(\s*\)/);
	});

	it("resolves single presets via getPreset (local-first, cloud fallback)", () => {
		expect(hookSource).toMatch(/\bgetPreset\s*\(\s*id\s*\)/);
	});
});

describe("persistFolderGroupPreset — offline-core (issue 139)", () => {
	it("does not call getDataServices() on the folder-scan path", () => {
		expect(persistFolderGroupSource).not.toMatch(/\bgetDataServices\s*\(/);
	});

	it("imports presets through the local preset catalog", () => {
		expect(persistFolderGroupSource).toMatch(
			/import\s*\{[^}]*\bgetLocalPresetCatalog\b[^}]*\}\s*from\s*["']@\/management\/preset\/repository\/local-catalog["']/,
		);
		expect(persistFolderGroupSource).toMatch(
			/\bgetLocalPresetCatalog\s*\(\s*win\s*\)/,
		);
	});
});

describe("onboarding preset import — offline-core (issue 139)", () => {
	it("does not require online services for preset import", () => {
		expect(onboardingViewSource).not.toMatch(/\bgetDataServices\s*\(/);
		expect(onboardingViewSource).toMatch(
			/import\s*\{[^}]*\bgetLocalPresetCatalog\b[^}]*\}\s*from\s*["']@\/management\/preset\/repository\/local-catalog["']/,
		);
	});
});

describe("useWorkspaceRuntime hook — issue 139 residual failure paths", () => {
	const reloadStart = hookSource.indexOf(
		"const reloadLayoutFromStorage = async",
	);
	const reloadEnd = hookSource.indexOf("let layoutReloadChain");
	const reloadBody =
		reloadStart > -1 && reloadEnd > reloadStart
			? hookSource.slice(reloadStart, reloadEnd)
			: "";

	it("isolates preset catalog failure from the layout restore reads", () => {
		// A corrupt presets.json rejects the strict local catalog parser;
		// inside Promise.all that used to classify the whole restore as a
		// read failure and keep the write gate closed forever.
		expect(hookSource).toContain(
			"const readPresetsForLayoutRestore = async (): Promise<Preset[]>",
		);
		expect(hookSource).toMatch(
			/readPresetsForLayoutRestore[\s\S]*?return await listPresets\(\);[\s\S]*?workspaceLog\.warn\([\s\S]*?return \[\];/,
		);
		expect(reloadBody).toContain("readPresetsForLayoutRestore(),");
		expect(reloadBody).not.toContain("listPresets(),");
	});

	it("logs the initial preset load failure instead of swallowing it", () => {
		const start = hookSource.indexOf("void listPresets()");
		const end = hookSource.indexOf("// ── Layout reload", start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const block = hookSource.slice(start, end);
		expect(block).toContain("initial preset list load failed");
		expect(block).not.toContain(".catch(() => {})");
	});

	it("catches refreshPresets rejections on the CEP path", () => {
		// Every caller uses `void refreshPresets()`; both branches must
		// resolve. The non-CEP branch already catches — the CEP branch is
		// the one that used to reject out of the async IIFE.
		expect(
			hookSource.match(/\[Workspace\] preset list refresh failed/g)?.length,
		).toBeGreaterThanOrEqual(2);
		expect(hookSource).toMatch(
			/return \(async \(\) => \{\s*try \{\s*const presets = await listPresets\(\);/,
		);
	});

	it("catches the deletePreset confirm/notify flow", () => {
		const caseStart = hookSource.indexOf("case CTX_MENU_IDS.deletePreset");
		const caseEnd = hookSource.indexOf(
			"case CTX_MENU_IDS.removePresetFromOpenedGroup",
		);
		expect(caseStart).toBeGreaterThan(-1);
		expect(caseEnd).toBeGreaterThan(caseStart);
		const body = hookSource.slice(caseStart, caseEnd);
		// askHostDeleteConfirm and notifyPanelsAfterPresetSave used to sit
		// outside any try, so a rejection escaped the void'd IIFE.
		expect(body).toContain("preset delete flow failed");
		expect(body.indexOf("askHostDeleteConfirm")).toBeLessThan(
			body.indexOf("preset delete flow failed"),
		);
	});
});
