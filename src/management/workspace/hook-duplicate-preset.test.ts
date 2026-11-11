// @vitest-environment happy-dom
/**
 * Behavioral coverage for the right-click "Duplicate" preset handler
 * (Issue #82).
 *
 * The handler lives inside `useWorkspaceRuntime`'s
 * `handleUnifiedCtxSelect` switch, which is closure-bound over CEP,
 * persistence, the workspace bus, and a long list of side-effecting event
 * listeners. Spinning up the full hook for a single case is impractical.
 *
 * Instead we cover the deterministic pieces extracted into
 * `hook-duplicate-preset.ts`:
 *
 * - `resolveDuplicateHit` decides which preset to duplicate and where to
 *   drop the result (same grid cell for `workspace-placement`, auto-pack
 *   for `preset-row`).
 * - `computeNextPresetSelectedIds` decides the next multi-selection list.
 * - `runDuplicatePreset` orchestrates the duplicate → commit → persist →
 *   notify sequence with all side effects injected, so the test suite can
 *   verify the exact call sequence and arguments without reaching into
 *   the workspace runtime.
 *
 * Source-level wiring (the switch case existing at all, the imports, etc.)
 * is covered by `hook.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "@/management/preset/contract";
import {
	computeNextPresetSelectedIds,
	resolveDuplicateHit,
	runDuplicatePreset,
} from "@/management/workspace/hook-duplicate-preset";
import type { SurfaceState } from "@/management/workspace/state";

const basePreset: Preset = {
	id: "source-1",
	type: "preset",
	title: "Source Preset",
	filePath: "/path/to/source.ffx",
	description: "source description",
	icon: { type: "text", param: { text: "SP" } },
	data: { foo: "bar" },
};

const baseSurfaceState: Pick<SurfaceState, "presets" | "surfaceTiles"> = {
	presets: [basePreset],
	surfaceTiles: [
		{ id: "source-1", x: 2, y: 3, width: 1, height: 2 },
		{ id: "another-tile", x: 5, y: 0, width: 1, height: 1 },
	],
};

describe("resolveDuplicateHit", () => {
	it("returns the source preset id and drop placement equal to the source tile for workspace-placement hits", () => {
		const hit = { zone: "workspace-placement", id: "0" } as const;
		const result = resolveDuplicateHit(hit, baseSurfaceState);
		expect(result).not.toBeNull();
		expect(result?.catalogId).toBe("source-1");
		expect(result?.source.id).toBe("source-1");
		expect(result?.dropPlacement).toEqual({
			x: 2,
			y: 3,
			width: 1,
			height: 2,
		});
	});

	it("returns the source preset id and an undefined dropPlacement for preset-row hits (auto-pack)", () => {
		const hit = { zone: "preset-row", presetId: "source-1" } as const;
		const result = resolveDuplicateHit(hit, baseSurfaceState);
		expect(result).not.toBeNull();
		expect(result?.catalogId).toBe("source-1");
		expect(result?.source.id).toBe("source-1");
		expect(result?.dropPlacement).toBeUndefined();
	});

	it("returns null when the workspace-placement index does not resolve to a known preset", () => {
		const hit = { zone: "workspace-placement", id: "999" } as const;
		const result = resolveDuplicateHit(hit, baseSurfaceState);
		expect(result).toBeNull();
	});

	it("returns null when the preset-row hit's presetId is not in the catalog", () => {
		const hit = { zone: "preset-row", presetId: "unknown" } as const;
		const result = resolveDuplicateHit(hit, baseSurfaceState);
		expect(result).toBeNull();
	});

	it("returns null when the workspace-placement index is not a finite number", () => {
		const hit = { zone: "workspace-placement", id: "not-a-number" } as const;
		const result = resolveDuplicateHit(hit, baseSurfaceState);
		expect(result).toBeNull();
	});

	it("trims whitespace from preset-row presetId", () => {
		const hit = { zone: "preset-row", presetId: "  source-1  " } as const;
		const result = resolveDuplicateHit(hit, baseSurfaceState);
		expect(result?.catalogId).toBe("source-1");
	});
});

describe("computeNextPresetSelectedIds", () => {
	it("puts newId at the head and preserves every other id", () => {
		const next = computeNextPresetSelectedIds(
			["source-1", "preset-x"],
			"new-1",
		);
		expect(next).toEqual(["new-1", "source-1", "preset-x"]);
	});

	it("keeps source-1 (the original) highlighted after duplicate", () => {
		// Acceptance criterion: "片方は選択ハイライト継続". The original id
		// must remain in the list so its highlight is preserved.
		const next = computeNextPresetSelectedIds(["source-1"], "new-1");
		expect(next).toContain("source-1");
		expect(next[0]).toBe("new-1");
	});

	it("deduplicates newId when it was already in the list", () => {
		const next = computeNextPresetSelectedIds(["new-1", "source-1"], "new-1");
		expect(next.filter((id) => id === "new-1")).toHaveLength(1);
		expect(next[0]).toBe("new-1");
		expect(next).toContain("source-1");
	});

	it("returns just newId when the list was empty", () => {
		expect(computeNextPresetSelectedIds([], "new-1")).toEqual(["new-1"]);
	});
});

describe("runDuplicatePreset (orchestration)", () => {
	type NotifyInput = {
		sourceSurfaceId: string;
		catalogRefIds: readonly string[];
		dropPlacement?: { x: number; y: number; width: number; height: number };
	};
	type CommitInput = { presetSelectedIds: string[] };

	let duplicateMock: ReturnType<
		typeof vi.fn<(source: Preset, newId: string) => Promise<Preset>>
	>;
	let notifyMock: ReturnType<
		typeof vi.fn<(win: Window, input: NotifyInput) => Promise<void>>
	>;
	let commitMock: ReturnType<typeof vi.fn<(next: CommitInput) => void>>;
	let persistMock: ReturnType<typeof vi.fn<() => void>>;

	beforeEach(() => {
		duplicateMock = vi.fn(async (source: Preset, newId: string) => ({
			...source,
			id: newId,
			parentId: source.id,
		}));
		notifyMock = vi.fn(async () => undefined);
		commitMock = vi.fn();
		persistMock = vi.fn();
	});

	it("forwards source tile geometry as dropPlacement for workspace-placement hits", async () => {
		const newId = "duplicate-id-1";
		await runDuplicatePreset({
			window,
			panelId: "panel-1",
			source: basePreset,
			newId,
			dropPlacement: { x: 2, y: 3, width: 1, height: 2 },
			currentPresetSelectedIds: ["source-1"],
			duplicatePresetFn: duplicateMock,
			notifyPanelsAfterPresetSaveFn: notifyMock,
			commit: commitMock,
			persistSurfaceState: persistMock,
		});

		expect(notifyMock).toHaveBeenCalledTimes(1);
		const input = notifyMock.mock.calls[0]?.[1] as {
			dropPlacement: { x: number; y: number; width: number; height: number };
		};
		expect(input.dropPlacement).toEqual({
			x: 2,
			y: 3,
			width: 1,
			height: 2,
		});
	});

	it("passes dropPlacement: undefined for preset-row hits (auto-pack)", async () => {
		await runDuplicatePreset({
			window,
			panelId: "panel-1",
			source: basePreset,
			newId: "duplicate-id-2",
			dropPlacement: undefined,
			currentPresetSelectedIds: ["source-1"],
			duplicatePresetFn: duplicateMock,
			notifyPanelsAfterPresetSaveFn: notifyMock,
			commit: commitMock,
			persistSurfaceState: persistMock,
		});

		expect(notifyMock).toHaveBeenCalledTimes(1);
		const input = notifyMock.mock.calls[0]?.[1] as {
			dropPlacement: unknown;
		};
		expect(input.dropPlacement).toBeUndefined();
	});

	it("puts the new id at the head of presetSelectedIds and retains the source id", async () => {
		await runDuplicatePreset({
			window,
			panelId: "panel-1",
			source: basePreset,
			newId: "duplicate-id-3",
			dropPlacement: { x: 0, y: 0, width: 1, height: 1 },
			currentPresetSelectedIds: ["source-1", "preset-x"],
			duplicatePresetFn: duplicateMock,
			notifyPanelsAfterPresetSaveFn: notifyMock,
			commit: commitMock,
			persistSurfaceState: persistMock,
		});

		expect(commitMock).toHaveBeenCalledTimes(1);
		const committed = commitMock.mock.calls[0]?.[0] as {
			presetSelectedIds: string[];
		};
		expect(committed.presetSelectedIds[0]).toBe("duplicate-id-3");
		expect(committed.presetSelectedIds).toContain("source-1");
		expect(committed.presetSelectedIds).toContain("preset-x");
	});

	it("calls persistSurfaceState after commit so the selection change is flushed to disk", async () => {
		const order: string[] = [];
		commitMock.mockImplementation(() => order.push("commit"));
		persistMock.mockImplementation(() => order.push("persist"));
		duplicateMock.mockImplementation(async () => {
			order.push("duplicate");
			return { ...basePreset, id: "x", parentId: "source-1" };
		});
		notifyMock.mockImplementation(async () => {
			order.push("notify");
		});

		await runDuplicatePreset({
			window,
			panelId: "panel-1",
			source: basePreset,
			newId: "x",
			dropPlacement: undefined,
			currentPresetSelectedIds: [],
			duplicatePresetFn: duplicateMock,
			notifyPanelsAfterPresetSaveFn: notifyMock,
			commit: commitMock,
			persistSurfaceState: persistMock,
		});

		expect(order).toEqual(["duplicate", "commit", "persist", "notify"]);
	});

	it("surfaces the new preset id (not the source) in the catalogRefIds of the notify call", async () => {
		await runDuplicatePreset({
			window,
			panelId: "panel-1",
			source: basePreset,
			newId: "duplicate-id-4",
			dropPlacement: undefined,
			currentPresetSelectedIds: [],
			duplicatePresetFn: duplicateMock,
			notifyPanelsAfterPresetSaveFn: notifyMock,
			commit: commitMock,
			persistSurfaceState: persistMock,
		});

		expect(notifyMock).toHaveBeenCalledTimes(1);
		const input = notifyMock.mock.calls[0]?.[1] as {
			catalogRefIds: readonly string[];
			sourceSurfaceId: string;
		};
		expect(input.catalogRefIds).toEqual(["duplicate-id-4"]);
		expect(input.sourceSurfaceId).toBe("panel-1");
	});
});
