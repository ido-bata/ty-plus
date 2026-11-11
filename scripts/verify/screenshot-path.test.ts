import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	SCREENSHOT_OUTPUT_DIRECTORY,
	screenshotFileName,
	screenshotOutputRelativePath,
} from "./screenshot-path";

/**
 * Contract for the Storybook screenshot capture's output path.
 *
 * Exercise both `path.win32` and `path.posix` on every test host so a
 * passing POSIX run also verifies Windows drive handling.
 */

const WINDOWS_ROOT = "C:\\Users\\dev\\ty-plus";
const POSIX_ROOT = "/Users/dev/ty-plus";

describe("screenshotOutputRelativePath", () => {
	it("produces a path relative to the project root, not an absolute one", () => {
		const out = screenshotOutputRelativePath("button--primary");
		expect(out).toBe(".tmp/vitest-screenshots/button--primary.png");
	});

	it("never begins with a separator or a drive letter", () => {
		// The defect in one assertion: an absolute-looking path is what the
		// browser used to hand over, and what `path.win32` then doubled.
		for (const storyId of [
			"button--primary",
			"onboarding-completioninput--default",
			"a",
		]) {
			const out = screenshotOutputRelativePath(storyId);
			expect(out.startsWith("/")).toBe(false);
			expect(out.startsWith("\\")).toBe(false);
			expect(out).not.toMatch(/^[A-Za-z]:/);
		}
	});

	it("resolves to the intended location on Windows", () => {
		const out = screenshotOutputRelativePath("button--primary");
		expect(path.win32.resolve(WINDOWS_ROOT, out)).toBe(
			"C:\\Users\\dev\\ty-plus\\.tmp\\vitest-screenshots\\button--primary.png",
		);
	});

	it("resolves to the intended location on POSIX", () => {
		const out = screenshotOutputRelativePath("button--primary");
		expect(path.posix.resolve(POSIX_ROOT, out)).toBe(
			"/Users/dev/ty-plus/.tmp/vitest-screenshots/button--primary.png",
		);
	});

	it("does not produce the doubled drive that broke the Windows run", () => {
		// Reproduces the production failure: feeding `path.win32` the
		// browser's `/C:/...` output puts a second `C:` on the front.
		const broken = "/C:/Users/dev/ty-plus/.tmp/vitest-screenshots/a.png";
		expect(path.win32.resolve(WINDOWS_ROOT, broken)).toBe(
			"C:\\C:\\Users\\dev\\ty-plus\\.tmp\\vitest-screenshots\\a.png",
		);

		// The relative path this module produces is immune to that.
		const fixed = screenshotOutputRelativePath("a");
		const resolved = path.win32.resolve(WINDOWS_ROOT, fixed);
		expect(resolved).not.toContain("C:\\C:");
		expect(resolved.startsWith(`${WINDOWS_ROOT}\\`)).toBe(true);
	});

	it("stays inside the output directory regardless of host platform", () => {
		const out = screenshotOutputRelativePath("button--primary");
		for (const [flavour, root] of [
			["win32", WINDOWS_ROOT],
			["posix", POSIX_ROOT],
		] as const) {
			const resolved = path[flavour].resolve(root, out);
			expect(resolved, flavour).toContain(
				path[flavour].join(SCREENSHOT_OUTPUT_DIRECTORY),
			);
		}
	});
});

describe("screenshotFileName", () => {
	it("keeps the characters real story ids are built from", () => {
		// Real ids are kebab-cased titles plus a `--` export separator.
		expect(screenshotFileName("onboarding-completioninput--default")).toBe(
			"onboarding-completioninput--default.png",
		);
		expect(screenshotFileName("ui-animation--play")).toBe(
			"ui-animation--play.png",
		);
	});

	it("folds characters that are not legal in a path segment", () => {
		// A story id is data from the addon, not a trusted literal. Anything
		// that could steer the write out of the output directory is folded
		// rather than passed through.
		expect(screenshotFileName("a/b")).toBe("a-b.png");
		expect(screenshotFileName("a\\b")).toBe("a-b.png");
		expect(screenshotFileName("a:b")).toBe("a-b.png");
		expect(screenshotFileName("a b")).toBe("a-b.png");
	});

	it("cannot be steered out of the output directory", () => {
		// The traversal cases, checked on both platforms so a POSIX-only
		// run still exercises the guarantee.
		for (const hostile of [
			"../../etc/passwd",
			"..\\..\\windows\\system32",
			"/absolute/path",
			"C:/absolute/path",
		]) {
			const out = screenshotOutputRelativePath(hostile);
			for (const [flavour, root] of [
				["win32", WINDOWS_ROOT],
				["posix", POSIX_ROOT],
			] as const) {
				const resolved = path[flavour].resolve(root, out);
				expect(resolved.startsWith(root), `${hostile} on ${flavour}`).toBe(
					true,
				);
			}
		}
	});

	it("refuses an id that has no nameable characters", () => {
		// A dot-only name would resolve to the output directory itself, and
		// `writeFile` would then fail deep inside the runner with a message
		// that says nothing about the story.
		for (const nameless of ["", ".", "..", "..."]) {
			expect(() => screenshotFileName(nameless)).toThrow(
				/cannot name a file for story id/,
			);
		}
	});
});
