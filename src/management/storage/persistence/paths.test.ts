import { describe, expect, it } from "vitest";
import { PATHS } from "./paths";

describe("PATHS registry", () => {
	const root = "/x/ty-plus";

	it("settings paths land under settings/", () => {
		expect(PATHS.app(root)).toBe("/x/ty-plus/settings/app.json");
		expect(PATHS.paths(root)).toBe("/x/ty-plus/settings/paths.json");
		expect(PATHS.ui(root)).toBe("/x/ty-plus/settings/ui.json");
		expect(PATHS.controlPanel(root)).toBe(
			"/x/ty-plus/settings/control-panel.json",
		);
	});

	it("catalog files live in their own dirs (no data/ prefix)", () => {
		expect(PATHS.presetCatalog(root)).toBe("/x/ty-plus/presets/presets.json");
		expect(PATHS.groupCatalog(root)).toBe("/x/ty-plus/groups/groups.json");
		expect(PATHS.widgetRecords(root)).toBe("/x/ty-plus/widgets/widgets.json");
	});

	it("widget state is per-name under widgets/state/", () => {
		expect(PATHS.widgetState(root, "easing")).toBe(
			"/x/ty-plus/widgets/state/easing.json",
		);
	});

	it("workspaces are numbered 1..5", () => {
		expect(PATHS.workspace(root, 1)).toBe(
			"/x/ty-plus/workspaces/workspace-1.json",
		);
		expect(PATHS.workspaceBg(root, 5)).toBe(
			"/x/ty-plus/workspaces/background/background-5.json",
		);
		expect(PATHS.snapshots(root)).toBe(
			"/x/ty-plus/workspaces/history/snapshots.json",
		);
	});

	it("cache holds notifications, remote presets, public links, and candidates", () => {
		expect(PATHS.notifications(root)).toBe(
			"/x/ty-plus/cache/notifications.json",
		);
		expect(PATHS.remotePresets(root)).toBe(
			"/x/ty-plus/cache/remote-presets.json",
		);
		expect(PATHS.publicLinks(root)).toBe("/x/ty-plus/cache/public-links.json");
		expect(PATHS.candidates(root)).toBe("/x/ty-plus/cache/candidates.json");
		expect(PATHS.candidatesChunk(root, "abc")).toBe(
			"/x/ty-plus/cache/candidates/abc.json",
		);
	});

	it("never contains the literal data/ segment", () => {
		const samples = [
			PATHS.app(root),
			PATHS.presetCatalog(root),
			PATHS.workspace(root, 1),
			PATHS.candidates(root),
		];
		for (const p of samples) {
			expect(p).not.toMatch(/\/data\//);
		}
	});
});
