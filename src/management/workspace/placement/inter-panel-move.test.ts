/**
 * Round-6 / Blocker 14 (data-loss prevention) tests for `applyInterPanelMove`.
 *
 * Issue #146 / Blocker 14 — preset-only move failures were wiping the
 * widget registry. Previously:
 *
 *   const widgetRecordsPreImage =
 *     widgetTilesForCrossPanel.length ? await readWidgetRecords(...) : [];
 *
 * Then `rollbackWidgetRecords(win, [])` ran on every failure, writing
 * an empty `widgets/widgets.json`. The fix captures the pre-image
 * UNCONDITIONALLY at step 0 and gates the rollback on a
 * `widgetRecordsModified` flag — set true only when widget tiles were
 * actually written. On a preset-only failure the rollback is a no-op:
 * no write, no data loss.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRecord } from "@/management/widget/record/types";
import type { CrossPanelLayoutWriteInput } from "@/management/workspace/placement/cross-panel-write";

const {
	persistTargetLayoutMock,
	mockReadWidgetRecords,
	mockWriteWidgetRecords,
} = vi.hoisted(() => ({
	persistTargetLayoutMock: vi.fn<
		(win: Window, input: CrossPanelLayoutWriteInput) => Promise<void>
	>(async () => undefined),
	mockReadWidgetRecords: vi.fn<(win: Window) => Promise<WidgetRecord[]>>(
		async () => [],
	),
	mockWriteWidgetRecords: vi.fn<
		(win: Window, records: readonly WidgetRecord[]) => Promise<void>
	>(async () => undefined),
}));

/** Mutable layout state used by `parseLayoutDocument` mock — drives
 * the read-back pass. Tests push cells into here to simulate what
 * `persistTargetLayout` (mocked) would have written. */
const layoutState = vi.hoisted(() => ({
	gridCells: [] as Array<{
		id: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}>,
	presetLayoutRoster: [] as Array<{ presetRefId: string }>,
}));

const debugMocks = vi.hoisted(() => ({
	warnCalls: [] as Array<{
		message: string;
		context?: Record<string, unknown>;
	}>,
	infoCalls: [] as Array<{
		message: string;
		context?: Record<string, unknown>;
	}>,
}));

vi.mock("@/management/workspace/placement/cross-panel-write", () => ({
	persistTargetLayout: persistTargetLayoutMock,
}));

vi.mock("@/management/storage", () => ({
	readNJson: async () =>
		// Return the synthetic layout as JSON. `parseLayoutDocument` is
		// mocked to ignore the JSON payload and read `layoutState`
		// directly, but `readBackMove` rejects on null. The JSON.parse
		// inside `readBackMove` runs on this string; the mock
		// `parseLayoutDocument` short-circuits that and substitutes the
		// layoutState-driven view.
		JSON.stringify({
			gridCells: [],
			presetLayoutRoster: [],
		}),
	readSettings: async () => JSON.stringify({ panelPresetIds: {} }),
	readPanelPresetIdsFromSettingsJson: () => [],
	readWidgetRecords: mockReadWidgetRecords,
	writeSettings: async () => undefined,
	writeWidgetRecords: mockWriteWidgetRecords,
	removeNJson: async () => undefined,
	writeNJson: async () => undefined,
	indexFromPanelId: (id: string) => {
		const m = /^panel-(\d+)$/.exec(id);
		return m?.[1] ? Number(m[1]) : 1;
	},
	movePresetPlacement: (
		currentJson: string,
		input: {
			sourcePanelId: string;
			targetPanelId: string;
			presetIds: string[];
			sourceFallbackPresetIds: string[];
		},
	): string => {
		const parsed = JSON.parse(currentJson) as {
			panelPresetIds?: Record<string, string[]>;
		};
		const next = parsed.panelPresetIds ?? {};
		const sourceKey = input.sourcePanelId;
		const targetKey = input.targetPanelId;
		const sourceIds = new Set(next[sourceKey] ?? []);
		for (const id of input.presetIds) sourceIds.delete(id);
		next[sourceKey] = [...sourceIds];
		const targetIds = new Set(next[targetKey] ?? []);
		for (const id of input.presetIds) targetIds.add(id);
		next[targetKey] = [...targetIds];
		return JSON.stringify({ ...parsed, panelPresetIds: next });
	},
}));

vi.mock("@/management/workspace/layout/grid-document", () => ({
	parseLayoutDocument: () => ({
		gridCells: [...layoutState.gridCells],
		presetLayoutRoster: [...layoutState.presetLayoutRoster],
	}),
}));

vi.mock("@/management/debug", () => ({
	createLogger: (_source: string) => ({
		info: (
			message: string,
			options?: { context?: Record<string, unknown> },
		) => {
			debugMocks.infoCalls.push({ message, context: options?.context });
		},
		warn: (
			message: string,
			options?: { context?: Record<string, unknown> },
		) => {
			debugMocks.warnCalls.push({ message, context: options?.context });
		},
		error: (
			message: string,
			options?: { context?: Record<string, unknown> },
		) => {
			debugMocks.warnCalls.push({ message, context: options?.context });
		},
		debug: () => {},
		log: () => {},
	}),
}));

