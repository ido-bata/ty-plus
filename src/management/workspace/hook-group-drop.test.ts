/**
 * Source-level checks for the workspace hook's group-drop wiring
 * (Issue #86).
 *
 * `useWorkspaceRuntime` is closure-bound over CEP, persistence, the
 * workspace bus, and several side-effecting event listeners. Spinning
 * up the full hook for a single wiring check is impractical, so we
 * verify the wiring at the source level — both that the production
 * call to `setupInteractionEvents` actually passes the callbacks AND
 * that the menu handler `case CTX_MENU_IDS.releaseGroupPreset` exists.
 *
 * Behavioral coverage of the extracted pure logic lives in
 * `src/management/preset/group/group-release.test.ts`.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = fs.readFileSync(
	new URL("./hook.ts", import.meta.url),
	"utf8",
);
const handlerSource = fs.readFileSync(
	new URL("./events/handler.ts", import.meta.url),
	"utf8",
);
const eventsSource = fs.readFileSync(
	new URL("../preset/group/events.ts", import.meta.url),
	"utf8",
);
const constantsSource = fs.readFileSync(
	new URL(
		"../dialog/dialogs/unified-context-menu-constants.ts",
		import.meta.url,
	),
	"utf8",
);

describe("useWorkspaceRuntime hook (group drop wiring — Issue #86)", () => {
	it("imports the extracted releaseGroupPreset helper from preset/group/group-release", () => {
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\breleaseGroupPreset\b[^}]*\}\s*from\s*["']@\/management\/preset\/group\/group-release["']/,
		);
		expect(hookSource).toMatch(
			/import\s*\{[^}]*\breleaseDropPlacementFromState\b[^}]*\}\s*from\s*["']@\/management\/preset\/group\/group-release["']/,
		);
	});

	it("exports releaseGroupPreset and dropPlacement helper from the module under test", () => {
		const helperSource = fs.readFileSync(
			new URL("../preset/group/group-release.ts", import.meta.url),
			"utf8",
		);
		expect(helperSource).toMatch(/export\s+const\s+releaseGroupPreset/);
		expect(helperSource).toMatch(
			/export\s+const\s+releaseDropPlacementFromState/,
		);
	});

	it("declares the CTX_MENU_IDS.releaseGroupPreset constant", () => {
		expect(constantsSource).toMatch(
			/\breleaseGroupPreset\s*:\s*["']ty\.ctx\.release-group-preset["']/,
		);
	});

	it("registers the releaseGroupPreset menu case in handleUnifiedCtxSelect", () => {
		// Source-level: the case must exist AND route through the helper.
		const caseMatch = hookSource.match(
			/case\s+CTX_MENU_IDS\.releaseGroupPreset\s*:\s*\{([\s\S]*?)\n\t\t\t\t\}/,
		);
		expect(caseMatch).not.toBeNull();
		const body = caseMatch?.[1] ?? "";
		// The dissolve work goes through the pure helper.
		expect(body).toContain("releaseGroupPreset(");
		// And the local panel state is updated to drop the row.
		expect(body).toMatch(/groupCatalogEntries/);
		expect(body).toMatch(/surfaceTiles/);
		// And a cross-panel event is dispatched so peers refresh.
		expect(body).toMatch(/dispatchGroupWorkspaceRequest/);
		expect(body).toMatch(/type:\s*["']release["']/);
	});

	it("wires onPresetDropToGroup into setupInteractionEvents (Direction A)", () => {
		expect(hookSource).toMatch(
			/onPresetDropToGroup\s*:\s*\(?\s*\{[\s\S]*?\}\s*\)?\s*:/,
		);
		// The Direction A handler must rewrite groups.json (upsertGroupEntry)
		// and broadcast removal so the dropped tiles disappear from the grid.
		expect(hookSource).toMatch(/upsertGroupEntry/);
		expect(hookSource).toMatch(/isDeletion:\s*true/);
	});

	it("wires onGroupDrop into setupInteractionEvents (Direction C)", () => {
		expect(hookSource).toMatch(
			/onGroupDrop\s*:\s*\(?\s*\{[\s\S]*?\}\s*\)?\s*:/,
		);
		// The Direction C handler delegates to the extracted helper.
		const onGroupDropMatch = hookSource.match(
			/onGroupDrop\s*:\s*\(\{[^}]*\}\)\s*:\s*boolean\s*=>\s*\{([\s\S]*?)\n\t\t\t\t\},/,
		);
		expect(onGroupDropMatch).not.toBeNull();
		const body = onGroupDropMatch?.[1] ?? "";
		expect(body).toContain("releaseGroupPreset(");
	});

	it("declares onGroupDrop in EventsOptions (handler.ts)", () => {
		expect(handlerSource).toMatch(
			/onGroupDrop\?:\s*\(payload:\s*\{[\s\S]*?\}\s*\)\s*=>\s*boolean/,
		);
	});

	it("extends the GROUP_WORKSPACE_EVENT union with a 'release' type", () => {
		// The dispatcher contract must cover both the original toggle-open
		// and the new release event.
		expect(eventsSource).toMatch(/type:\s*["']toggle-open["']/);
		expect(eventsSource).toMatch(/type:\s*["']release["']/);
		// The dispatcher function still emits one event with a tagged union.
		expect(eventsSource).toMatch(/export\s+type\s+GroupWorkspaceRequest\s*=/);
	});

	it("handles the 'release' event in onGroupWorkspaceRequest", () => {
		// The bus listener must route on the union type, not just toggle-open.
		const listenerMatch = hookSource.match(
			/const\s+onGroupWorkspaceRequest\s*=\s*\(ev:\s*Event\)\s*:\s*void\s*=>\s*\{([\s\S]*?)\n\t\t\};/,
		);
		expect(listenerMatch).not.toBeNull();
		const body = listenerMatch?.[1] ?? "";
		expect(body).toMatch(/detail\.type\s*===\s*["']toggle-open["']/);
		expect(body).toMatch(/detail\.type\s*===\s*["']release["']/);
	});
});
