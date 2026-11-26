import { describe, expect, it } from "vitest";

import type { Preset } from "@/management/preset/contract";
import type { GroupCatalogEntry } from "@/management/preset/group/catalog";
import type { SurfaceState } from "@/management/workspace/core/state";
import { createInitialSurfaceState } from "@/management/workspace/core/state";

import { pruneStalePresetRefs } from "./selection";

const preset = (id: string): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `C:/presets/${id}.ffx`,
});

const group = (id: string): GroupCatalogEntry => ({
	id,
	title: id,
	presetIds: [],
});

function makeState(overrides: Partial<SurfaceState> = {}): SurfaceState {
	return {
		...createInitialSurfaceState({ mode: "live" }),
		presets: [preset("preset-1"), preset("preset-2")],
		groupCatalogEntries: [group("group-1")],
		presetHoverId: "preset-1",
		presetFocusId: "group-1",
		presetSelectedIds: ["preset-1", "group-1", "preset-2"],
		...overrides,
	};
}

describe("pruneStalePresetRefs (Issue #701)", () => {
	it("returns the same reference when every ref resolves", () => {
		const state = makeState();
		expect(pruneStalePresetRefs(state)).toBe(state);
	});

	it("drops refs missing from presets and groupCatalogEntries", () => {
		const state = makeState({
			presetHoverId: "deleted-preset",
			presetFocusId: "deleted-focus",
			presetSelectedIds: ["preset-1", "ghost", "group-1", "deleted-group"],
		});
		const next = pruneStalePresetRefs(state);
		expect(next).not.toBe(state);
		expect(next.presetHoverId).toBeNull();
		expect(next.presetFocusId).toBeNull();
		expect(next.presetSelectedIds).toEqual(["preset-1", "group-1"]);
	});

	it("clears every ref when the catalog no longer contains them", () => {
		const state = makeState({
			presets: [],
			groupCatalogEntries: [],
		});
		const next = pruneStalePresetRefs(state);
		expect(next.presetHoverId).toBeNull();
		expect(next.presetFocusId).toBeNull();
		expect(next.presetSelectedIds).toEqual([]);
	});

	it("treats group catalog ids as known refs", () => {
		const state = makeState({
			presetHoverId: "group-1",
			presetSelectedIds: ["group-1"],
		});
		expect(pruneStalePresetRefs(state)).toBe(state);
	});
});
