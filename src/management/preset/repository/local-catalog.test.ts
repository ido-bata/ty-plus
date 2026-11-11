// @vitest-environment happy-dom

/**
 * Local preset catalog — Issue #145.
 *
 * These tests exist to pin the contract that the local catalog is reachable
 * with no cloud gateway at all, and that "empty" and "failed" are different
 * answers. Both halves are load-bearing: a regression in either one is the
 * empty-success shape this repository has shipped more than once.
 *
 * The gateway side is mocked to throw `GatewayBootRequiredError` if it is ever
 * touched, so a future edit that routes a local read back through
 * `getDataServices()` fails here rather than passing quietly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageModule = vi.hoisted(() => ({
	readJson: vi.fn(),
	readJsonText: vi.fn(),
	writePresetsJson: vi.fn(),
}));

vi.mock("@/management/storage/persistence", () => ({
	readJson: storageModule.readJson,
	readJsonText: storageModule.readJsonText,
}));

vi.mock("@/management/storage", async () => ({
	readPresetsJson: (await import("@/management/catalog/json-files"))
		.readPresetJson,
	writePresetsJson: storageModule.writePresetsJson,
}));

vi.mock("@/management/storage/ids", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/management/storage/ids")>()),
	catalogJsonMayContainLegacyIdPrefixes: vi.fn(() => false),
}));

// The local catalog must not reach the cloud boot boundary at all. Making the
// whole module explode on import is the strongest available assertion: any
// accidental import of `getDataServices` from this dependency graph fails the
// suite instead of silently working in tests and breaking in the host.
vi.mock("@/management/workspace/services", () => {
	throw new Error(
		"local-catalog must not depend on the cloud boot boundary (Issue #145)",
	);
});

import { PresetCatalogParseError } from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";
import {
	__resetLocalPresetCatalogForTests,
	createLocalPresetCatalog,
	getLocalPresetCatalog,
} from "@/management/preset/repository/local-catalog";
import { createSharedPresetRepository } from "@/management/preset/repository/shared";

const win = {} as Window;

const preset = (id: string): Preset => ({
	id,
	type: "preset",
	title: `Preset ${id}`,
	filePath: `/presets/${id}.json`,
});

const catalogText = (rows: Preset[]): string =>
	JSON.stringify({ version: 1, presets: rows });

/** Minimal repository shape the shared factory needs from its base. */
const LOCAL_ONLY_SHAPE = {
	list: async (): Promise<Preset[]> => [],
	getById: async (): Promise<Preset | undefined> => undefined,
	listLocalPresets: (): Preset[] => [],
	upsertLocalPreset: async (): Promise<void> => {},
	removeLocalPreset: async (): Promise<void> => {},
};

beforeEach(() => {
	__resetLocalPresetCatalogForTests();
	storageModule.readJson.mockReset();
	storageModule.readJson.mockResolvedValue(null);
	storageModule.readJsonText.mockReset();
	storageModule.writePresetsJson.mockReset();
	storageModule.writePresetsJson.mockResolvedValue(undefined);
});

describe("local preset catalog with no cloud gateway", () => {
	it("lists local rows while the gateway has never booted", async () => {
		storageModule.readJsonText.mockResolvedValue(
			catalogText([preset("a"), preset("b")]),
		);

		const rows = await getLocalPresetCatalog(win).list();

		expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
	});

	it("reads the catalog straight from presets.json on every list", async () => {
		storageModule.readJsonText.mockResolvedValue(catalogText([preset("a")]));

		await getLocalPresetCatalog(win).list();
		// A row saved after the first read must be visible to the next one —
		// an in-memory snapshot pinned at first read is the stale-read shape.
		storageModule.readJsonText.mockResolvedValue(
			catalogText([preset("a"), preset("b")]),
		);
		const rows = await getLocalPresetCatalog(win).list();

		expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
	});

	it("returns the same instance for the same window so callers share one writer", () => {
		expect(getLocalPresetCatalog(win)).toBe(getLocalPresetCatalog(win));
	});

	it("touches storage only when the catalog is read, not when it is built", async () => {
		// Importing this module already happened without the storage mock ever
		// being called, so there is no module-evaluation singleton. What is left
		// to pin is that *construction* is inert: a module-level
		// `getLocalPresetCatalog(window)` evaluated at import time would have
		// started a read that this fresh window's instance has not started.
		const other = {} as Window;
		const built = getLocalPresetCatalog(other);
		expect(storageModule.readJsonText).not.toHaveBeenCalled();

		storageModule.readJsonText.mockResolvedValue(catalogText([preset("a")]));
		await built.list();

		expect(storageModule.readJsonText).toHaveBeenCalledTimes(1);
	});
});

