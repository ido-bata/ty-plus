/**
 * Full round-trip integration test that simulates the actual on-disk
 * persistence path: writeJson → mock disk → readJson → parse.
 * This is the boundary that determines whether description / descriptionImage
 * survives the I/O layer for real.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	parsePresetCatalogJsonText,
	serializePresetCatalogJsonText,
} from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";

const { mockReadJsonFileText, mockWriteJsonFileText, mockReadRoot } =
	vi.hoisted(() => ({
		mockReadJsonFileText: vi.fn(),
		mockWriteJsonFileText: vi.fn(),
		mockReadRoot: vi.fn(),
	}));

vi.mock("@/management/storage/read/json-file", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/storage/read/json-file")
	>("@/management/storage/read/json-file");
	return { ...actual, readJsonFileText: mockReadJsonFileText };
});

vi.mock("@/management/storage/write/json-file", () => ({
	writeJsonFileText: mockWriteJsonFileText,
}));

vi.mock("@/management/storage/persistence/managed-root", () => ({
	resolveWriteManagedRoot: vi.fn().mockResolvedValue("/mock/ty-plus"),
	resolveReadManagedRoot: mockReadRoot,
}));

const { writeJson, readJson, readJsonText } = await import(
	"@/management/storage/persistence/io"
);

const win = {} as Window;

describe("preset catalog full I/O round trip", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockReadRoot.mockResolvedValue("/mock/ty-plus");
	});

	it("preserves description and descriptionImage through the persistence I/O layer", async () => {
		const preset: Preset = {
			id: "full-1",
			type: "preset",
			title: "Full Round Trip",
			filePath: "/path/to/preset.ffx",
			icon: { type: "text", param: { text: "FR" } },
			description: "This is a test description",
			descriptionImage: "/path/to/image.png",
		};

		// Step 1: Serialize the preset
		const text = serializePresetCatalogJsonText([preset]);

		// Step 2: writeJson (this is what writePresetJson does internally)
		await writeJson(win, "presetCatalog", JSON.parse(text));

		// Verify the actual on-disk text
		expect(mockWriteJsonFileText).toHaveBeenCalledTimes(1);
		const [calledWin, calledPath, calledText] =
			mockWriteJsonFileText.mock.calls[0] ?? [];
		expect(calledWin).toBe(win);
		expect(calledPath).toBe("/mock/ty-plus/presets/presets.json");
		expect(calledText).toContain('"description"');
		expect(calledText).toContain("This is a test description");
		expect(calledText).toContain('"descriptionImage"');
		expect(calledText).toContain("/path/to/image.png");

		// Step 3: readJson (this is what readPresetJson does internally)
		mockReadJsonFileText.mockResolvedValue(calledText);
		const readBack = await readJson(win, "presetCatalog");
		expect(readBack).not.toBeNull();
		const presetsRead = (readBack as { presets?: unknown }).presets;
		expect(Array.isArray(presetsRead)).toBe(true);

		// Step 4: Read back as text and re-parse via parsePresetCatalogJsonText
		const textBack = await readJsonText(win, "presetCatalog");
		const parsed = parsePresetCatalogJsonText(textBack);

		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.description).toBe("This is a test description");
		expect(parsed[0]?.descriptionImage).toBe("/path/to/image.png");
	});

	it("preserves Japanese text in description through the full I/O layer", async () => {
		const preset: Preset = {
			id: "jp-1",
			type: "preset",
			title: "日本語",
			filePath: "/path/to/preset.ffx",
			icon: { type: "text", param: { text: "日" } },
			description: "これは説明文です\n改行も含まれます",
			descriptionImage: "/画像.png",
		};

		const text = serializePresetCatalogJsonText([preset]);
		await writeJson(win, "presetCatalog", JSON.parse(text));

		const onDisk = (mockWriteJsonFileText.mock.calls[0]?.[2] as string) ?? "";
		mockReadJsonFileText.mockResolvedValue(onDisk);

		const textBack = await readJsonText(win, "presetCatalog");
		const parsed = parsePresetCatalogJsonText(textBack);

		expect(parsed[0]?.description).toBe("これは説明文です\n改行も含まれます");
		expect(parsed[0]?.descriptionImage).toBe("/画像.png");
	});

	it("handles multiple presets with description fields", async () => {
		const presets: Preset[] = [
			{
				id: "multi-1",
				type: "preset",
				title: "First",
				filePath: "/path/to/first.ffx",
				icon: { type: "text", param: { text: "1" } },
				description: "First description",
			},
			{
				id: "multi-2",
				type: "script",
				title: "Second",
				filePath: "/path/to/second.jsx",
				icon: { type: "text", param: { text: "2" } },
				descriptionImage: "/second.png",
			},
			{
				id: "multi-3",
				type: "script",
				title: "Third",
				filePath: "/path/to/third.jsx",
				icon: { type: "text", param: { text: "3" } },
				description: "Third description",
				descriptionImage: "/third.png",
			},
		];

		const text = serializePresetCatalogJsonText(presets);
		await writeJson(win, "presetCatalog", JSON.parse(text));

		const onDisk = (mockWriteJsonFileText.mock.calls[0]?.[2] as string) ?? "";
		mockReadJsonFileText.mockResolvedValue(onDisk);

		const textBack = await readJsonText(win, "presetCatalog");
		const parsed = parsePresetCatalogJsonText(textBack);

		expect(parsed).toHaveLength(3);
		expect(parsed[0]?.description).toBe("First description");
		expect(parsed[0]?.descriptionImage).toBeUndefined();
		expect(parsed[1]?.description).toBeUndefined();
		expect(parsed[1]?.descriptionImage).toBe("/second.png");
		expect(parsed[2]?.description).toBe("Third description");
		expect(parsed[2]?.descriptionImage).toBe("/third.png");
	});
});
