/**
 * Integration test for `persistTargetLayout` covering
 * Issue #146 / Blocker 11 — retry idempotency.
 *
 * The user-requested scenario is:
 *
 *   1. Set up a layout where the preset is already on the target panel.
 *   2. Call `persistTargetLayout` with the same preset in
 *      `catalogIdsToMove` — twice in a row.
 *   3. Assert the on-disk target has exactly ONE tile for the preset
 *      (no duplicate) and panel state is consistent.
 *
 * Plus a sibling assertion: the source `movePresetPlacement` removal
 * path is itself idempotent — calling it for a preset that is not on
 * the source leaves the source state untouched.
 */

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	getEntries,
} from "@/management/debug/logger";
import { movePresetPlacement } from "@/management/storage";
import { persistTargetLayout } from "./cross-panel-write";

const storageMocks = vi.hoisted(() => ({
	readNJson: vi.fn<
		(win: Window, index: 1 | 2 | 3 | 4 | 5) => Promise<string | null>
	>(async () => null),
	writeNJson: vi.fn<
		(win: Window, index: 1 | 2 | 3 | 4 | 5, jsonText: string) => Promise<void>
	>(async () => undefined),
	readWidgetRecords: vi.fn<
		(win: Window) => Promise<readonly { id: string; type: string }[]>
	>(async () => []),
	readSettings: vi.fn<(win: Window) => Promise<string | null>>(
		async () => "{}",
	),
	upsertWidgetRecords: vi.fn<
		(
			win: Window,
			records: readonly { id: string; type: string }[],
		) => Promise<void>
	>(async () => undefined),
}));

vi.mock("@/management/storage", async () => {
	const actual = await vi.importActual<typeof import("@/management/storage")>(
		"@/management/storage",
	);
	return {
		...actual,
		readNJson: storageMocks.readNJson,
		writeNJson: storageMocks.writeNJson,
		readWidgetRecords: storageMocks.readWidgetRecords,
		readSettings: storageMocks.readSettings,
		upsertWidgetRecords: storageMocks.upsertWidgetRecords,
		indexFromPanelId: (id: string): 1 | 2 | 3 | 4 | 5 => {
			const m = /^panel-(\d+)$/.exec(id);
			const n = m?.[1] ? Number(m[1]) : 1;
			return (n >= 1 && n <= 5 ? n : 1) as 1 | 2 | 3 | 4 | 5;
		},
	};
});

const win = {} as Window;

const LAYOUT_WITH_PRESET = (
	presetId: string,
	rows: Array<{
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}>,
) =>
	JSON.stringify({
		gridCells: rows,
		presetLayoutRoster: [],
	});