describe("empty catalog vs load failure", () => {
	it("treats a missing catalog file as an empty catalog, not a failure", async () => {
		storageModule.readJsonText.mockResolvedValue(null);

		await expect(getLocalPresetCatalog(win).list()).resolves.toEqual([]);
	});

	it("treats a catalog file with zero rows as an empty catalog", async () => {
		storageModule.readJsonText.mockResolvedValue(catalogText([]));

		await expect(getLocalPresetCatalog(win).list()).resolves.toEqual([]);
	});

	it("fails loudly on a corrupt catalog instead of reporting an empty one", async () => {
		storageModule.readJsonText.mockResolvedValue("{ not json");

		await expect(getLocalPresetCatalog(win).list()).rejects.toBeInstanceOf(
			PresetCatalogParseError,
		);
	});

	it("reads raw catalog text without using the lossy parsed-object reader", async () => {
		storageModule.readJsonText.mockResolvedValue(catalogText([preset("a")]));

		await expect(getLocalPresetCatalog(win).list()).resolves.toEqual([
			expect.objectContaining({ id: "a" }),
		]);
		expect(storageModule.readJsonText).toHaveBeenCalledWith(
			win,
			"presetCatalog",
		);
		expect(storageModule.readJson).not.toHaveBeenCalled();
	});

	it("fails loudly on a catalog whose rows are all invalid", async () => {
		storageModule.readJsonText.mockResolvedValue(
			catalogText([{ nope: true } as unknown as Preset]),
		);

		await expect(getLocalPresetCatalog(win).list()).rejects.toBeInstanceOf(
			PresetCatalogParseError,
		);
	});

	it("propagates a host read failure rather than swallowing it to []", async () => {
		storageModule.readJsonText.mockRejectedValue(new Error("EACCES"));

		await expect(getLocalPresetCatalog(win).list()).rejects.toThrow("EACCES");
	});
});

describe("local CRUD without a gateway", () => {
	it("persists an upsert to presets.json and reads it back", async () => {
		storageModule.readJsonText.mockResolvedValue(null);
		const catalog = getLocalPresetCatalog(win);

		await catalog.upsertLocalPreset(preset("new"));

		expect(storageModule.writePresetsJson).toHaveBeenCalledWith(
			win,
			expect.stringContaining('"new"'),
		);
		// The file the write produced is the file the next read sees. Compared
		// on identity fields only: `normalizePresets` is what gives every row
		// its default icon, so a deep compare against the pre-normalization
		// input would be asserting the wrong thing.
		storageModule.readJsonText.mockResolvedValue(
			storageModule.writePresetsJson.mock.calls.at(-1)?.[1] as string,
		);
		const rows = await catalog.list();
		expect(rows.map((row) => row.id)).toEqual(["new"]);
		expect(rows[0]).toMatchObject({
			title: "Preset new",
			filePath: "/presets/new.json",
		});
	});

	it("removes a row from presets.json", async () => {
		storageModule.readJsonText.mockResolvedValue(
			catalogText([preset("a"), preset("b")]),
		);
		const catalog = getLocalPresetCatalog(win);

		await catalog.removeLocalPreset("a");

		const written = storageModule.writePresetsJson.mock.calls.at(
			-1,
		)?.[1] as string;
		expect(JSON.parse(written).presets.map((r: Preset) => r.id)).toEqual(["b"]);
	});

	it("resolves a local id without consulting anything remote", async () => {
		storageModule.readJsonText.mockResolvedValue(catalogText([preset("a")]));

		await expect(
			getLocalPresetCatalog(win).getById("a"),
		).resolves.toMatchObject({
			id: "a",
		});
	});

	it("reports a local miss as undefined rather than an error", async () => {
		storageModule.readJsonText.mockResolvedValue(catalogText([preset("a")]));

		await expect(
			getLocalPresetCatalog(win).getById("missing"),
		).resolves.toBeUndefined();
	});
});

