import { describe, expect, it } from "vitest";

import {
	assertSafeDirectoryCopy,
	isPathSameOrNested,
} from "./path-copy-safety";

describe("path-copy-safety", () => {
	it("detects nested paths", () => {
		expect(isPathSameOrNested("D:/data", "D:/data/ty-plus")).toBe(true);
		expect(isPathSameOrNested("D:/data/ty-plus", "D:/data")).toBe(false);
	});

	it("does not imply AE app install when browse root is the version folder", () => {
		const versionFolder = "D:/Adobe/Adobe After Effects 2026";
		const supportFiles = "D:/Adobe/Adobe After Effects 2026/Support Files";
		expect(isPathSameOrNested(versionFolder, supportFiles)).toBe(true);
		// A bidirectional guard against appRoot (Support Files) wrongly blocked delete
		// when the previous browse root was the parent version folder.
	});

	it("rejects copying a folder onto itself", () => {
		expect(() =>
			assertSafeDirectoryCopy("D:/data/ty-plus", "D:/data/ty-plus"),
		).toThrow(/same folder/i);
	});

	it("rejects copying when destination is inside source", () => {
		expect(() =>
			assertSafeDirectoryCopy("D:/data/ty-plus", "D:/data/ty-plus/backup"),
		).toThrow(/inside the source/i);
	});
});