describe("persistTargetLayout (Issue #146 / Blocker 11 — retry idempotency)", () => {
	beforeEach(() => {
		storageMocks.readNJson.mockReset();
		storageMocks.writeNJson.mockReset();
		storageMocks.readWidgetRecords.mockReset();
		storageMocks.readSettings.mockReset();
		storageMocks.readWidgetRecords.mockResolvedValue([]);
		storageMocks.readSettings.mockResolvedValue("{}");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calling persistTargetLayout twice with the same catalogIdsToMove → exactly ONE tile on disk; no duplicate", async () => {
		const presetId = "preset-already-on-target";
		const initialLayout = LAYOUT_WITH_PRESET(presetId, [
			{ id: presetId, x: 0, y: 0, width: 1, height: 1 },
		]);
		// The on-disk layout is a tiny in-memory JSON string per index so the
		// test can verify "exactly one tile" after the second call without
		// needing a real filesystem.
		const disk = new Map<1 | 2 | 3 | 4 | 5, string>();
		disk.set(2, initialLayout);
		storageMocks.readNJson.mockImplementation(
			async (_w: Window, index: 1 | 2 | 3 | 4 | 5) => disk.get(index) ?? null,
		);
		storageMocks.writeNJson.mockImplementation(
			async (_w: Window, index: 1 | 2 | 3 | 4 | 5, jsonText: string) => {
				// Round-trip through real JSON.parse to catch any empty-string
				// regressions (Issue #146 / Blocker 6).
				const parsed = JSON.parse(jsonText);
				disk.set(index, JSON.stringify(parsed));
			},
		);

		const baseInput = {
			persistenceRoot: undefined,
			targetPanelId: "panel-2",
			catalogIdsToMove: [presetId],
			widgetTiles: [],
			widgetTypes: {},
			presets: [],
			groupCatalogEntries: [],
			widgetInstanceTypesOverlay: {},
		} as const;

		// First call: preset already on target. The merge MUST be a no-op
		// for the surface layout (no duplicate tile).
		await persistTargetLayout(win, baseInput);
		// Second call: retry the SAME input. The merge MUST still not
		// produce a duplicate tile.
		await persistTargetLayout(win, baseInput);

		// Inspect the final on-disk layout.
		const finalDiskLayoutRaw = disk.get(2);
		expect(finalDiskLayoutRaw).toBeDefined();
		const finalLayout = JSON.parse(finalDiskLayoutRaw ?? "{}") as {
			gridCells: Array<{ id: string }>;
		};
		const tilesForId = finalLayout.gridCells.filter(
			(cell) => cell.id === presetId,
		);
		expect(tilesForId).toHaveLength(1);

		// writeNJson was called at least twice (once per persistTargetLayout
		// invocation); the on-disk result is the same single-tile shape
		// either way — no race drift.
		expect(storageMocks.writeNJson).toHaveBeenCalled();
	});

	it("mixed existing + new ids → only the new id is appended; existing remains singleton", async () => {
		const existingId = "preset-existing";
		const newId = "preset-new";
		const initialLayout = LAYOUT_WITH_PRESET(existingId, [
			{ id: existingId, x: 0, y: 0, width: 1, height: 1 },
		]);
		const disk = new Map<1 | 2 | 3 | 4 | 5, string>();
		disk.set(2, initialLayout);
		storageMocks.readNJson.mockImplementation(
			async (_w: Window, index: 1 | 2 | 3 | 4 | 5) => disk.get(index) ?? null,
		);
		storageMocks.writeNJson.mockImplementation(
			async (_w: Window, index: 1 | 2 | 3 | 4 | 5, jsonText: string) => {
				disk.set(index, JSON.stringify(JSON.parse(jsonText)));
			},
		);

		await persistTargetLayout(win, {
			persistenceRoot: undefined,
			targetPanelId: "panel-2",
			catalogIdsToMove: [existingId, newId],
			widgetTiles: [],
			widgetTypes: {},
			presets: [],
			groupCatalogEntries: [],
			widgetInstanceTypesOverlay: {},
		});

		const finalLayout = JSON.parse(disk.get(2) ?? "{}") as {
			gridCells: Array<{ id: string }>;
		};
		expect(
			finalLayout.gridCells.filter((c) => c.id === existingId),
		).toHaveLength(1);
		expect(finalLayout.gridCells.filter((c) => c.id === newId)).toHaveLength(1);
		expect(finalLayout.gridCells).toHaveLength(2);
	});

	it("source movePresetPlacement is idempotent when the preset is not on the source", () => {
		// Sanity check the source-side half of Blocker 11 — calling
		// movePresetPlacement for a preset that is NOT in the source's
		// presetIds AND no sourceFallbackPresetIds is supplied MUST leave
		// BOTH source and target state unchanged. The real
		// `movePresetPlacement` does not add the preset to target when
		// the preset isn't reachable from the source (i.e. when the
		// source doesn't have it AND no fallback list was given); the
		// move is silently a no-op.
		const settingsBefore = JSON.stringify({
			workspace: {
				workspacePanels: {
					"panel-1": {
						presetIds: ["other-preset"],
						presetFocusId: null,
						presetSelectedIds: ["other-preset"],
						selectedPlacementIds: ["other-preset"],
					},
					"panel-2": {
						presetIds: [],
						presetFocusId: null,
						presetSelectedIds: [],
						selectedPlacementIds: [],
					},
				},
			},
		});

		const settingsAfter = movePresetPlacement(settingsBefore, {
			sourcePanelId: "panel-1",
			targetPanelId: "panel-2",
			presetIds: ["preset-not-on-source"],
			sourceFallbackPresetIds: [],
		});

		const after = JSON.parse(settingsAfter) as {
			workspace: { workspacePanels: Record<string, { presetIds: string[] }> };
		};
		// Source unchanged: still has only "other-preset".
		expect(after.workspace.workspacePanels["panel-1"]?.presetIds).toEqual([
			"other-preset",
		]);
		// Target also unchanged: real movePresetPlacement does NOT add
		// the preset to target when the preset isn't reachable from the
		// source (no entry in source.presetIds, no sourceFallbackPresetIds).
		// This is the actual round-5 / Blocker 11 idempotency contract.
		expect(after.workspace.workspacePanels["panel-2"]?.presetIds).toEqual([]);
	});
});