describe("stale-read behaviour (Issue #145)", () => {
	/*
	 * The race this issue describes — "the catalog is read before boot
	 * completes, the empty result is cached and never refreshed" — cannot
	 * occur in the decoupled design: the local catalog never waits on boot, so
	 * there is no "before" for an empty read to land in. These tests pin the
	 * two caching questions that replace it.
	 */

	it("honours a deletion made through another surface", async () => {
		// Warm the cache…
		storageModule.readJsonText.mockResolvedValue(
			catalogText([preset("a"), preset("b")]),
		);
		const catalog = getLocalPresetCatalog(win);
		expect((await catalog.list()).map((row) => row.id)).toEqual(["a", "b"]);

		// …then the rows go away underneath it (a different window wrote the
		// file, or the user deleted them elsewhere).
		storageModule.readJsonText.mockResolvedValue(catalogText([]));

		await expect(catalog.list()).resolves.toEqual([]);
	});

	it("shows a second surface the rows the first one wrote", async () => {
		// Two independent catalogs over the same window stand in for the panel
		// and a modeless dialog. The write below goes through one of them; the
		// other must see it on its next read without any cache invalidation
		// signal, because there is no boot event to hang one on.
		const writing = createLocalPresetCatalog(win);
		const reading = createLocalPresetCatalog(win);
		storageModule.readJsonText.mockResolvedValue(null);

		await writing.upsertLocalPreset(preset("fresh"));

		// The file now holds what the writer produced; both catalogs read it.
		storageModule.readJsonText.mockResolvedValue(
			storageModule.writePresetsJson.mock.calls.at(-1)?.[1] as string,
		);

		expect((await writing.list()).map((row) => row.id)).toEqual(["fresh"]);
		await expect(reading.list()).resolves.toEqual([
			expect.objectContaining({ id: "fresh" }),
		]);
	});

	it("does not write the stale cache back over an emptied catalog file", async () => {
		storageModule.readJsonText.mockResolvedValue(
			catalogText([preset("a"), preset("b")]),
		);
		const catalog = getLocalPresetCatalog(win);
		await catalog.list();

		storageModule.readJsonText.mockResolvedValue(catalogText([]));
		storageModule.writePresetsJson.mockClear();
		await catalog.list();

		// Rewriting here would resurrect presets the user deleted.
		expect(storageModule.writePresetsJson).not.toHaveBeenCalled();
	});

	it("still writes back a base seed into a genuinely empty file", async () => {
		// The write-back the shared repository performs exists for the boot
		// path, whose base repository holds in-memory locals the file has never
		// seen. It must survive the fix above.
		const seeded = {
			...LOCAL_ONLY_SHAPE,
			listLocalPresets: () => [preset("seeded")],
		};

		const rows = await createSharedPresetRepository(seeded, {
			read: async (): Promise<Preset[]> => [],
			write: async (rowsToWrite) => {
				storageModule.writePresetsJson(win, JSON.stringify(rowsToWrite));
			},
		}).list();

		expect(rows.map((row) => row.id)).toEqual(["seeded"]);
		// The seed reached the file, which is the whole point of the write-back.
		expect(
			JSON.parse(
				storageModule.writePresetsJson.mock.calls.at(-1)?.[1] as string,
			).map((row: Preset) => row.id),
		).toEqual(["seeded"]);
	});
});
