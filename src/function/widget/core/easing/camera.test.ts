import { describe, expect, it } from "vitest";
import { computeCamera } from "./camera";

describe("computeCamera", () => {
	it("keeps the historical framing on large canvases", () => {
		const camera = computeCamera(400, 400);
		expect(camera.zoom).toBe(320);
		expect(camera.x + camera.zoom / 2).toBeCloseTo(200);
		expect(camera.y - camera.zoom / 2).toBeCloseTo(200);
	});

	it("gives the graph a usable size on small canvases (issue #78)", () => {
		// 204x102 is the real device size inside a 4x5 workspace tile.
		const camera = computeCamera(204, 102);
		expect(camera.zoom).toBeGreaterThan(70);
		expect(camera.zoom / Math.min(204, 102)).toBeGreaterThan(0.6);
	});

	it("centers the unit square for any canvas size", () => {
		for (const [w, h] of [
			[204, 102],
			[152, 152],
			[48, 48],
			[480, 160],
		]) {
			const camera = computeCamera(w, h);
			expect(camera.x + camera.zoom / 2).toBeCloseTo(w / 2);
			expect(camera.y - camera.zoom / 2).toBeCloseTo(h / 2);
			expect(camera.zoom).toBeGreaterThan(0);
		}
	});
});
