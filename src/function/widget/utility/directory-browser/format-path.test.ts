import { describe, expect, it } from "vitest";
import { formatPathForMode } from "./format-path";

describe("formatPathForMode", () => {
	const roots = [
		{ label: "Preset Root", path: "C:\\AE\\presets" },
		{ label: "Script Root", path: "C:\\AE\\scripts" },
	];

	it("returns the raw path in filesystem mode", () => {
		expect(formatPathForMode("filesystem", "C:\\foo\\bar.ffx", roots)).toBe(
			"C:\\foo\\bar.ffx",
		);
	});

	it("returns raw path when no anchor root matches", () => {
		expect(formatPathForMode("anchors", "D:\\elsewhere\\x.ffx", roots)).toBe(
			"D:\\elsewhere\\x.ffx",
		);
	});

	it("renders {Root Label}/relative for an anchor path under a known root", () => {
		expect(
			formatPathForMode("anchors", "C:\\AE\\presets\\subdir\\file.ffx", roots),
		).toBe("{Preset Root}/subdir/file.ffx");
	});

	it("returns the last path segment in catalog mode at a subfolder", () => {
		expect(
			formatPathForMode("presetsCatalog", "C:\\AE\\presets\\MyGroup", []),
		).toBe("MyGroup");
	});

	it("returns the last path segment in catalog mode at the root", () => {
		expect(formatPathForMode("presetsCatalog", "C:\\AE\\presets", [])).toBe(
			"presets",
		);
	});

	it("returns the empty string unchanged", () => {
		expect(formatPathForMode("filesystem", "", roots)).toBe("");
	});
});
