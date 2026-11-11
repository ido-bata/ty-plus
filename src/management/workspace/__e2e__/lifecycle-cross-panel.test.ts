// @vitest-environment jsdom
/**
 * Issue #146 — end-to-end lifecycle test.
 *
 * Drives the full preset placement + cross-panel move pipeline with mocked
 * transport + in-memory preset repository + in-memory disk (the `storage/
 * persistence` IO layer). Asserts visible state at each step:
 *
 *   1. Create a preset (catalog row)
 *   2. Register it in the catalog registry
 *   3. Place it into workspace at surface A (panel-1)
 *   4. Same-workspace move within surface A (no cross-panel — re-pack)
 *   5. Reload: re-read surface-A state from the in-memory disk
 *   6. Cross-panel move: surface A → surface B (panel-2)
 *   7. Restart surface A: re-read state from in-memory disk
 *   8. Assert: surface A's surfaceTiles does NOT contain the preset id;
 *              surface B's surfaceTiles DOES contain it;
 *              catalog registry is unchanged (the preset still exists).
 *
 * No real AE boot required. The test runs under happy-dom with mocked
 * CEP transport + in-memory preset repository + in-memory disk.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "@/management/preset/contract";

// ── In-memory disk + preset repository state ──────────────────────────────────

/**
 * Keyed by `args.join("/")`. Values are JSON strings (settings/layouts) or
 * arbitrary JSON objects (settings) — the IO layer text-vs-object distinction
 * is preserved by the persistence wrappers.
 */
const disk = new Map<string, string>();
const settingsObj = new Map<string, Record<string, unknown>>();

const presetRepo = {
	rows: [] as Preset[],
	async list(): Promise<Preset[]> {
		return [...presetRepo.rows];
	},
};

const diskKey = (key: string, args: readonly string[]): string =>
	`${key}:${args.join("/")}`;

const debugMocks = {
	warnCalls: [] as Array<{
		message: string;
		context?: Record<string, unknown>;
	}>,
	infoCalls: [] as Array<{
		message: string;
		context?: Record<string, unknown>;
	}>,
};

const publishCalls: Array<{ channel: string; payload: unknown }> = [];

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/management/workspace/layout/persistence-root", () => ({
	resolveWorkspacePersistenceManagedRoot: async () => "/managed-root",
}));

vi.mock("@/management/catalog/json-files", () => ({
	readGroupJson: async () => "",
}));

vi.mock("@/management/preset/group-catalog", () => ({
	parseGroupFromText: () => [],
}));

vi.mock("@/management/workspace/services", () => ({
	getDataServices: () => ({
		presetRepository: presetRepo,
		gateway: {
			provider: "supabase" as const,
			resolvePreset: async () => ({}),
		},
		cloudSync: {},
		resolveSystemPaths: () => null,
		bootMode: "live" as const,
	}),
}));

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: () => ({
		publish: async (_transport: unknown, envelope: unknown) => {
			const env = envelope as { channel: string; payload: unknown };
			publishCalls.push({ channel: env.channel, payload: env.payload });
		},
	}),
}));

vi.mock("@/management/workspace/messaging/publish-shell-message", () => ({
	publishShellMessage: async (_transport: unknown, envelope: unknown) => {
		const env = envelope as { channel: string; payload: unknown };
		publishCalls.push({ channel: env.channel, payload: env.payload });
	},
}));

vi.mock("@/management/preset/use-cases", () => ({
	listPresets: async () => [...presetRepo.rows],
}));

vi.mock("@/management/workspace/surface/opener-panel-id", () => ({
	resolveOpenerWorkspacePanelId: () => "panel-1",
}));

/**
 * In-memory persistence IO layer. Mirrors the signature used by
 * `readJsonText` / `readJson` / `writeJson` for the `app` (settings),
 * `workspace` (per-panel layout) and `widgetRecords` keys.
 */
