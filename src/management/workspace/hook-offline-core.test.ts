/**
 * Source-level contract checks for Issue #139 (offline-core).
 *
 * Local preset reads/writes in the workspace hook must go through the
 * file-backed local catalog (`listPresets` / `getPreset` from
 * `@/management/preset/use-cases`), never through `getDataServices()` —
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
	new URL("../preset/persist-folder-group.ts", import.meta.url),
	"utf8",
);
const onboardingViewSource = fs.readFileSync(
	new URL("../../function/onboarding/View.tsx", import.meta.url),
	"utf8",
);

describe("useWorkspaceRuntime hook — offline-core preset access (Issue #139)", () => {
	it("does not call getDataServices() — the cloud boot boundary", () => {
		expect(hookSource).not.toMatch(/\bgetDataServices\s*\(/);
		expect(hookSource).not.toMatch(
			/import\s*\{[^}]*\bgetDataServices\b[^}]*\}\s*from\s*["']@\/management\/workspace\/services["']/,
		);
	});

	it("reads the preset list via the local-catalog use-case", () => {
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\blistPresets\b[^}]*\}\s*from\s*["']@\/management\/preset\/use-cases["']/,
		);
		expect(hookSource).toMatch(/\blistPresets\s*\(\s*\)/);
	});

	it("resolves single presets via getPreset (local-first, cloud fallback)", () => {
		expect(hookSource).toMatch(/\bgetPreset\s*\(\s*id\s*\)/);
	});
});

describe("persistFolderGroupPreset — offline-core (Issue #139)", () => {
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

describe("onboarding preset import — offline-core (Issue #139)", () => {
	it("does not require the cloud gateway for preset import", () => {
		expect(onboardingViewSource).not.toMatch(/\bgetDataServices\s*\(/);
		expect(onboardingViewSource).toMatch(
			/import\s*\{[^}]*\bgetLocalPresetCatalog\b[^}]*\}\s*from\s*["']@\/management\/preset\/repository\/local-catalog["']/,
		);
	});
});
