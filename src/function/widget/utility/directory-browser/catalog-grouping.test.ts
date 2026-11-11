/**
 * Pure unit tests for the catalog-grouping partition helper.
 * No DOM, no React — the helper is intentionally side-effect-free so the
 * layout decision (which groups render, which presets are ungrouped) can be
 * verified without spinning up the full panel.
 */

import { describe, expect, it } from "vitest";

import type { Preset } from "@/management/preset/contract";
import type { GroupEntry } from "@/management/preset/group-catalog";

import { partitionCatalogPresetsByGroup } from "./partition-catalog-presets";

function preset(id: string, title = id): Preset {
	return {
		id,
		title,
		filePath: `/preset/root/${id}.ffx`,
		type: "preset",
	};
}

function group(id: string, title: string, presetIds: string[]): GroupEntry {
	return { id, title, presetIds };
}

describe("partitionCatalogPresetsByGroup", () => {
	it("returns every preset as ungrouped when there are no groups", () => {
		const ps = [preset("a"), preset("b")];
		const result = partitionCatalogPresetsByGroup(ps, []);
		expect(result.grouped).toEqual([]);
		expect(result.ungrouped.map((p) => p.id)).toEqual(["a", "b"]);
	});

	it("places all presets in matching groups and leaves nothing ungrouped", () => {
		const ps = [preset("a"), preset("b")];
		const gs = [group("g1", "G1", ["a", "b"])];
		const result = partitionCatalogPresetsByGroup(ps, gs);
		expect(result.grouped).toHaveLength(1);
		expect(result.grouped[0]?.group.id).toBe("g1");
		expect(result.grouped[0]?.presets.map((p) => p.id)).toEqual(["a", "b"]);
		expect(result.ungrouped).toEqual([]);
	});

	it("splits presets between grouped and ungrouped", () => {
		const ps = [preset("a"), preset("b"), preset("c")];
		const gs = [group("g1", "G1", ["a"])];
		const result = partitionCatalogPresetsByGroup(ps, gs);
		expect(result.grouped[0]?.presets.map((p) => p.id)).toEqual(["a"]);
		expect(result.ungrouped.map((p) => p.id).sort()).toEqual(["b", "c"]);
	});

	it("lets a preset appear in multiple groups", () => {
		const ps = [preset("a"), preset("b")];
		const gs = [group("g1", "G1", ["a"]), group("g2", "G2", ["a", "b"])];
		const result = partitionCatalogPresetsByGroup(ps, gs);
		expect(result.grouped).toHaveLength(2);
		expect(result.grouped[0]?.presets.map((p) => p.id)).toEqual(["a"]);
		expect(result.grouped[1]?.presets.map((p) => p.id)).toEqual(["a", "b"]);
		// `a` is in both groups, so it does not show up in ungrouped.
		expect(result.ungrouped.map((p) => p.id)).toEqual([]);
	});

	it("drops groups whose presetIds resolve to zero presets in the slice", () => {
		const ps = [preset("a")];
		const gs = [
			group("g1", "G1", ["a"]),
			group("g2", "G2", ["missing-1", "missing-2"]),
		];
		const result = partitionCatalogPresetsByGroup(ps, gs);
		expect(result.grouped).toHaveLength(1);
		expect(result.grouped[0]?.group.id).toBe("g1");
		expect(result.ungrouped).toEqual([]);
	});

	it("returns every preset as ungrouped when presets is empty", () => {
		const gs = [group("g1", "G1", ["a"])];
		const result = partitionCatalogPresetsByGroup([], gs);
		expect(result.grouped).toEqual([]);
		expect(result.ungrouped).toEqual([]);
	});

	it("skips presets that are in the groups file but absent from the current slice", () => {
		const ps = [preset("a"), preset("c")];
		const gs = [group("g1", "G1", ["a", "b", "c"])];
		const result = partitionCatalogPresetsByGroup(ps, gs);
		// `b` is missing from `ps` and is silently dropped.
		expect(result.grouped[0]?.presets.map((p) => p.id)).toEqual(["a", "c"]);
		expect(result.ungrouped).toEqual([]);
	});

	it("handles parseGroupFromText('') → empty groups gracefully", async () => {
		const { parseGroupFromText } = await import(
			"@/management/preset/group-catalog"
		);
		const groups = parseGroupFromText("");
		const ps = [preset("a")];
		const result = partitionCatalogPresetsByGroup(ps, groups);
		expect(result.grouped).toEqual([]);
		expect(result.ungrouped.map((p) => p.id)).toEqual(["a"]);
	});
});
