import { describe, expect, it } from "vitest";

import {
	findSiblingImagePathForPresetFile,
	normalizeSiblingDirPath,
	siblingPathKey,
} from "./sibling-thumbnail";

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
});