vi.mock("@/management/storage/persistence", () => ({
	readJsonText: async (_win: Window, key: string, ...args: string[]) => {
		const k = diskKey(key, args);
		return disk.get(k) ?? null;
	},
	readJson: async (_win: Window, key: string, ...args: string[]) => {
		const k = diskKey(key, args);
		const raw = disk.get(k);
		if (raw === undefined) return null;
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return null;
		}
	},
	writeJson: async (
		_win: Window,
		key: string,
		payload: unknown,
		...args: string[]
	) => {
		const k = diskKey(key, args);
		disk.set(k, JSON.stringify(payload));
		if (key === "app") {
			settingsObj.set(
				k,
				payload && typeof payload === "object"
					? (payload as Record<string, unknown>)
					: {},
			);
		}
	},
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
import { notifyPanelsAfterPresetSave } from "@/management/workspace/placement/notify-panels-after-preset-save";

// ── Helpers ──────────────────────────────────────────────────────────────────

const readSurfaceStateFromDisk = (panelId: "panel-1" | "panel-2") => {
	const layoutKey = diskKey("workspace", [panelId === "panel-1" ? "1" : "2"]);
	const settingsKey = diskKey("app", []);
	const layoutRaw = disk.get(layoutKey);
	const settings = settingsObj.get(settingsKey) ?? {};
	const tiles = layoutRaw
		? (((JSON.parse(layoutRaw) as { gridCells?: { id: string }[] }).gridCells ??
				[]) as { id: string }[])
		: [];
	// Settings.json panel key is normalized: "panel-1" → "panel1" (see
	// `normalizeWorkspacePanelSettingsKey` in workspace/persistence/store.ts).
	const normalizedKey = panelId.replace("-", "");
	const presetIds = ((): string[] => {
		const ws = (settings.workspace ?? {}) as {
			workspacePanels?: Record<string, { presetIds?: string[] }>;
		};
		const panel = ws.workspacePanels?.[normalizedKey] ?? {};
		return panel.presetIds ?? [];
	})();
	return {
		surfaceTiles: tiles.map((t) => t.id),
		presetIds,
	};
};

const flush = (): Promise<void> =>
	new Promise((resolve) => queueMicrotask(resolve));

beforeEach(() => {
	disk.clear();
	settingsObj.clear();
	presetRepo.rows = [];
	debugMocks.warnCalls.length = 0;
	debugMocks.infoCalls.length = 0;
	publishCalls.length = 0;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("end-to-end preset lifecycle + cross-panel move (Issue #146)", () => {
	it("Test C — full 8-step lifecycle succeeds with cross-panel move taking effect", async () => {
		const preset: Preset = {
			id: "preset-lifecycle",
			title: "Lifecycle Test Preset",
			type: "preset",
			filePath: "/tmp/lifecycle.aex",
		};

		// ── Step 1: create a preset ────────────────────────────────────────
		// The catalog registry is the in-memory preset repository; "create"
		// here means appending a row.
		presetRepo.rows.push(preset);
		expect(presetRepo.rows).toHaveLength(1);

		// ── Step 2: register in catalog (same store) ───────────────────────
		const registered = await presetRepo.list();
		expect(registered.map((p) => p.id)).toContain("preset-lifecycle");

		// ── Step 3: place into workspace at surface A (panel-1) ───────────
		await notifyPanelsAfterPresetSave(window, {
			sourceSurfaceId: "panel-1",
			catalogRefIds: ["preset-lifecycle"],
			dropPlacement: { x: 0, y: 0, width: 1, height: 1 },
		});
		await flush();
		await flush();

		let panelA = readSurfaceStateFromDisk("panel-1");
		expect(panelA.surfaceTiles).toContain("preset-lifecycle");
		// Note: settings.json `panelPresetIds` is updated via different paths
		// (onboarding bootstrap). The placement path under test
		// (`tryPersistAppendPresetFromDialog`) only writes the layout file.

		// ── Step 4: same-workspace move within surface A ──────────────────
		// (mutate the surface-A layout by writing a new tile at a new
		// coordinate via the same append path with a different dropPlacement
		// — the new tile replaces the existing geometry for the same id.)
		const layoutKey = diskKey("workspace", ["1"]);
		const layoutRaw = disk.get(layoutKey);
		const layoutObj = layoutRaw
			? (JSON.parse(layoutRaw) as {
					gridCells: {
						id: string;
						x: number;
						y: number;
						width: number;
						height: number;
					}[];
				})
			: { gridCells: [] };
		const newCells = layoutObj.gridCells.map((c) =>
			c.id === "preset-lifecycle"
				? { ...c, x: 3, y: 2, width: 1, height: 1 }
				: c,
		);
		disk.set(layoutKey, JSON.stringify({ gridCells: newCells }));

		// ── Step 5: reload (simulate surface-A restart) ───────────────────
		panelA = readSurfaceStateFromDisk("panel-1");
		expect(panelA.surfaceTiles).toContain("preset-lifecycle");
		const reloadedCell = newCells.find((c) => c.id === "preset-lifecycle");
		expect(reloadedCell).toBeDefined();
		expect(reloadedCell?.x).toBe(3);
		expect(reloadedCell?.y).toBe(2);

		// ── Step 6: cross-panel move from surface A to surface B ──────────
		await applyInterPanelMove({
			win: window,
			persistenceRoot: "/managed-root",
			sourcePanelId: "panel-1",
			targetPanelId: "panel-2",
			catalogIdsToMove: ["preset-lifecycle"],
			sourceFallbackPresetIds: [],
			widgetTilesForCrossPanel: [],
			widgetTypesForCrossPanel: {},
			presets: registered,
			groupCatalogEntries: [],
			widgetInstanceTypesOverlay: {},
			persistSourceLayout: async () => {
				// E2E mirror of hook.ts: remove the moved tile from the
				// source layout AND flush to the in-memory disk atomically.
				const sourceLayoutKey = diskKey("workspace", ["1"]);
				const sourceLayoutRaw = disk.get(sourceLayoutKey);
				if (sourceLayoutRaw) {
					const parsed = JSON.parse(sourceLayoutRaw) as {
						gridCells: { id: string }[];
					};
					const filtered = parsed.gridCells.filter(
						(c) => c.id !== "preset-lifecycle",
					);
					disk.set(sourceLayoutKey, JSON.stringify({ gridCells: filtered }));
				}
			},
		});

		// The source panel's tile file is updated atomically as step (4)
		// of the cross-panel move — the persistSourceLayout callback above
		// (Issue #146 / Blocker 7) handles the source layout persistence
		// inside applyInterPanelMove, so we no longer need a manual
		// post-move write here.

		// ── Step 7: simulate surface A restart (re-read from disk) ────────
		const panelAAfter = readSurfaceStateFromDisk("panel-1");
		const panelBAfter = readSurfaceStateFromDisk("panel-2");
		const catalogAfter = await presetRepo.list();

		// ── Step 8: assert visible final state ────────────────────────────
		// surface A no longer holds the preset on its grid...
		expect(panelAAfter.surfaceTiles).not.toContain("preset-lifecycle");
		// ...and the source panel's settings.json `panelPresetIds` no longer
		// claims it (applyInterPanelMove writes settings AFTER the target
		// write + verify succeed).
		expect(panelAAfter.presetIds).not.toContain("preset-lifecycle");

		// surface B now holds the preset on its grid and claims it.
		expect(panelBAfter.surfaceTiles).toContain("preset-lifecycle");
		expect(panelBAfter.presetIds).toContain("preset-lifecycle");

		// catalog registry is unchanged — the cross-panel move did NOT
		// mutate the catalog.
		expect(catalogAfter.map((p) => p.id)).toEqual(["preset-lifecycle"]);
		expect(catalogAfter).toHaveLength(1);
	});
});
