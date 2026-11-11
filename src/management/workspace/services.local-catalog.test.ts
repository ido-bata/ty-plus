import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	PresetCatalogParseError,
	parsePresetCatalogJsonTextStrict,
} from "@/management/preset/catalog-json-text";

const storageMocks = vi.hoisted(() => ({
	readPresetsJsonText: vi.fn<() => Promise<string | null>>(async () => null),
	writePresetsJson: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock("@/management/storage", async () => {
	const actual = await vi.importActual<typeof import("@/management/storage")>(
		"@/management/storage",
	);
	return {
		...actual,
		readPresetsJsonText: storageMocks.readPresetsJsonText,
		writePresetsJson: storageMocks.writePresetsJson,
	};
});

import { readLocalPresetCatalog } from "./services";

const win = {} as Window;

const validCatalog = JSON.stringify({
	version: 1,
	presets: [
		{
			id: "preset-1",
			type: "preset",
			title: "Ease In",
			filePath: "/presets/ease-in.ffx",
		},
	],
});

describe("readLocalPresetCatalog", () => {
	beforeEach(() => {
		storageMocks.readPresetsJsonText.mockReset();
		storageMocks.writePresetsJson.mockReset();
		storageMocks.writePresetsJson.mockResolvedValue(undefined);
	});

	it("returns an empty catalog when there is no file", async () => {
		storageMocks.readPresetsJsonText.mockResolvedValue(null);

		await expect(readLocalPresetCatalog(win)).resolves.toEqual([]);
		expect(storageMocks.writePresetsJson).not.toHaveBeenCalled();
	});

	it("returns an empty catalog for a blank file", async () => {
		storageMocks.readPresetsJsonText.mockResolvedValue("   \n");

		await expect(readLocalPresetCatalog(win)).resolves.toEqual([]);
	});

	it("returns an empty catalog when the file is a valid empty catalog", async () => {
		storageMocks.readPresetsJsonText.mockResolvedValue(
			JSON.stringify({ version: 1, presets: [] }),
		);

		await expect(readLocalPresetCatalog(win)).resolves.toEqual([]);
	});

	it("returns the rows of a readable catalog", async () => {
		storageMocks.readPresetsJsonText.mockResolvedValue(validCatalog);

		const rows = await readLocalPresetCatalog(win);

		expect(rows.map((p) => p.id)).toEqual(["preset-1"]);
	});

	it("throws instead of returning [] when the body is not valid JSON", async () => {
		// Corrupt text must remain a load error without rewriting the file.
		storageMocks.readPresetsJsonText.mockResolvedValue(
			'{ "version": 1, "presets": [ { "id": "preset-1"',
		);

		await expect(readLocalPresetCatalog(win)).rejects.toBeInstanceOf(
			PresetCatalogParseError,
		);
		expect(storageMocks.writePresetsJson).not.toHaveBeenCalled();
	});

	it("throws instead of returning [] when the root is not a preset array", async () => {
		storageMocks.readPresetsJsonText.mockResolvedValue(
			JSON.stringify({ presets: { nope: true } }),
		);

		await expect(readLocalPresetCatalog(win)).rejects.toMatchObject({
			reason: "root-not-array",
		});
	});

	it("matches the rows and errors of the strict parser the dialog path uses", async () => {
		// Both the boot repository (`services.ts`) and the dialog's local
		// fallback (`append-preset-from-dialog-disk.ts`) must reach the same
		// verdict for the same bytes, or a corrupt catalog reads one way from
		// one surface and another way from the other.
		const bodies = [
			"{ not json",
			JSON.stringify({ presets: "nope" }),
			JSON.stringify({ presets: [{}] }),
			JSON.stringify({ version: 1, presets: [] }),
			validCatalog,
		];
		for (const body of bodies) {
			storageMocks.readPresetsJsonText.mockResolvedValue(body);
			let viaBoot: unknown;
			try {
				viaBoot = await readLocalPresetCatalog(win);
			} catch (error) {
				viaBoot = error;
			}

			let viaStrict: unknown;
			try {
				viaStrict = parsePresetCatalogJsonTextStrict(body);
			} catch (error) {
				viaStrict = error;
			}

			if (viaStrict instanceof PresetCatalogParseError) {
				expect(viaBoot).toBeInstanceOf(PresetCatalogParseError);
				expect(viaBoot).toMatchObject({
					reason: viaStrict.reason,
					message: viaStrict.message,
				});
			} else {
				expect(viaBoot).toEqual(viaStrict);
			}
		}
	});
});
