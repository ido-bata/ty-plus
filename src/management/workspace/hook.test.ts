/**
 * Source-level checks for the workspace hook's `Duplicate` preset case
 * (Issue #82).
 *
 * The hook (`useWorkspaceRuntime`) wires the unified context menu callback
 * `handleUnifiedCtxSelect`, which contains the big switch over
 * `CTX_MENU_IDS.*`. Spinning up the full hook for a single case is not
 * practical — the hook depends on CEP, persistence, the workspace bus,
 * the easing widget cache, and a number of side-effecting event listeners.
 *
 * These tests verify the wiring at the source level:
 *
 * - `duplicatePreset` is imported from the preset use-case API.
 * - The `CTX_MENU_IDS.duplicatePreset` case routes through the extracted
 *   `runDuplicatePreset` orchestrator with a freshly generated id.
 * - The Duplicate case is registered next to `editPreset` / `deletePreset`
 *   in the switch.
 *
 * Behavioral coverage of the public API itself lives in
 * `src/management/preset/use-cases.test.ts`; the deterministic helpers
 * (`resolveDuplicateHit`, `computeNextPresetSelectedIds`,
 * `runDuplicatePreset`) are covered in
 * `src/management/workspace/hook-duplicate-preset.test.ts`; the menu
 * payload shape is covered by
 * `src/management/dialog/dialogs/unified-context-menu.test.ts`.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);
const helpersSource = fs.readFileSync(
	new URL("./hook-duplicate-preset.ts", import.meta.url),
	"utf8",
);
const constantsSource = fs.readFileSync(
	new URL(
		"../dialog/dialogs/unified-context-menu-constants.ts",
		import.meta.url,
	),
	"utf8",
);

describe("useWorkspaceRuntime hook (Duplicate preset case)", () => {
	it("imports duplicatePreset from the preset use-case API", () => {
		// Match either an inline import or a multi-name import — but require
		// the symbol to be named `duplicatePreset` and the source to be the
		// public use-case module.
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\bduplicatePreset\b[^}]*\}\s*from\s*["']@\/management\/preset\/use-cases["']/,
		);
	});

	it("imports the extracted Duplicate helpers from hook-duplicate-preset", () => {
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\bresolveDuplicateHit\b[^}]*\}\s*from\s*["']@\/management\/workspace\/hook-duplicate-preset["']/,
		);
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\brunDuplicatePreset\b[^}]*\}\s*from\s*["']@\/management\/workspace\/hook-duplicate-preset["']/,
		);
	});

	it("declares the CTX_MENU_IDS.duplicatePreset constant for menu routing", () => {
		expect(constantsSource).toMatch(
			/\bduplicatePreset\s*:\s*["']ty\.ctx\.duplicate-preset["']/,
		);
	});

	it("handles CTX_MENU_IDS.duplicatePreset through the runDuplicatePreset orchestrator", () => {
		// The switch case must exist and route through the orchestrator.
		const caseMatch = hookSource.match(
			/case\s+CTX_MENU_IDS\.duplicatePreset\s*:\s*\{([\s\S]*?)\n\t\t\t\t\}/,
		);
		expect(caseMatch).not.toBeNull();
		const body = caseMatch?.[1] ?? "";
		// The orchestrator owns the side effects (duplicate → commit →
		// persist → notify); the hook hands off to it.
		expect(body).toContain("runDuplicatePreset(");
		// The new id is generated via crypto.randomUUID() per the acceptance
		// criteria (no shared counter, no timestamp).
		expect(body).toMatch(/crypto\.randomUUID\s*\(\s*\)/);
	});

	it("threads dropPlacement through the orchestrator's notify call", () => {
		// The orchestrator helper must forward `dropPlacement` so
		// `workspace-placement` hits honor the source tile geometry.
		expect(helpersSource).toMatch(/notifyPanelsAfterPresetSaveFn/);
		expect(helpersSource).toMatch(/dropPlacement:\s*deps\.dropPlacement/);
	});

	it("registers the Duplicate case alongside the existing Edit / Delete cases", () => {
		// The switch in `handleUnifiedCtxSelect` must cover all three preset
		// case ids. We don't pin the source order — switch-case dispatch
		// doesn't depend on order — but we do require every case to exist.
		const editIdx = hookSource.indexOf("CTX_MENU_IDS.editPreset:");
		const duplicateIdx = hookSource.indexOf("CTX_MENU_IDS.duplicatePreset:");
		const deleteIdx = hookSource.indexOf("CTX_MENU_IDS.deletePreset:");
		expect(editIdx).toBeGreaterThan(-1);
		expect(duplicateIdx).toBeGreaterThan(-1);
		expect(deleteIdx).toBeGreaterThan(-1);
	});
});
