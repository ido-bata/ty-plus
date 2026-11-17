import { describe, expect, it } from "vitest";

import { imageSrcForBrowser } from "./image-src-for-browser";

describe("imageSrcForBrowser", () => {
	it("passes through https and file URLs unchanged", () => {
		expect(imageSrcForBrowser("https://cdn.example.com/a.png")).toBe(
			"https://cdn.example.com/a.png",
		);
		expect(imageSrcForBrowser("file:///C:/preset/a.png")).toBe(
			"file:///C:/preset/a.png",
		);
	});

	it("converts POSIX absolute paths to file URLs", () => {
		expect(imageSrcForBrowser("/preset/root/a.png")).toBe(
			"file:///preset/root/a.png",
		);
	});

	it("converts Windows drive-letter paths to file URLs", () => {
		// Regression: `C:` used to match the generic URI-scheme rejection, so
		// every drive-letter path collapsed to "" and callers rendered
		// `<img src="">` (console error).
		expect(imageSrcForBrowser("C:/preset/a.png")).toBe(
			"file:///C:/preset/a.png",
		);
		expect(imageSrcForBrowser("D:\\preset\\a.png")).toBe(
			"file:///D:/preset/a.png",
		);
	});

	it("rejects unsafe or non-absolute values with an empty string", () => {
		expect(imageSrcForBrowser("")).toBe("");
		expect(imageSrcForBrowser("   ")).toBe("");
		expect(imageSrcForBrowser("data:image/png;base64,AAAA")).toBe("");
		expect(imageSrcForBrowser("javascript:alert(1)")).toBe("");
		expect(imageSrcForBrowser("relative/a.png")).toBe("");
		expect(imageSrcForBrowser("ftp://host/a.png")).toBe("");
	});
});
