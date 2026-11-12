import { describe, expect, it } from "vitest";
import {
	coerceSettings,
	DEFAULT_SETTINGS,
	mergeSettings,
} from "../models/settings";
import { mergeOwnedSettingsIntoSettingsJson } from "./index";

/**
 * Ownership boundary for `settings/app.json`.
 *
 * The settings layer and the workspace layer write the same file. Two
 * failures are possible and both are user-data loss:
 *
 *   - writing only the settings keys deletes `workspace.workspacePanels` and
 *     `workspace.snapshots` (group/preset placement, named layouts);
 *   - writing a stale in-memory copy resurrects workspace keys the workspace
 *     layer has since cleared.
 *
 * These cases pin the read-modify-write contract that avoids both.
 */

const onDisk = () => ({
	version: 2,
	core: {
		paths: { supportRoot: "/support", presetRoot: "" },
		presetScan: { timeoutMs: 30000, maxFiles: 5000 },
	},
	ui: { language: "en", theme: "dark", updateChannel: "stable" },
	workspace: {
		grid: { cellSize: 96, gap: 8, radius: 12 },
		workspacePanels: { "panel-1": { presetIds: ["a", "b"] } },
		snapshots: { "panel-1": [{ id: "s1" }] },
	},
	controlPanel: { position: "right", orientation: "vertical" },
});

describe("settings write ownership", () => {
	it("preserves workspace data it does not own", () => {
		const loaded = coerceSettings(onDisk());
		const written = mergeOwnedSettingsIntoSettingsJson(onDisk(), loaded);
		const workspace = written.workspace as Record<string, unknown>;
		expect(workspace.workspacePanels).toEqual({
			"panel-1": { presetIds: ["a", "b"] },
		});
		expect(workspace.snapshots).toEqual({ "panel-1": [{ id: "s1" }] });
		expect(written.controlPanel).toEqual({
			position: "right",
			orientation: "vertical",
		});
	});

	it("does not resurrect workspace data cleared after load", () => {
		// Panel loads the document, then the workspace layer clears its
		// placement and snapshots on disk.
		const loaded = coerceSettings(onDisk());
		const cleared = onDisk();
		cleared.workspace = { grid: cleared.workspace.grid } as never;
		delete (cleared as { controlPanel?: unknown }).controlPanel;

		const written = mergeOwnedSettingsIntoSettingsJson(cleared, loaded);
		const workspace = written.workspace as Record<string, unknown>;
		expect(workspace).not.toHaveProperty("workspacePanels");
		expect(workspace).not.toHaveProperty("snapshots");
		expect(written).not.toHaveProperty("controlPanel");
		// ...while still writing the change that triggered the save.
		expect((written.ui as Record<string, unknown>).updateChannel).toBe(
			loaded.ui.updateChannel,
		);
	});

	it("writes a channel change without dropping sibling ui fields", () => {
		const loaded = coerceSettings(onDisk());
		const changed = mergeSettings(loaded, { ui: { updateChannel: "insider" } });
		const written = mergeOwnedSettingsIntoSettingsJson(onDisk(), changed);
		const ui = written.ui as Record<string, unknown>;
		expect(ui.updateChannel).toBe("insider");
		expect(ui.theme).toBe("dark");
		expect(ui.language).toBe("en");
	});

	it("writes only owned keys, never an arbitrary in-memory key", () => {
		const polluted = {
			...DEFAULT_SETTINGS,
			somethingElse: { secret: "x" },
		} as unknown as typeof DEFAULT_SETTINGS;
		const written = mergeOwnedSettingsIntoSettingsJson({}, polluted);
		expect(written).not.toHaveProperty("somethingElse");
	});

	it("tolerates a missing or corrupt settings file", () => {
		for (const onDisk of [undefined, null, "garbage", []]) {
			expect(() =>
				mergeOwnedSettingsIntoSettingsJson(onDisk, DEFAULT_SETTINGS),
			).not.toThrow();
		}
	});
});