import { applyInterPanelMove } from "@/management/workspace/placement/inter-panel-move";

const existingWidgetRecords: WidgetRecord[] = [
	{ id: "w-existing-1", type: "menu", param: {} },
	{ id: "w-existing-2", type: "quick-actions", param: { query: "kept" } },
];

const initialWidgetRecords: readonly WidgetRecord[] = [
	{ id: "w-existing-1", type: "menu", param: {} },
	{ id: "w-existing-2", type: "quick-actions", param: { query: "kept" } },
];

beforeEach(() => {
	persistTargetLayoutMock.mockClear();
	persistTargetLayoutMock.mockImplementation(async (_win, input) => {
		// Mirror the real `persistTargetLayout` contract so read-back
		// finds the moved tiles. Push each catalog id into
		// `presetLayoutRoster` and each widget tile into `gridCells`.
		// Also "upsert" the widget tile into the synthetic widget
		// records list so read-back's registry check passes (the real
		// `persistTargetLayout` calls `upsertWidgetRecords` for this).
		for (const id of input.catalogIdsToMove) {
			layoutState.presetLayoutRoster.push({ presetRefId: id });
		}
		for (const t of input.widgetTiles) {
			layoutState.gridCells.push({
				id: t.id,
				x: 0,
				y: 0,
				width: t.width,
				height: t.height,
			});
			const explicitType = input.widgetTypes[t.id];
			if (explicitType && !existingWidgetRecords.find((r) => r.id === t.id)) {
				existingWidgetRecords.push({
					id: t.id,
					type: explicitType as WidgetRecord["type"],
					param: {},
				});
			}
		}
	});
	mockReadWidgetRecords.mockClear();
	mockReadWidgetRecords.mockImplementation(async () =>
		existingWidgetRecords.map((r) => ({ ...r })),
	);
	mockWriteWidgetRecords.mockClear();
	mockWriteWidgetRecords.mockResolvedValue(undefined);
	layoutState.gridCells = [];
	layoutState.presetLayoutRoster = [];
	existingWidgetRecords.length = 0;
	existingWidgetRecords.push(
		{ id: "w-existing-1", type: "menu", param: {} },
		{ id: "w-existing-2", type: "quick-actions", param: { query: "kept" } },
	);
	debugMocks.warnCalls.length = 0;
	debugMocks.infoCalls.length = 0;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("applyInterPanelMove — Round-6 / Blocker 14 (data-loss prevention)", () => {
	it("Test X.1 — preset-only move fails (catalog write throws): widgets.json content is NOT wiped", async () => {
		// Simulate a catalog-write failure: `persistTargetLayout` throws
		// before the source is touched. Before round-6 this would cascade
		// through `rollbackWidgetRecords(win, [])` and wipe
		// `widgets/widgets.json`. The fix:
		//   1. captures the pre-image UNCONDITIONALLY at step 0
		//   2. tracks `widgetRecordsModified` (false on preset-only moves)
		//   3. skips `rollbackWidgetRecords` entirely when the flag is false
		// Result: `writeWidgetRecords` is NEVER called.
		persistTargetLayoutMock.mockRejectedValueOnce(
			new Error("catalog write failed (simulated catalog-error)"),
		);

		await expect(
			applyInterPanelMove({
				win: window,
				persistenceRoot: "/managed-root",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-2",
				catalogIdsToMove: ["preset-x"],
				sourceFallbackPresetIds: ["preset-x"],
				widgetTilesForCrossPanel: [],
				widgetTypesForCrossPanel: {},
				presets: [],
				groupCatalogEntries: [],
				widgetInstanceTypesOverlay: {},
				persistSourceLayout: async () => undefined,
			}),
		).rejects.toThrow(/target apply failed/);

		// CRITICAL (Blocker 14 invariant): writeWidgetRecords was NEVER
		// called. A single call with [] would mean the registry was wiped.
		expect(mockWriteWidgetRecords).not.toHaveBeenCalled();

		// Sanity: the pre-image was read at least once (so the rollback
		// *could* have fired). The gate is what matters.
		expect(mockReadWidgetRecords).toHaveBeenCalled();

		// The diagnostic log MUST record `widgetRecordsModified: false` —
		// the Debug Console surface depends on this signal to confirm
		// "preset-only failure path → no widget write attempted".
		const warn = debugMocks.warnCalls.find(
			(c) =>
				c.message ===
				"applyInterPanelMove:target-write-failed-target-rolled-back",
		);
		expect(warn).toBeDefined();
		expect(warn?.context?.widgetRecordsModified).toBe(false);
	});

	it("Test X.1b — writeSettings failure on preset-only move: widgets.json content is NOT wiped", async () => {
		// Step 3 (writeSettings) failure path. Same invariant: no widget
		// write should occur because widget tiles were not part of this
		// move.
		const storageMock = await import("@/management/storage");
		const writeSettingsSpy = vi
			.spyOn(storageMock, "writeSettings")
			.mockRejectedValueOnce(new Error("settings write failed"));
		try {
			await expect(
				applyInterPanelMove({
					win: window,
					persistenceRoot: "/managed-root",
					sourcePanelId: "panel-1",
					targetPanelId: "panel-2",
					catalogIdsToMove: ["preset-y"],
					sourceFallbackPresetIds: ["preset-y"],
					widgetTilesForCrossPanel: [],
					widgetTypesForCrossPanel: {},
					presets: [],
					groupCatalogEntries: [],
					widgetInstanceTypesOverlay: {},
					persistSourceLayout: async () => undefined,
				}),
			).rejects.toThrow(/source write failed/);

			expect(mockWriteWidgetRecords).not.toHaveBeenCalled();
			const warn = debugMocks.warnCalls.find(
				(c) =>
					c.message ===
					"applyInterPanelMove:source-write-failed-target-rolled-back",
			);
			expect(warn).toBeDefined();
			expect(warn?.context?.widgetRecordsModified).toBe(false);
		} finally {
			writeSettingsSpy.mockRestore();
		}
	});

	it("Test X.1c — widget-only move that succeeds: committed log records success", async () => {
		// Sanity check: when widget tiles ARE part of the move and the
		// whole sequence succeeds, the committed log MUST be present.
		// The flag is only attached to failure-path warn calls; the
		// success path signals "widget write happened" via the
		// `applyInterPanelMove:committed` log line carrying
		// `sourcePersistResult: "success"` AND the call to
		// `persistTargetLayout` having `widgetTiles.length > 0`.
		await expect(
			applyInterPanelMove({
				win: window,
				persistenceRoot: "/managed-root",
				sourcePanelId: "panel-1",
				targetPanelId: "panel-2",
				catalogIdsToMove: [],
				sourceFallbackPresetIds: [],
				widgetTilesForCrossPanel: [{ id: "w-moved", width: 2, height: 2 }],
				widgetTypesForCrossPanel: { "w-moved": "menu" },
				presets: [],
				groupCatalogEntries: [],
				widgetInstanceTypesOverlay: { "w-moved": "menu" },
				persistSourceLayout: async () => undefined,
			}),
		).resolves.toBeUndefined();

		// `persistTargetLayout` was called exactly once with the widget tile.
		expect(persistTargetLayoutMock).toHaveBeenCalledTimes(1);
		const args = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(args?.widgetTiles).toHaveLength(1);

		// The committed log carries `sourcePersistResult: "success"`.
		const committed = debugMocks.infoCalls.find(
			(c) => c.message === "applyInterPanelMove:committed",
		);
		expect(committed).toBeDefined();
		expect(committed?.context?.sourcePersistResult).toBe("success");
	});

	it("Test X.1d — widget-only move that fails at step 3 (writeSettings): widget records ARE rolled back (modified=true)", async () => {
		// Companion test to X.1b: when widgets ARE part of the move
		// and step 3 fails, `writeWidgetRecords` MUST be called with
		// the captured pre-image so the registry is restored exactly.
		// The flag-based gate ONLY suppresses the rollback when no
		// widget write happened — it MUST NOT swallow it otherwise.
		const storageMock = await import("@/management/storage");
		const writeSettingsSpy = vi
			.spyOn(storageMock, "writeSettings")
			.mockRejectedValueOnce(new Error("settings write failed (widget path)"));
		try {
			await expect(
				applyInterPanelMove({
					win: window,
					persistenceRoot: "/managed-root",
					sourcePanelId: "panel-1",
					targetPanelId: "panel-2",
					catalogIdsToMove: [],
					sourceFallbackPresetIds: [],
					widgetTilesForCrossPanel: [{ id: "w-moved", width: 2, height: 2 }],
					widgetTypesForCrossPanel: { "w-moved": "menu" },
					presets: [],
					groupCatalogEntries: [],
					widgetInstanceTypesOverlay: { "w-moved": "menu" },
					persistSourceLayout: async () => undefined,
				}),
			).rejects.toThrow(/source write failed/);

			// Widget records were written back — exactly the captured pre-image.
			expect(mockWriteWidgetRecords).toHaveBeenCalledTimes(1);
			const args = mockWriteWidgetRecords.mock.calls[0]?.[1] as
				| WidgetRecord[]
				| undefined;
			expect(args).toBeDefined();
			// The rollback writes the pre-image captured at step 0 —
			// that is the initial widget records list (without `w-moved`,
			// because the move hadn't happened yet).
			expect(args).toEqual(expect.arrayContaining([...initialWidgetRecords]));
			expect(args).toHaveLength(initialWidgetRecords.length);
			expect(args?.find((r) => r.id === "w-moved")).toBeUndefined();

			const warn = debugMocks.warnCalls.find(
				(c) =>
					c.message ===
					"applyInterPanelMove:source-write-failed-target-rolled-back",
			);
			expect(warn).toBeDefined();
			// Critical: the flag is `true` here because widgets WERE
			// part of the move and `persistTargetLayout` had returned
			// successfully before step 3 fired.
			expect(warn?.context?.widgetRecordsModified).toBe(true);
		} finally {
			writeSettingsSpy.mockRestore();
		}
	});
});
