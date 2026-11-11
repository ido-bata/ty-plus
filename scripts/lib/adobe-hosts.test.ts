import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { findAfterEffectsMacApp } from "./adobe-hosts";

const root = mkdtempSync(path.join(tmpdir(), "adobe-hosts-"));

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("findAfterEffectsMacApp", () => {
	it("finds the layout Adobe actually ships", () => {
		// /Applications/Adobe After Effects 2026/Adobe After Effects 2026.app
		const layoutRoot = path.join(root, "nested");
		mkdirSync(layoutRoot, { recursive: true });
		const bundle = path.join(
			layoutRoot,
			"Adobe After Effects 2026",
			"Adobe After Effects 2026.app",
		);
		mkdirSync(bundle, { recursive: true });

		expect(findAfterEffectsMacApp(layoutRoot)).toBe(bundle);
	});

	it("also accepts the bundle directly under Applications", () => {
		const layoutRoot = path.join(root, "flat");
		mkdirSync(layoutRoot, { recursive: true });
		const bundle = path.join(layoutRoot, "Adobe After Effects 2025.app");
		mkdirSync(bundle, { recursive: true });

		expect(findAfterEffectsMacApp(layoutRoot)).toBe(bundle);
	});

	it("prefers the newest installed version", () => {
		const layoutRoot = path.join(root, "multi");
		mkdirSync(layoutRoot, { recursive: true });
		for (const version of ["2024", "2026", "2025"]) {
			mkdirSync(
				path.join(
					layoutRoot,
					`Adobe After Effects ${version}`,
					`Adobe After Effects ${version}.app`,
				),
				{ recursive: true },
			);
		}

		expect(findAfterEffectsMacApp(layoutRoot)).toBe(
			path.join(
				layoutRoot,
				"Adobe After Effects 2026",
				"Adobe After Effects 2026.app",
			),
		);
	});

	it("returns undefined rather than a path that does not exist", () => {
		const empty = path.join(root, "empty");
		mkdirSync(empty, { recursive: true });

		expect(findAfterEffectsMacApp(empty)).toBeUndefined();
		expect(findAfterEffectsMacApp(path.join(root, "gone"))).toBeUndefined();
	});
});

// Keep the Windows helper out of the reach of this file's fixtures: it is
// exercised only on a host that has the registry.
describe("installations this test does not create", () => {
	it("ignores unrelated applications", () => {
		const layoutRoot = path.join(root, "unrelated");
		mkdirSync(path.join(layoutRoot, "Adobe Premiere Pro 2026"), {
			recursive: true,
		});
		expect(findAfterEffectsMacApp(layoutRoot)).toBeUndefined();
	});
});
