import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearEasing,
	clearValues,
	loadClipboard,
	saveEasing,
	saveValues,
} from "@/management/storage/clipboard-store";

describe("clipboard-store", () => {
	let tempDir: string;

	const fakeWin = null as unknown as Window;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "clipboard-store-"));
	});

	afterEach(() => {
		if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
	});

	it("returns an empty file when no clipboard file exists", async () => {
		const result = await loadClipboard(fakeWin, join(tempDir, "clip.json"));
		expect(result.easing).toBeUndefined();
		expect(result.values).toBeUndefined();
	});

	it("round-trips an easing clipboard", async () => {
		const path = join(tempDir, "clip.json");
		await saveEasing(
			fakeWin,
			{
				version: 1,
				points: [{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.3, y: 0 } }],
			},
			path,
		);
		const result = await loadClipboard(fakeWin, path);
		expect(result.easing?.points).toHaveLength(1);
		expect(result.easing?.points[0].hOut.x).toBeCloseTo(0.3, 5);
	});

	it("round-trips a values clipboard", async () => {
		const path = join(tempDir, "clip.json");
		await saveValues(fakeWin, { version: 1, values: [[1], [2.5], [3]] }, path);
		const result = await loadClipboard(fakeWin, path);
		expect(result.values?.values).toEqual([[1], [2.5], [3]]);
	});

	it("clearEasing removes only the easing slot, keeps values", async () => {
		const path = join(tempDir, "clip.json");
		await saveEasing(fakeWin, { version: 1, points: [] }, path);
		await saveValues(fakeWin, { version: 1, values: [[42]] }, path);
		await clearEasing(fakeWin, path);
		const result = await loadClipboard(fakeWin, path);
		expect(result.easing).toBeUndefined();
		expect(result.values?.values).toEqual([[42]]);
	});

	it("clearValues removes only the values slot, keeps easing", async () => {
		const path = join(tempDir, "clip.json");
		await saveEasing(fakeWin, { version: 1, points: [] }, path);
		await saveValues(fakeWin, { version: 1, values: [[42]] }, path);
		await clearValues(fakeWin, path);
		const result = await loadClipboard(fakeWin, path);
		expect(result.easing?.points).toEqual([]);
		expect(result.values).toBeUndefined();
	});

	it("returns an empty file on a corrupted JSON without throwing", async () => {
		const path = join(tempDir, "clip.json");
		writeFileSync(path, "{not valid json");
		const result = await loadClipboard(fakeWin, path);
		expect(result).toEqual({ version: 1 });
	});
});
