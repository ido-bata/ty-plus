// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrossPanelLayoutWriteInput } from "@/management/workspace/placement/cross-panel-write";

const {
	persistTargetLayoutMock,
	resolveRootMock,
	readNJsonMock,
	readJsonTextMock,
} = vi.hoisted(() => ({
	persistTargetLayoutMock: vi.fn<
		(win: Window, input: CrossPanelLayoutWriteInput) => Promise<void>
	>(async () => undefined),
	resolveRootMock: vi.fn<(win: Window) => Promise<string | null>>(
		async () => "/managed-root",
	),
	readNJsonMock: vi.fn<(win: Window, index: number) => Promise<string | null>>(
		async () => null,
	),
	// Local catalog reader mock: `getLocalPresetCatalog` reads
	// `presets/presets.json` through `readJsonText(win, "presetCatalog")`.
	// Per-test value simulates "catalog available" (JSON text),
	// "catalog missing" (null → empty catalog), or "catalog corrupt"
	// (unparseable text → PresetCatalogParseError).
	readJsonTextMock: vi.fn<
		(win: Window, key: string) => Promise<string | null>
	>(async () => null),
}));

/** Captured warn() calls from createLogger('workspace'). */
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

vi.mock("@/management/workspace/layout/persistence-root", () => ({
	resolveWorkspacePersistenceManagedRoot: resolveRootMock,
}));

vi.mock("@/management/storage/persistence", () => ({
	readJsonText: readJsonTextMock,
}));

vi.mock("@/management/catalog/json-files", () => ({
	readGroupJson: async () => "",
}));

vi.mock("@/management/preset/group-catalog", () => ({
	parseGroupFromText: () => [],
}));

vi.mock("@/management/storage", () => ({
	readNJson: readNJsonMock,
	readSettings: async () => "",
	readPanelPresetIdsFromSettingsJson: () => [],
	readWidgetRecords: async () => [],
	writeNJson: async () => undefined,
	writePresetsJson: async () => undefined,
	indexFromPanelId: (id: string) => {
		const m = /^panel-(\d+)$/.exec(id);
		return m?.[1] ? Number(m[1]) : 1;
	},
}));

vi.mock("@/management/workspace/layout/grid-document", () => ({
	parseLayoutDocument: () => ({ gridCells: [], presetLayoutRoster: [] }),
}));

vi.mock("@/management/workspace/surface/tiles", () => ({
	tilesFromDocument: () => [],
	serialize: () => "[]",
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

import { __resetLocalPresetCatalogForTests } from "@/management/preset/repository/local-catalog";
import { tryPersistAppendPresetFromDialog } from "@/management/workspace/placement/append-preset-from-dialog-disk";

/**
 * Build a presets.json JSON string for the local-catalog mock. The text
 * is what `parsePresetCatalogJsonText` will ingest — the parser is the
 * real implementation, so this string must be parseable.
 */
const localCatalogText = (...presetIds: string[]): string =>
	JSON.stringify({
		version: 1,
		presets: presetIds.map((id) => ({
			id,
			type: "preset",
			title: id,
			filePath: `C:/${id}.ffx`,
		})),
	});

beforeEach(() => {
	persistTargetLayoutMock.mockClear();
	persistTargetLayoutMock.mockResolvedValue(undefined);
	resolveRootMock.mockClear();
	readNJsonMock.mockClear();
	readJsonTextMock.mockClear();
	readJsonTextMock.mockResolvedValue(null);
	debugMocks.warnCalls.length = 0;
	debugMocks.infoCalls.length = 0;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("tryPersistAppendPresetFromDialog", () => {
	it("threads dropPlacement through to persistTargetLayout", async () => {
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		const ok = await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-x"],
			dropPlacement: { x: 5, y: 6 },
		});
		expect(ok).toBe(true);
		expect(persistTargetLayoutMock).toHaveBeenCalledTimes(1);
		const args = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(args?.dropPlacement).toEqual({ x: 5, y: 6 });
	});

	it("omits dropPlacement when not provided", async () => {
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-y"],
		});
		const args = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(args?.dropPlacement).toBeUndefined();
	});
});

describe("tryPersistAppendPresetFromDialog — local catalog source", () => {
	it("reads presets/presets.json through the local catalog and places with parsed metadata", async () => {
		readJsonTextMock.mockResolvedValue(localCatalogText("preset-z"));
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		const ok = await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-z"],
		});
		expect(ok).toBe(true);
		expect(persistTargetLayoutMock).toHaveBeenCalledTimes(1);
		const persistArgs = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(persistArgs?.presets).toEqual([
			expect.objectContaining({ id: "preset-z" }),
		]);
	});

	it("parsed catalog entries flow into persistTargetLayout", async () => {
		readJsonTextMock.mockResolvedValue(
			localCatalogText("preset-a", "preset-b"),
		);
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		const ok = await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-a"],
		});
		expect(ok).toBe(true);
		const persistArgs = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(persistArgs?.presets).toHaveLength(2);
		expect(persistArgs?.catalogIdsToMove).toEqual(["preset-a"]);
	});

	it("corrupt presets.json REJECTS — no silent empty catalog", async () => {
		readJsonTextMock.mockResolvedValue("not-valid-json{{");
		await expect(
			tryPersistAppendPresetFromDialog(window, {
				targetPanelId: "panel-1",
				catalogRefIds: ["preset-corrupt"],
			}),
		).rejects.toThrow();
		expect(persistTargetLayoutMock).not.toHaveBeenCalled();
	});

	it("structurally invalid catalog (root-not-array) REJECTS", async () => {
		readJsonTextMock.mockResolvedValue(
			JSON.stringify({ presets: { not: "an array" } }),
		);
		await expect(
			tryPersistAppendPresetFromDialog(window, {
				targetPanelId: "panel-1",
				catalogRefIds: ["preset-corrupt"],
			}),
		).rejects.toThrow();
		expect(persistTargetLayoutMock).not.toHaveBeenCalled();
	});

	it("missing presets.json is an empty catalog — placement proceeds without metadata", async () => {
		readJsonTextMock.mockResolvedValue(null);
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		const ok = await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-x"],
		});
		expect(ok).toBe(true);
		const persistArgs = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(persistArgs?.presets).toEqual([]);
	});

	it("empty-but-valid catalog (presets: []) does not throw", async () => {
		readJsonTextMock.mockResolvedValue(
			JSON.stringify({ version: 1, presets: [] }),
		);
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		const ok = await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-x"],
		});
		expect(ok).toBe(true);
	});
});
