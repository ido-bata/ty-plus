import { describe, expect, it } from "vitest";

import {
	findSiblingImagePathForPresetFile,
	isPresetSidekickSourcePath,
	normalizeSiblingDirPath,
	siblingPathKey,
} from "./thumbnail";

describe("sibling-thumbnail", () => {
	it("normalizeSiblingDirPath strips Win32 long-path prefix", () => {
		expect(normalizeSiblingDirPath("//?/D:/work")).toBe("D:/work");
		expect(normalizeSiblingDirPath("\\\\?\\D:\\work")).toBe("D:/work");
	});

	it("siblingPathKey matches long-path and normal directory strings", () => {
		expect(siblingPathKey("C:\\Ae\\x")).toBe(siblingPathKey("//?/C:/Ae/x"));
	});

	it("findSiblingImagePathForPresetFile resolves same-folder stem match", () => {
		const entries = [
			{ name: "Foo.ffx", path: "D:/x/Foo.ffx", isDirectory: false },
			{ name: "Foo.png", path: "D:/x/Foo.png", isDirectory: false },
		];
		expect(findSiblingImagePathForPresetFile("D:/x/Foo.ffx", entries)).toBe(
			"D:/x/Foo.png",
		);
	});

	it("findSiblingImagePathForPresetFile ignores same stem in a different folder", () => {
		const entries = [
			{ name: "Foo.png", path: "D:/a/Foo.png", isDirectory: false },
		];
		expect(
			findSiblingImagePathForPresetFile("D:/b/Foo.ffx", entries),
		).toBeNull();
	});

	it("findSiblingImagePathForPresetFile works when preset path uses long-path prefix", () => {
		const entries = [
			{ name: "Foo.ffx", path: "D:/x/Foo.ffx", isDirectory: false },
			{ name: "Foo.png", path: "D:/x/Foo.png", isDirectory: false },
		];
		expect(findSiblingImagePathForPresetFile("//?/D:/x/Foo.ffx", entries)).toBe(
			"D:/x/Foo.png",
		);
	});

	it("matches JSX sources to sibling images (issue #191)", () => {
		expect(isPresetSidekickSourcePath("D:/x/Tool.JSX")).toBe(true);
		expect(isPresetSidekickSourcePath("D:/x/Tool.jsxbin")).toBe(true);
		const entries = [
			{ name: "Tool.png", path: "D:/x/Tool.png", isDirectory: false },
		];
		expect(findSiblingImagePathForPresetFile("D:/x/Tool.jsx", entries)).toBe(
			"D:/x/Tool.png",
		);
	});

	it("normalizes mixed slashes and case when matching parents", () => {
		const entries = [
			{
				name: "Foo.png",
				path: "C:\\Ae\\Presets\\Foo.png",
				isDirectory: false,
			},
		];
		expect(
			findSiblingImagePathForPresetFile("c:/ae/presets/Foo.ffx", entries),
		).toBe("C:\\Ae\\Presets\\Foo.png");
	});

	it("returns null when no sibling image exists", () => {
		const entries = [
			{ name: "Other.png", path: "D:/x/Other.png", isDirectory: false },
			{ name: "Foo.txt", path: "D:/x/Foo.txt", isDirectory: false },
		];
		expect(
			findSiblingImagePathForPresetFile("D:/x/Foo.ffx", entries),
		).toBeNull();
		expect(findSiblingImagePathForPresetFile("D:/x/Foo.ffx", [])).toBeNull();
	});
});
