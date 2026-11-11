// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrossPanelLayoutWriteInput } from "@/management/workspace/placement/cross-panel-write";

const {
	persistTargetLayoutMock,
	resolveRootMock,
	readNJsonMock,
	readPresetsJsonMock,
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
	// Issue #146 / Round-4 Blocker 10: local catalog reader mock.
	// The test sets this per-case to simulate "local presets.json
	// available" (returns a JSON string) or "local presets.json
	// missing" (returns null). When null, the cloud-failure branches
	// MUST REJECT instead of silently placing.
	readPresetsJsonMock: vi.fn<(win: Window) => Promise<string | null>>(
		async () => null,
	),
	// parsePresetCatalogJsonText has a real implementation that parses
	// the JSON text returned by `readPresetsJson`. We don't mock it;
	// see imports below.
}));

/** Per-test override for the services shape. */
const servicesRef = vi.hoisted(() => ({
	mode: "working" as "working" | "throws" | "list-throws" | "null",
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

vi.mock("@/management/workspace/services", () => ({
	getDataServices: () => {
		if (servicesRef.mode === "null") return null as never;
		if (servicesRef.mode === "throws") {
			throw new Error("Gateway boot required (Issue #128)");
		}
		const listImpl = async () => {
			if (servicesRef.mode === "list-throws") {
				throw new Error("gateway offline");
			}
			// The cloud repo returns the *real* presets list — round 1+2
			// tests still expect this code path to work.
			return [
				{
					id: "preset-cloud",
					type: "preset",
					title: "preset-cloud",
					filePath: "C:/preset-cloud.ffx",
				},
			];
		};
		return {
			presetRepository: { list: listImpl },
			gateway: {
				provider: "supabase" as const,
				resolvePreset: async () => {
					throw new Error("not used in this test");
				},
			},
			cloudSync: {},
			resolveSystemPaths: () => ({
				hostId: "AE",
				operatingSystem: "win",
				userSupportRoot: "",
				hostSupportRoot: "",
				presetRoot: "",
				scriptRoot: "",
			}),
			bootMode: "live" as const,
		};
	},
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
	readPresetsJson: readPresetsJsonMock,
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
	readPresetsJsonMock.mockClear();
	readPresetsJsonMock.mockResolvedValue(null);
	debugMocks.warnCalls.length = 0;
	debugMocks.infoCalls.length = 0;
	servicesRef.mode = "working";
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

describe("tryPersistAppendPresetFromDialog (Issue #146 / Defect B + Round-4 Blocker 10)", () => {
	it("Test B.1 — getDataServices() throws → local catalog read; placement produced with parsed metadata", async () => {
		servicesRef.mode = "throws";
		// Round-4 Blocker 10 fix: the local fallback must read the real
		// presets.json, not silently produce an empty `presets` list.
		readPresetsJsonMock.mockResolvedValueOnce(localCatalogText("preset-z"));
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
		// The `presets` arg passed to persistTargetLayout MUST be the
		// parsed local catalog — not `[]`. This is the Blocker 10
		// invariant.
		expect(persistArgs?.presets).toEqual([
			expect.objectContaining({ id: "preset-z" }),
		]);
		const warn = debugMocks.warnCalls.find(
			(c) =>
				c.message ===
				"append-preset-from-dialog-disk:data-services-unavailable-using-local-catalog",
		);
		expect(warn).toBeDefined();
		expect(warn?.context?.step).toBe("getDataServices");
	});

	it("Test B.2 — presetRepository.list() throws → warn + local-catalog read; presets arg is the parsed metadata", async () => {
		servicesRef.mode = "list-throws";
		readPresetsJsonMock.mockResolvedValueOnce(localCatalogText("preset-w"));
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		const ok = await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-w"],
		});
		expect(ok).toBe(true);
		expect(persistTargetLayoutMock).toHaveBeenCalledTimes(1);
		const persistArgs = persistTargetLayoutMock.mock.calls[0]?.[1];
		expect(persistArgs?.presets).toEqual([
			expect.objectContaining({ id: "preset-w" }),
		]);
		const warn = debugMocks.warnCalls.find(
			(c) =>
				c.message ===
				"append-preset-from-dialog-disk:cloud-gateway-offline-using-local-catalog",
		);
		expect(warn).toBeDefined();
		expect(warn?.context?.step).toBe("presetRepository.list");
	});

	it("Test B.3 — getDataServices() returns a working repo → normal path, placement produced, no warn", async () => {
		servicesRef.mode = "working";
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		const ok = await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-cloud"],
		});
		expect(ok).toBe(true);
		expect(persistTargetLayoutMock).toHaveBeenCalledTimes(1);
		const persistArgs = persistTargetLayoutMock.mock.calls[0]?.[1];
		// The cloud path returns the cloud's preset list — confirmed via
		// the `working` mode returning `[{id: "preset-cloud", ...}]`.
		expect(persistArgs?.presets).toEqual([
			expect.objectContaining({ id: "preset-cloud" }),
		]);
		const fallbackWarn = debugMocks.warnCalls.find(
			(c) =>
				c.message ===
					"append-preset-from-dialog-disk:cloud-gateway-offline-using-local-catalog" ||
				c.message ===
					"append-preset-from-dialog-disk:data-services-unavailable-using-local-catalog",
		);
		expect(fallbackWarn).toBeUndefined();
	});

	it("Test B.4 — cloud offline AND local presets.json missing → REJECTS (no silent success)", async () => {
		// Issue #146 / Round-4 Blocker 10 explicitly forbids the
		// "swallow failure to []" pattern. The caller (PathDialog save
		// flow) must NOT treat a missing catalog as a successful no-op.
		servicesRef.mode = "list-throws";
		readPresetsJsonMock.mockResolvedValueOnce(null);
		await expect(
			tryPersistAppendPresetFromDialog(window, {
				targetPanelId: "panel-1",
				catalogRefIds: ["preset-orphan"],
			}),
		).rejects.toThrow(
			/cloud gateway is offline AND local presets\.json is unavailable/,
		);
		// Critical: persistTargetLayout MUST NOT have been called.
		expect(persistTargetLayoutMock).not.toHaveBeenCalled();
	});

	it("Test B.5 — getDataServices() throws AND local presets.json missing → REJECTS", async () => {
		servicesRef.mode = "throws";
		readPresetsJsonMock.mockResolvedValueOnce(null);
		await expect(
			tryPersistAppendPresetFromDialog(window, {
				targetPanelId: "panel-1",
				catalogRefIds: ["preset-orphan"],
			}),
		).rejects.toThrow(
			/data services unavailable AND local presets\.json is unavailable/,
		);
		expect(persistTargetLayoutMock).not.toHaveBeenCalled();
	});

	it("Test B.6 — local catalog read returns valid JSON; parsed entries flow into persistTargetLayout", async () => {
		servicesRef.mode = "throws";
		readPresetsJsonMock.mockResolvedValueOnce(
			localCatalogText("preset-a", "preset-b"),
		);
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-a"],
		});
		const persistArgs = persistTargetLayoutMock.mock.calls[0]?.[1];
		// Two presets in the local catalog; the dialog only added one,
		// but the persistTargetLayout call MUST have the full catalog as
		// its `presets` argument so the merge sees both entries.
		expect(persistArgs?.presets).toHaveLength(2);
		expect(persistArgs?.presets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "preset-a" }),
				expect.objectContaining({ id: "preset-b" }),
			]),
		);
		// catalogIdsToMove is filtered to NEW ids only (preset-b is not
		// in catalogRefIds).
		expect(persistArgs?.catalogIdsToMove).toEqual(["preset-a"]);
	});

	it("Test B.7 — cloud list fails AND local presets.json is corrupt JSON → REJECTS with PresetCatalogParseError", async () => {
		// Round-5 Blocker 13: parsePresetCatalogJsonText silently returned
		// [] for invalid JSON. The local fallback now uses the strict
		// parser so corrupt input is surfaced as a placement failure
		// (not a silent empty-catalog placement).
		servicesRef.mode = "list-throws";
		readPresetsJsonMock.mockResolvedValueOnce("not-valid-json{{");
		await expect(
			tryPersistAppendPresetFromDialog(window, {
				targetPanelId: "panel-1",
				catalogRefIds: ["preset-corrupt"],
			}),
		).rejects.toThrow(
			/cloud gateway is offline AND local presets\.json is corrupt \(json-parse-failed\)/,
		);
		// Critical: persistTargetLayout MUST NOT have been called.
		expect(persistTargetLayoutMock).not.toHaveBeenCalled();
		// Critical: readPresetsJson must be called exactly once (single
		// read per cloud failure — Needs-fix 1).
		expect(readPresetsJsonMock).toHaveBeenCalledTimes(1);
	});

	it("Test B.8 — getDataServices throws AND local presets.json is corrupt (root-not-array) → REJECTS with PresetCatalogParseError", async () => {
		servicesRef.mode = "throws";
		// Valid JSON but the top-level `presets` is not an array.
		readPresetsJsonMock.mockResolvedValueOnce(
			JSON.stringify({ presets: { not: "an array" } }),
		);
		await expect(
			tryPersistAppendPresetFromDialog(window, {
				targetPanelId: "panel-1",
				catalogRefIds: ["preset-corrupt"],
			}),
		).rejects.toThrow(
			/data services unavailable AND local presets\.json is corrupt \(root-not-array\)/,
		);
		expect(persistTargetLayoutMock).not.toHaveBeenCalled();
		// Single read per cloud failure.
		expect(readPresetsJsonMock).toHaveBeenCalledTimes(1);
	});

	it("Test B.9 — empty-but-valid local catalog (presets: []) is allowed → no parse-throw; placement proceeds with empty catalog", async () => {
		// A legitimately empty catalog is NOT an error — only corrupt
		// catalogs are. The empty array goes through to persistTargetLayout
		// (which will then receive catalogIdsToMove: ["preset-x"] but
		// presets: [] — placement will still write; this test asserts the
		// parser does NOT throw on an empty array, the strict-parse layer
		// boundary, and that the function does NOT reject at the parser
		// boundary.
		servicesRef.mode = "list-throws";
		readPresetsJsonMock.mockResolvedValueOnce(
			JSON.stringify({ version: 1, presets: [] }),
		);
		readNJsonMock.mockResolvedValueOnce(
			JSON.stringify({ gridCells: [], presetLayoutRoster: [] }),
		);
		await tryPersistAppendPresetFromDialog(window, {
			targetPanelId: "panel-1",
			catalogRefIds: ["preset-x"],
		});
		// The parser accepts the empty array — no REJECT at this boundary.
		expect(readPresetsJsonMock).toHaveBeenCalledTimes(1);
	});
});
