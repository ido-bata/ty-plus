import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
	buildCoverageReport,
	type LoadedCaptures,
	loadCaptures,
	loadIndex,
} from "./capture-merge";
import type { StorybookCaptureMetadata } from "./capture-metadata";
import { CAPTURE_METADATA_VERSION } from "./capture-metadata";

const makeMeta = (
	storyId: string,
	overrides: Partial<StorybookCaptureMetadata> = {},
): StorybookCaptureMetadata => ({
	version: CAPTURE_METADATA_VERSION,
	storyId,
	title: "Shared/Controls/Button",
	name: storyId.split("--").pop() ?? storyId,
	pngPath: `.tmp/vitest-screenshots/${storyId}.png`,
	width: 1280,
	height: 720,
	byteLength: 12345,
	consoleErrors: [],
	pageErrors: [],
	renderMs: 12.3,
	captureMs: 45.6,
	viewport: { width: 1280, height: 720 },
	capturedAt: "2026-01-01T00:00:00.000Z",
	status: "ok",
	...overrides,
});

const noInvalid: LoadedCaptures["invalid"] = [];

describe("buildCoverageReport", () => {
	it("classifies ok / render-failed / capture-error / missing-metadata", () => {
		const metas = [
			makeMeta("a--one"),
			makeMeta("a--two", { status: "render-failed" }),
			makeMeta("a--three", {
				status: "capture-error",
				captureError: "screenshot timed out",
				pngPath: null,
			}),
		];
		const index = new Map([
			["a--one", { id: "a--one", title: "T", name: "One" }],
			["a--two", { id: "a--two", title: "T", name: "Two" }],
			["a--three", { id: "a--three", title: "T", name: "Three" }],
			["a--four", { id: "a--four", title: "T", name: "Four" }],
		]);
		const report = buildCoverageReport(metas, noInvalid, {
			indexEntries: index,
			pngExists: () => true,
		});
		const byId = new Map(report.entries.map((e) => [e.storyId, e]));
		expect(byId.get("a--one")?.status).toBe("ok");
		expect(byId.get("a--two")?.status).toBe("render-failed");
		expect(byId.get("a--three")?.status).toBe("capture-error");
		expect(byId.get("a--three")?.detail).toContain("timed out");
		expect(byId.get("a--four")?.status).toBe("missing-metadata");
		expect(report.totals).toMatchObject({
			ok: 1,
			"render-failed": 1,
			"capture-error": 1,
			"missing-metadata": 1,
			total: 4,
		});
		expect(report.indexAvailable).toBe(true);
	});

	it("flags sidecars absent from index.json via inIndex=false", () => {
		const index = new Map([["a--one", { id: "a--one" }]]);
		const report = buildCoverageReport(
			[makeMeta("a--one"), makeMeta("stale--old")],
			noInvalid,
			{ indexEntries: index, pngExists: () => true },
		);
		const stale = report.entries.find((e) => e.storyId === "stale--old");
		expect(stale?.status).toBe("ok");
		expect(stale?.inIndex).toBe(false);
	});

	it("reports missing-png when the sidecar says ok but the file is gone", () => {
		const report = buildCoverageReport([makeMeta("a--one")], noInvalid, {
			indexEntries: null,
			pngExists: () => false,
		});
		expect(report.entries[0]?.status).toBe("missing-png");
		expect(report.indexAvailable).toBe(false);
	});

	it("reports missing-png when pngPath is null despite ok status", () => {
		const report = buildCoverageReport(
			[makeMeta("a--one", { pngPath: null })],
			noInvalid,
			{ indexEntries: null },
		);
		expect(report.entries[0]?.status).toBe("missing-png");
	});

	it("surfaces invalid sidecars as invalid-metadata", () => {
		const report = buildCoverageReport(
			[],
			[{ file: "broken.json", storyId: "broken", error: "schema mismatch" }],
			{ indexEntries: null },
		);
		expect(report.entries[0]?.status).toBe("invalid-metadata");
		expect(report.entries[0]?.detail).toContain("broken.json");
	});

	it("sorts entries deterministically by storyId", () => {
		const report = buildCoverageReport(
			[makeMeta("b--two"), makeMeta("a--one")],
			noInvalid,
			{ indexEntries: null, pngExists: () => true },
		);
		expect(report.entries.map((e) => e.storyId)).toEqual(["a--one", "b--two"]);
	});
});

describe("loadCaptures", () => {
	let dir = "";
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = "";
	});

	it("loads valid sidecars and reports invalid ones", () => {
		dir = mkdtempSync(join(tmpdir(), "sb-captures-"));
		writeFileSync(join(dir, "a--one.json"), JSON.stringify(makeMeta("a--one")));
		writeFileSync(join(dir, "broken.json"), "{not json");
		writeFileSync(join(dir, "wrong.json"), JSON.stringify({ hello: "world" }));
		writeFileSync(join(dir, "report.json"), "{}"); // excluded by name

		const { metas, invalid } = loadCaptures(dir);
		expect(metas.map((m) => m.storyId)).toEqual(["a--one"]);
		expect(invalid.map((i) => i.file).sort()).toEqual([
			"broken.json",
			"wrong.json",
		]);
	});

	it("returns empty result for a missing directory", () => {
		const { metas, invalid } = loadCaptures(
			join(tmpdir(), "sb-captures-does-not-exist"),
		);
		expect(metas).toEqual([]);
		expect(invalid).toEqual([]);
	});
});

describe("loadIndex", () => {
	it("returns null when index.json is absent", () => {
		expect(loadIndex(join(tmpdir(), "no-such-index.json"))).toBeNull();
	});
});
