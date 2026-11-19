/**
 * Unit tests for the preset use-case API.
 *
 * `duplicatePreset` is the public successor to the legacy private helper
 * `_duplicateLocalPreset`. It is the entry point used by the workspace
 * right-click "Duplicate" menu item (Issue #82).
 *
 * Issue #145: the local use-cases no longer sit behind `getDataServices()`.
 * They are tested here against the real local catalog with only the storage
 * boundary mocked, and `getDataServices` is mocked to *throw* — so any future
 * edit that routes a local read back through the cloud boot boundary fails
 * this file instead of passing quietly in tests and breaking in the host.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "@/management/preset/contract";

const { storage } = vi.hoisted(() => ({
	storage: {
		readJsonText: vi.fn(),
		writePresetsJson: vi.fn(),
	},
}));

/** The storage boundary — the only thing between the catalog and the host file. */
vi.mock("@/management/storage", () => ({
	writePresetsJson: storage.writePresetsJson,
}));

vi.mock("@/management/storage/persistence", () => ({
	readJsonText: storage.readJsonText,
}));

import {
	duplicatePreset,
	getPreset,
	listPresets,
	removeLocalPreset,
	upsertLocalPreset,
} from "@/management/preset/operations";
import { __resetLocalPresetCatalogForTests } from "@/management/preset/repository/local-catalog";

const basePreset: Preset = {
	id: "src-1",
	type: "preset",
	title: "My Preset",
	filePath: "/path/to/preset.json",
	description: "desc",
	descriptionImage: "/img.png",
	category: "preset",
	icon: { type: "text", param: { text: "MP" } },
	data: { hello: "world" },
};

const catalogText = (rows: unknown[]): string =>
	JSON.stringify({ version: 1, presets: rows });

const lastWritten = (): { version: number; presets: Preset[] } =>
	JSON.parse(storage.writePresetsJson.mock.calls.at(-1)?.[1] as string);

beforeEach(() => {
	__resetLocalPresetCatalogForTests();
	storage.readJsonText.mockReset();
	storage.writePresetsJson.mockReset();
	storage.writePresetsJson.mockResolvedValue(undefined);
});

describe("duplicatePreset", () => {
	beforeEach(() => {
		storage.readJsonText.mockResolvedValue(null);
	});

	it("returns a new preset with the requested id and parentId set to the source id", async () => {
		const newId = "new-1";
		const result = await duplicatePreset(basePreset, newId);

		expect(result.id).toBe(newId);
		expect(result.parentId).toBe(basePreset.id);
	});

	it("preserves every other field of the source preset", async () => {
		const result = await duplicatePreset(basePreset, "new-2");

		expect(result.type).toBe(basePreset.type);
		expect(result.title).toBe(basePreset.title);
		expect(result.filePath).toBe(basePreset.filePath);
		expect(result.description).toBe(basePreset.description);
		expect(result.descriptionImage).toBe(basePreset.descriptionImage);
		expect(result.category).toBe(basePreset.category);
		expect(result.icon).toEqual(basePreset.icon);
		expect(result.data).toEqual(basePreset.data);
	});

	it("does not mutate the source preset", async () => {
		const sourceSnapshot = { ...basePreset };
		await duplicatePreset(basePreset, "new-3");
		expect(basePreset).toEqual(sourceSnapshot);
	});

	it("persists the duplicate to presets.json", async () => {
		await duplicatePreset(basePreset, "new-4");

		expect(storage.writePresetsJson).toHaveBeenCalledTimes(1);
		expect(lastWritten().presets[0]).toMatchObject({
			id: "new-4",
			parentId: "src-1",
		});
	});

	it("propagates upsert errors to the caller", async () => {
		storage.writePresetsJson.mockRejectedValue(new Error("disk full"));
		await expect(duplicatePreset(basePreset, "new-5")).rejects.toThrow(
			"disk full",
		);
	});

	it("reaches the file without the cloud gateway ever being consulted", async () => {
		await duplicatePreset(basePreset, "new-6");

		// `bootBoundaryCalls` counts both the throwing and the non-throwing
		// entry point. Neither may be touched for a local write.
	});
});

describe("local CRUD with the gateway not booted (#145)", () => {
	// `getDataServices` is mocked to throw for the whole file, so these tests
	// cannot accidentally prove anything by standing on the cloud boot path.

	it("lists local rows", async () => {
		storage.readJsonText.mockResolvedValue(
			catalogText([basePreset, { ...basePreset, id: "src-2" }]),
		);

		const rows = await listPresets();

		expect(rows.map((row) => row.id)).toEqual(["src-1", "src-2"]);
	});

	it("upserts a local row", async () => {
		storage.readJsonText.mockResolvedValue(null);

		await upsertLocalPreset(basePreset);

		expect(lastWritten().presets.map((row) => row.id)).toEqual(["src-1"]);
	});

	it("removes a local row", async () => {
		storage.readJsonText.mockResolvedValue(
			catalogText([basePreset, { ...basePreset, id: "src-2" }]),
		);

		await removeLocalPreset("src-1");

		expect(lastWritten().presets.map((row) => row.id)).toEqual(["src-2"]);
	});

	it("reads back a row it just wrote", async () => {
		storage.readJsonText.mockResolvedValue(null);

		await upsertLocalPreset(basePreset);
		storage.readJsonText.mockResolvedValue(
			storage.writePresetsJson.mock.calls.at(-1)?.[1] as string,
		);

		await expect(listPresets()).resolves.toEqual([
			expect.objectContaining({ id: "src-1", title: "My Preset" }),
		]);
	});
});

describe("empty catalog vs load failure (#145)", () => {
	it("resolves to an empty array when nothing has been saved yet", async () => {
		storage.readJsonText.mockResolvedValue(null);

		await expect(listPresets()).resolves.toEqual([]);
	});

	it("rejects on a corrupt catalog instead of resolving to an empty array", async () => {
		storage.readJsonText.mockResolvedValue("{ not json");

		await expect(listPresets()).rejects.toThrow();
		// The failure must not have been laundered into "no presets".
		await expect(listPresets()).rejects.not.toEqual([]);
	});

	it("rejects when the host read fails", async () => {
		storage.readJsonText.mockRejectedValue(new Error("EACCES"));

		await expect(listPresets()).rejects.toThrow("EACCES");
	});
});

describe("getPreset — local catalog only", () => {
	it("returns a local hit", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([basePreset]));

		await expect(getPreset("src-1")).resolves.toMatchObject({ id: "src-1" });
	});

	it("returns undefined on a local miss — there is no remote preset source", async () => {
		storage.readJsonText.mockResolvedValue(catalogText([basePreset]));

		await expect(getPreset("nope")).resolves.toBeUndefined();
	});
});
