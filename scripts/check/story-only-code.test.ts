import { describe, expect, it } from "vitest";
import { findStoryOnlyFiles } from "./story-only-code";

/**
 * The checker works on an in-memory file list, so the tests describe a tiny
 * synthetic repository instead of touching the real tree.
 */
function file(path: string, imports: string[] = []) {
	return { path, kind: "source" as const, imports };
}

function story(path: string, imports: string[] = []) {
	return { path, kind: "story" as const, imports };
}

describe("findStoryOnlyFiles", () => {
	it("reports a component only a story imports", () => {
		const findings = findStoryOnlyFiles(
			[
				file("/repo/src/a/Widget.tsx"),
				story("/repo/src/a/Widget.stories.tsx", ["/repo/src/a/Widget.tsx"]),
			],
			"/repo",
		);
		expect(findings.map((f) => f.file)).toEqual(["src/a/Widget.tsx"]);
		expect(findings[0]?.via).toEqual(["src/a/Widget.stories.tsx"]);
	});

	it("does not report a component production code imports", () => {
		const findings = findStoryOnlyFiles(
			[
				file("/repo/src/a/Widget.tsx"),
				file("/repo/src/a/Page.tsx", ["/repo/src/a/Widget.tsx"]),
				story("/repo/src/a/Widget.stories.tsx", ["/repo/src/a/Widget.tsx"]),
			],
			"/repo",
		);
		expect(findings).toEqual([]);
	});

	it("reports the whole story-only cluster transitively", () => {
		// BrowserHeader is only imported by its story; BrowserToolbar is
		// imported by BrowserHeader. Both are unreachable in production.
		const findings = findStoryOnlyFiles(
			[
				file("/repo/src/a/BrowserHeader.tsx", [
					"/repo/src/a/BrowserToolbar.tsx",
				]),
				file("/repo/src/a/BrowserToolbar.tsx"),
				story("/repo/src/a/BrowserHeader.stories.tsx", [
					"/repo/src/a/BrowserHeader.tsx",
				]),
			],
			"/repo",
		);
		expect(findings.map((f) => f.file)).toEqual([
			"src/a/BrowserHeader.tsx",
			"src/a/BrowserToolbar.tsx",
		]);
	});

	it("keeps a cluster alive once one member is wired into production", () => {
		const findings = findStoryOnlyFiles(
			[
				file("/repo/src/a/BrowserHeader.tsx", [
					"/repo/src/a/BrowserToolbar.tsx",
				]),
				file("/repo/src/a/BrowserToolbar.tsx"),
				file("/repo/src/a/Page.tsx", ["/repo/src/a/BrowserHeader.tsx"]),
				story("/repo/src/a/BrowserHeader.stories.tsx", [
					"/repo/src/a/BrowserHeader.tsx",
				]),
			],
			"/repo",
		);
		expect(findings).toEqual([]);
	});

	it("ignores story-only type and helper modules", () => {
		const findings = findStoryOnlyFiles(
			[
				file("/repo/src/a/lib/types.ts"),
				story("/repo/src/a/Widget.stories.tsx", ["/repo/src/a/lib/types.ts"]),
			],
			"/repo",
		);
		expect(findings).toEqual([]);
	});

	it("ignores a file nothing imports at all", () => {
		const findings = findStoryOnlyFiles([file("/repo/src/a/Orphan.tsx")]);
		expect(findings).toEqual([]);
	});
});
