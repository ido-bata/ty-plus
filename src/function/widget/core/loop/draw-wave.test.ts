import { describe, expect, it } from "vitest";
import { placeWaveHandleLabel } from "./draw-wave";

const CANVAS = { width: 320, height: 140 };
const LABEL_WIDTH = 40;

/** Distance from a point to the label box (0 when inside). */
const distanceToLabel = (
	px: number,
	py: number,
	label: { x: number; y: number },
): number => {
	const half = 5;
	const dx = Math.max(label.x - px, 0, px - (label.x + LABEL_WIDTH));
	const dy = Math.max(label.y - half - py, 0, py - (label.y + half));
	return Math.hypot(dx, dy);
};

describe("placeWaveHandleLabel", () => {
	it("keeps the historical right-side placement when nothing is in the way", () => {
		const label = placeWaveHandleLabel({
			handleX: 100,
			handleY: 70,
			labelWidth: LABEL_WIDTH,
			canvasWidth: CANVAS.width,
			canvasHeight: CANVAS.height,
			obstacles: [],
		});
		expect(label.x).toBeCloseTo(100 + 5 + 3);
		expect(label.y).toBeCloseTo(70);
	});

	it("moves the label away from an obstacle covering the right side", () => {
		// A dense vertical barrier of waveform points just right of the
		// handle: the right-side label would sit on top of it.
		const obstacles = Array.from({ length: 40 }, (_, i) => ({
			x: 120,
			y: 10 + i * 3,
		}));
		const label = placeWaveHandleLabel({
			handleX: 100,
			handleY: 70,
			labelWidth: LABEL_WIDTH,
			canvasWidth: CANVAS.width,
			canvasHeight: CANVAS.height,
			obstacles,
		});
		const rightSide = placeWaveHandleLabel({
			handleX: 100,
			handleY: 70,
			labelWidth: LABEL_WIDTH,
			canvasWidth: CANVAS.width,
			canvasHeight: CANVAS.height,
			obstacles: [],
		});
		const minObstacleDistance = Math.min(
			...obstacles.map((o) => distanceToLabel(o.x, o.y, label)),
		);
		expect(minObstacleDistance).toBeGreaterThan(0);
		expect(label).not.toEqual(rightSide);
	});

	it("keeps the label box fully inside the canvas at the edges", () => {
		for (const handle of [
			{ x: 2, y: 70 },
			{ x: CANVAS.width - 2, y: 70 },
			{ x: 160, y: 2 },
			{ x: 160, y: CANVAS.height - 2 },
		]) {
			const label = placeWaveHandleLabel({
				handleX: handle.x,
				handleY: handle.y,
				labelWidth: LABEL_WIDTH,
				canvasWidth: CANVAS.width,
				canvasHeight: CANVAS.height,
				obstacles: [{ x: handle.x, y: handle.y }],
			});
			expect(label.x).toBeGreaterThanOrEqual(2);
			expect(label.x + LABEL_WIDTH).toBeLessThanOrEqual(CANVAS.width - 2);
			expect(label.y - 5).toBeGreaterThanOrEqual(2);
			expect(label.y + 5).toBeLessThanOrEqual(CANVAS.height - 2);
		}
	});
});