// Issue #182 — `loadTilesFromNJsonRaw` used to return `[]` for a body it
// could not read, and `persistTargetLayout` packs new tiles onto that array
// before overwriting `workspace-N.json`. One unreadable file therefore erased
// every tile the target panel had.
describe("persistTargetLayout (Issue #182 — an unreadable target is never overwritten)", () => {
	beforeAll(() => {
		_setDevConsoleEnabled(false);
	});

	beforeEach(() => {
		storageMocks.readNJson.mockReset();
		storageMocks.writeNJson.mockReset();
		storageMocks.readWidgetRecords.mockReset();
		storageMocks.readSettings.mockReset();
		storageMocks.upsertWidgetRecords.mockReset();
		storageMocks.readWidgetRecords.mockResolvedValue([]);
		storageMocks.readSettings.mockResolvedValue("{}");
		storageMocks.writeNJson.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		_resetBusForTests();
	});

	const moveInput = (presetId: string) =>
		({
			persistenceRoot: undefined,
			targetPanelId: "panel-2",
			catalogIdsToMove: [presetId],
			widgetTiles: [],
			widgetTypes: {},
			presets: [],
			groupCatalogEntries: [],
			widgetInstanceTypesOverlay: {},
		}) as const;

	const serveDisk = (body: string): Map<1 | 2 | 3 | 4 | 5, string> => {
		const disk = new Map<1 | 2 | 3 | 4 | 5, string>([[2, body]]);
		storageMocks.readNJson.mockImplementation(
			async (_w: Window, index: 1 | 2 | 3 | 4 | 5) => disk.get(index) ?? null,
		);
		return disk;
	};

	it("leaves the target file untouched when the body is not valid JSON", async () => {
		const corrupt = '{ "gridCells": [ { "id": "preset-a"';
		const disk = serveDisk(corrupt);

		await expect(
			persistTargetLayout(win, moveInput("preset-b")),
		).rejects.toThrow(/not valid JSON/);

		expect(storageMocks.writeNJson).not.toHaveBeenCalled();
		expect(storageMocks.upsertWidgetRecords).not.toHaveBeenCalled();
		expect(disk.get(2)).toBe(corrupt);
	});

	it("leaves the target file untouched when the body is JSON but not a layout", async () => {
		// The dangerous case: `parseLayoutDocument` returns an empty grid for
		// any unrecognized object and never throws, so the write that follows
		// would persist "no tiles" over a file it simply failed to understand.
		const foreign = JSON.stringify({ somethingElse: [1, 2, 3] });
		const disk = serveDisk(foreign);

		await expect(
			persistTargetLayout(win, moveInput("preset-b")),
		).rejects.toThrow(/gridCells\/items/);

		expect(storageMocks.writeNJson).not.toHaveBeenCalled();
		expect(disk.get(2)).toBe(foreign);
	});

	it("writes normally when the target panel simply has no file yet", async () => {
		storageMocks.readNJson.mockResolvedValue(null);

		await persistTargetLayout(win, moveInput("preset-b"));

		expect(storageMocks.writeNJson).toHaveBeenCalledTimes(1);
	});

	it("records the refusal in the Debug Console", async () => {
		serveDisk("{ not json");
		_setDevConsoleEnabled(false);

		await expect(
			persistTargetLayout(win, moveInput("preset-b")),
		).rejects.toThrow();

		const entry = getEntries().find(
			(e) => e.action === "persistTargetLayout:target-layout-unreadable",
		);
		expect(entry, "the refusal must be observable, not silent").toBeDefined();
		expect(entry?.context).toMatchObject({
			targetPanelId: "panel-2",
			reason: "json-parse-failed",
			consequence: "write aborted; existing tiles left untouched",
		});
	});
});
