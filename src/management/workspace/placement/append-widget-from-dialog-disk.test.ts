// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRecord } from "@/management/widget/record/types";
import type { CrossPanelLayoutWriteInput } from "@/management/workspace/placement/cross-panel-write";

const {
	persistTargetLayoutMock,
	resolveRootMock,
	readNJsonMock,
	writeNJsonMock,
	removeNJsonMock,
	readWidgetRecordsMock,
	writeWidgetRecordsMock,
	readPresetsJsonMock,
	readGroupJsonMock,
	getDataServicesMock,
	errorLogCalls,
	useRealRecordReads,
	readJsonMock,
	readJsonTextMock,
} = vi.hoisted(() => ({
	useRealRecordReads: { value: false },
	readJsonMock: vi.fn(),
	readJsonTextMock: vi.fn(),
	persistTargetLayoutMock: vi.fn<
		(win: Window, input: CrossPanelLayoutWriteInput) => Promise<void>
	>(async () => undefined),
	resolveRootMock: vi.fn<(win: Window) => Promise<string | null>>(
		async () => "/managed-root",
	),
	readNJsonMock: vi.fn<
		(win: Window, index: 1 | 2 | 3 | 4 | 5) => Promise<string | null>
	>(async () => null),
	writeNJsonMock: vi.fn<
		(win: Window, index: 1 | 2 | 3 | 4 | 5, jsonText: string) => Promise<void>
	>(async () => undefined),
	removeNJsonMock: vi.fn<
		(win: Window, index: 1 | 2 | 3 | 4 | 5) => Promise<void>
	>(async () => undefined),
	readWidgetRecordsMock: vi.fn<(win: Window) => Promise<WidgetRecord[]>>(
		async () => [],
	),
	writeWidgetRecordsMock: vi.fn<
		(win: Window, records: readonly WidgetRecord[]) => Promise<void>
	>(async () => undefined),
	readPresetsJsonMock: vi.fn<(win: Window) => Promise<string | null>>(
		async () => null,
	),
	readGroupJsonMock: vi.fn<(win: Window) => Promise<string | null>>(
		async () => null,
	),
	// Stands in for the post-onboarding live-boot state: since Issue #128
	// `getDataServices()` throws `GatewayBootRequiredError` when the runtime
	// cloud gateway was never registered. Every other bug in this file was
	// downstream of that throw.
	getDataServicesMock: vi.fn(() => {
		throw new Error("Cloud gateway was not booted (Issue #128)");
	}),
	errorLogCalls: [] as Array<{
		message: string;
		context?: Record<string, unknown>;
	}>,
}));

vi.mock("@/management/workspace/placement/cross-panel-write", () => ({
	persistTargetLayout: persistTargetLayoutMock,
}));

vi.mock("@/management/workspace/layout/persistence-root", () => ({
	resolveWorkspacePersistenceManagedRoot: resolveRootMock,
}));

vi.mock("@/management/workspace/layout/panel-json-files", () => ({
	readNJson: readNJsonMock,
	writeNJson: writeNJsonMock,
	removeNJson: removeNJsonMock,
}));

vi.mock(
	"@/management/widget/persistence/records-file",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@/management/widget/persistence/records-file")
			>();
		return {
			...actual,
			readWidgetRecords: (win: Window) =>
				useRealRecordReads.value
					? actual.readWidgetRecords(win)
					: readWidgetRecordsMock(win),
			readWidgetRecordsFileStrict: async (win: Window) =>
				useRealRecordReads.value
					? actual.readWidgetRecordsFileStrict(win)
					: { status: "loaded", records: await readWidgetRecordsMock(win) },
			writeWidgetRecords: writeWidgetRecordsMock,
		};
	},
);

vi.mock("@/management/storage/persistence", () => ({
	readJson: readJsonMock,
	readJsonText: readJsonTextMock,
	writeJson: vi.fn(),
}));

vi.mock("@/management/storage", () => ({
	readPresetsJson: readPresetsJsonMock,
	indexFromPanelId: (id: string) => {
		const m = /^panel-(\d+)$/.exec(id);
		return (m?.[1] ? Number(m[1]) : 1) as 1;
	},
}));

vi.mock("@/management/catalog/json-files", () => ({
	readGroupJson: readGroupJsonMock,
}));

vi.mock("@/management/preset/group-catalog", () => ({
	parseGroupFromText: () => [],
}));

