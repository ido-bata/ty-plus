import { describe, expect, it } from "vitest";
import {
	computeCamera,
	HANDLE_MIN_SCREEN_PX,
	handleDotScreenPos,
} from "./camera";

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

describe("handleDotScreenPos", () => {
	const camera = computeCamera(240, 240);

	it("returns the real handle position when the vector is long enough", () => {
		const point = { x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.4, y: 0 } };
		const pos = handleDotScreenPos(point, "hOut", camera);
		// world (0.4, 0) -> screen
		expect(pos.x).toBeCloseTo(camera.x + 0.4 * camera.zoom);
		expect(pos.y).toBeCloseTo(camera.y);
	});

	it("keeps zero-length handles visible at the minimum distance (issue #78)", () => {
		// Linear-curve state: every handle vector is {0,0}, so without the
		// minimum the dot would sit exactly on the anchor and be invisible.
		const point = { x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0, y: 0 } };
		const anchor = { x: camera.x, y: camera.y };

		const hOut = handleDotScreenPos(point, "hOut", camera);
		expect(Math.hypot(hOut.x - anchor.x, hOut.y - anchor.y)).toBeCloseTo(
			HANDLE_MIN_SCREEN_PX,
		);
		expect(hOut.x).toBeGreaterThan(anchor.x); // hOut defaults to +x

		const hIn = handleDotScreenPos(point, "hIn", camera);
		expect(Math.hypot(hIn.x - anchor.x, hIn.y - anchor.y)).toBeCloseTo(
			HANDLE_MIN_SCREEN_PX,
		);
		expect(hIn.x).toBeLessThan(anchor.x); // hIn defaults to -x
	});

	it("extends short handles along their real direction", () => {
		const point = {
			x: 0.5,
			y: 0.5,
			hIn: { x: 0, y: 0 },
			hOut: { x: 0.01, y: 0.02 }, // ~3px on a 240px canvas -> below min
		};
		const pos = handleDotScreenPos(point, "hOut", camera);
		const anchorScreen = {
			x: camera.x + 0.5 * camera.zoom,
			y: camera.y - 0.5 * camera.zoom,
		};
		const dist = Math.hypot(pos.x - anchorScreen.x, pos.y - anchorScreen.y);
		expect(dist).toBeCloseTo(HANDLE_MIN_SCREEN_PX);
		// Direction preserved: mostly downward on screen (world +y -> screen -y? no:
		// world y up => screen y down is inverted, so world +y moves up).
		expect(pos.y).toBeLessThan(anchorScreen.y);
	});
});