vi.mock("@/management/widget/registry", () => ({
	registry: {
		getConfig: (type: string) =>
			type === "unavailable-widget"
				? undefined
				: { available: true, defaultSize: { cols: 2, rows: 3 } },
		createId: () => "widget-new-1",
	},
}));

vi.mock("@/management/debug", () => ({
	createLogger: (_source: string) => ({
		info: () => {},
		warn: () => {},
		error: (
			message: string,
			options?: { context?: Record<string, unknown> },
		) => {
			errorLogCalls.push({ message, context: options?.context });
		},
		debug: () => {},
		log: () => {},
	}),
}));

vi.mock("@/management/workspace/services", () => ({
	getDataServices: getDataServicesMock,
}));

import { persistAppendWidgetFromDialog } from "@/management/workspace/placement/append-widget-from-dialog-disk";

const EXISTING_LAYOUT = JSON.stringify({
	gridCells: [{ id: "preset-a", x: 0, y: 0, width: 1, height: 1 }],
	presetLayoutRoster: [],
});
const EXISTING_RECORD: WidgetRecord = {
	id: "widget-old-1",
	type: "info",
	param: {},
};

beforeEach(() => {
	useRealRecordReads.value = false;
	readJsonMock.mockReset();
	readJsonTextMock.mockReset();
	persistTargetLayoutMock.mockReset();
	persistTargetLayoutMock.mockResolvedValue(undefined);
	resolveRootMock.mockReset();
	resolveRootMock.mockResolvedValue("/managed-root");
	readNJsonMock.mockReset();
	readNJsonMock.mockResolvedValue(EXISTING_LAYOUT);
	writeNJsonMock.mockReset();
	writeNJsonMock.mockResolvedValue(undefined);
	removeNJsonMock.mockReset();
	removeNJsonMock.mockResolvedValue(undefined);
	readWidgetRecordsMock.mockReset();
	readWidgetRecordsMock.mockResolvedValue([EXISTING_RECORD]);
	writeWidgetRecordsMock.mockReset();
	writeWidgetRecordsMock.mockResolvedValue(undefined);
	readPresetsJsonMock.mockReset();
	readPresetsJsonMock.mockResolvedValue(null);
	readGroupJsonMock.mockReset();
	readGroupJsonMock.mockResolvedValue(null);
	getDataServicesMock.mockClear();
	errorLogCalls.length = 0;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("persistAppendWidgetFromDialog (Issue #159 — post-onboarding widget lifecycle)", () => {
	/**
	 * The regression this file exists for. On the real AE host the cloud
	 * gateway is unbooted after onboarding, so `getDataServices()` throws.
	 * Before the fix, the placement call was gated behind
	 * `getDataServices().presetRepository.list()` and the whole body sat in
	 * `catch { return false }` — the dialog then fell back to a modeless
	 * `surfaceMessage` that never reaches sibling workspace panels, and the
	 * widget was silently never placed.
	 */
	it("places the widget on disk when the cloud data services are unavailable", async () => {
		const result = await persistAppendWidgetFromDialog(window, {
			targetPanelId: "panel-1",
			widgetType: "info",
		});

		expect(result).toEqual({
			ok: true,
			widgetId: "widget-new-1",
			targetPanelId: "panel-1",
		});
		expect(persistTargetLayoutMock).toHaveBeenCalledTimes(1);
		expect(writeWidgetRecordsMock).toHaveBeenCalledTimes(1);
		expect(writeWidgetRecordsMock).toHaveBeenCalledWith(window, [
			EXISTING_RECORD,
			{ id: "widget-new-1", type: "info", param: {} },
		]);
	});

	it("never reaches getDataServices() — widget placement has no cloud dependency", async () => {
		await persistAppendWidgetFromDialog(window, {
			targetPanelId: "panel-1",
			widgetType: "info",
		});

		expect(getDataServicesMock).not.toHaveBeenCalled();
	});

	it("threads the local catalog metadata into the layout write", async () => {
		readPresetsJsonMock.mockResolvedValue(
			JSON.stringify({
				version: 1,
				presets: [{ id: "preset-a", type: "preset", filePath: "C:/p/a.ffx" }],
			}),
		);

		await persistAppendWidgetFromDialog(window, {
			targetPanelId: "panel-1",
			widgetType: "info",
		});

		const args = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(args?.presets).toEqual([
			expect.objectContaining({ id: "preset-a" }),
		]);
		expect(args?.widgetTiles).toEqual([
			{ id: "widget-new-1", width: 2, height: 3 },
		]);
	});

	it.each([
		{ state: "missing", raw: null, records: [] },
		{
			state: "valid",
			raw: JSON.stringify({ version: 1, widgets: [EXISTING_RECORD] }),
			records: [EXISTING_RECORD],
		},
	])(
		"adds to a $state records file using the strict reader",
		async ({ raw, records }) => {
			useRealRecordReads.value = true;
			readJsonTextMock.mockResolvedValue(raw);

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({ ok: true });
			expect(writeWidgetRecordsMock).toHaveBeenCalledWith(window, [
				...records,
				{ id: "widget-new-1", type: "info", param: {} },
			]);
			expect(readJsonTextMock).toHaveBeenCalledWith(window, "widgetRecords");
			expect(readJsonMock).not.toHaveBeenCalled();
		},
	);

	describe("failure classification (Issue #159 / B)", () => {
		it.each([
			["invalid JSON", '{"version":1,"widgets":['],
			["an invalid records document", '{"version":1}'],
		])(
			"refuses to overwrite widgets.json containing %s",
			async (_label, raw) => {
				useRealRecordReads.value = true;
				readJsonMock.mockResolvedValue(null);
				readJsonTextMock.mockResolvedValue(raw);

				const result = await persistAppendWidgetFromDialog(window, {
					targetPanelId: "panel-1",
					widgetType: "info",
				});

				expect(result).toMatchObject({
					ok: false,
					reason: "local-layout-read-failed",
				});
				expect(persistTargetLayoutMock).not.toHaveBeenCalled();
				expect(writeWidgetRecordsMock).not.toHaveBeenCalled();
			},
		);

		it("refuses to write when widgets.json cannot be read", async () => {
			useRealRecordReads.value = true;
			readJsonMock.mockResolvedValue(null);
			readJsonTextMock.mockRejectedValue(new Error("EACCES"));

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "local-layout-read-failed",
			});
			expect(persistTargetLayoutMock).not.toHaveBeenCalled();
			expect(writeWidgetRecordsMock).not.toHaveBeenCalled();
		});

		it("reports persistence-root-unavailable without writing anything", async () => {
			resolveRootMock.mockResolvedValue("   ");

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "persistence-root-unavailable",
			});
			expect(persistTargetLayoutMock).not.toHaveBeenCalled();
			expect(writeWidgetRecordsMock).not.toHaveBeenCalled();
		});

		it("reports persistence-root-unavailable when root resolution throws", async () => {
			// Root resolution reads the initialization locator and settings from
			// disk. An uncaught throw here would leave the dialog with no message
			// and nothing in the log — the silent failure this module removes.
			resolveRootMock.mockRejectedValue(new Error("EIO reading locator"));

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "persistence-root-unavailable",
			});
			expect(result.ok === false && result.message).toContain(
				"EIO reading locator",
			);
			expect(persistTargetLayoutMock).not.toHaveBeenCalled();
		});

		it("reports widget-type-unavailable without writing anything", async () => {
			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "unavailable-widget" as never,
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "widget-type-unavailable",
			});
			expect(persistTargetLayoutMock).not.toHaveBeenCalled();
		});

		it("reports local-catalog-read-failed for a corrupt catalog instead of treating it as empty", async () => {
			readPresetsJsonMock.mockResolvedValue("{ not json");

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "local-catalog-read-failed",
			});
			// Demoting a corrupt catalog to `[]` would rewrite the layout
			// without its existing preset tiles.
			expect(persistTargetLayoutMock).not.toHaveBeenCalled();
		});

		it("reports target-layout-write-failed and leaves no widget record behind", async () => {
			persistTargetLayoutMock.mockRejectedValue(new Error("disk full"));

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "target-layout-write-failed",
			});
			expect(writeWidgetRecordsMock).not.toHaveBeenCalled();
		});

		it("logs the failing stage so it is visible in the Debug Console", async () => {
			resolveRootMock.mockResolvedValue(null);

			await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-3",
				widgetType: "info",
			});

			expect(errorLogCalls).toHaveLength(1);
			expect(errorLogCalls[0]?.message).toBe(
				"append-widget-from-dialog-disk:placement-failed",
			);
			expect(errorLogCalls[0]?.context).toMatchObject({
				step: "persistence-root-unavailable",
				targetPanelId: "panel-3",
				reason: "persistence-root-unavailable",
			});
		});
	});

	/**
	 * `persistTargetLayout` runs before the widget-record write, so a failed
	 * record write would otherwise leave a layout row pointing at a widget id
	 * that has no record. Issue #159 / C requires the pair to behave as one
	 * local transaction.
	 */
	describe("local transaction (Issue #159 / C)", () => {
		it("rolls the layout back to its previous contents when the record write fails", async () => {
			writeWidgetRecordsMock.mockRejectedValue(new Error("EACCES"));

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "widget-record-write-failed",
			});
			// The layout was written by persistTargetLayout (mocked), so the
			// rollback has to put the pre-add contents back verbatim.
			expect(writeNJsonMock).toHaveBeenCalledWith(window, 1, EXISTING_LAYOUT);
			expect(removeNJsonMock).not.toHaveBeenCalled();
			expect(errorLogCalls[0]?.context).toMatchObject({ rolledBack: true });
		});

		it("removes the layout file again when there was no layout before the add", async () => {
			readNJsonMock.mockResolvedValue(null);
			writeWidgetRecordsMock.mockRejectedValue(new Error("EACCES"));

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-2",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "widget-record-write-failed",
			});
			// `writeNJson(..., "")` is not a restore-to-absent: JSON.parse("")
			// throws and an empty file is still on disk for the next reader.
			expect(removeNJsonMock).toHaveBeenCalledWith(window, 2);
			expect(writeNJsonMock).not.toHaveBeenCalled();
		});

		it("removes the widget record when the failed write left it on disk", async () => {
			// A partial write (bytes on disk, rejected promise) is the one case
			// where the record write leaves an orphan record behind.
			writeWidgetRecordsMock.mockRejectedValue(new Error("EACCES"));
			readWidgetRecordsMock
				.mockResolvedValueOnce([EXISTING_RECORD])
				.mockResolvedValueOnce([
					EXISTING_RECORD,
					{ id: "widget-new-1", type: "info", param: {} },
				]);

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "widget-record-write-failed",
			});
			expect(writeWidgetRecordsMock).toHaveBeenLastCalledWith(window, [
				EXISTING_RECORD,
			]);
		});

		it("leaves a concurrently written record alone during rollback", async () => {
			writeWidgetRecordsMock.mockRejectedValue(new Error("EACCES"));
			readWidgetRecordsMock
				.mockResolvedValueOnce([EXISTING_RECORD])
				.mockResolvedValueOnce([
					EXISTING_RECORD,
					{ id: "widget-someone-else", type: "menu", param: {} },
				]);

			await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			// Our own id is absent, so the rollback must not rewrite the file and
			// must not clobber the other surface's record.
			expect(writeWidgetRecordsMock).toHaveBeenCalledTimes(1);
		});

		it("preserves other records when removing a partially written widget record", async () => {
			const concurrentRecord: WidgetRecord = {
				id: "widget-someone-else",
				type: "menu",
				param: {},
			};
			writeWidgetRecordsMock.mockRejectedValueOnce(new Error("EACCES"));
			readWidgetRecordsMock
				.mockResolvedValueOnce([EXISTING_RECORD])
				.mockResolvedValueOnce([
					EXISTING_RECORD,
					{ id: "widget-new-1", type: "info", param: {} },
					concurrentRecord,
				]);

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "widget-record-write-failed",
			});
			expect(writeWidgetRecordsMock).toHaveBeenLastCalledWith(window, [
				EXISTING_RECORD,
				concurrentRecord,
			]);
		});

		it("still reports the placement failure when the rollback itself fails", async () => {
			writeWidgetRecordsMock.mockRejectedValue(new Error("EACCES"));
			writeNJsonMock.mockRejectedValue(new Error("rollback denied"));

			const result = await persistAppendWidgetFromDialog(window, {
				targetPanelId: "panel-1",
				widgetType: "info",
			});

			expect(result).toMatchObject({
				ok: false,
				reason: "widget-record-write-failed",
			});
			expect(errorLogCalls[0]?.context).toMatchObject({
				rolledBack: true,
				rollbackErrors: ["rollback denied"],
			});
		});
	});
});
