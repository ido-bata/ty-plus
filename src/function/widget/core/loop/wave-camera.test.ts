import { describe, expect, it } from "vitest";
import {
	buildCyclicWave,
	type CyclicWaveParams,
	type WavePoint,
	waveHandlePositions,
} from "./cyclic-wave";
import {
	fitWaveCamera,
	screenToTime,
	screenToValue,
	timeToScreen,
	valueToScreen,
} from "./wave-camera";

const template: WavePoint[] = [
	{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.15, y: 0 } },
	{ x: 0.5, y: 0.92, hIn: { x: -0.2, y: 0.2 }, hOut: { x: 0.2, y: 0.2 } },
	{ x: 1, y: 1, hIn: { x: -0.15, y: 0 }, hOut: { x: 0, y: 0 } },
];

const params = (over: Partial<CyclicWaveParams> = {}): CyclicWaveParams => ({
	cycles: 3,
	amplitude: 1,
	damping: 1,
	bias: 0,
	mode: "pingpong",
	...over,
});

const WIDTH = 320;
const HEIGHT = 140;

describe("fitWaveCamera", () => {
	it("places valueMin - pad at the bottom edge and valueMax + pad at the top", () => {
		const valueMin = -0.4;
		const valueMax = 2.2;
		const camera = fitWaveCamera({
			width: WIDTH,
			height: HEIGHT,
			valueMin,
			valueMax,
		});
		const range = valueMax - valueMin;
		const pad = Math.max(0.08, range * 0.08);
		expect(valueToScreen(valueMin - pad, camera)).toBeCloseTo(HEIGHT);
		expect(valueToScreen(valueMax + pad, camera)).toBeCloseTo(0);
	});

	it("keeps baseY equal to the screen position of value 0", () => {
		const camera = fitWaveCamera({
			width: WIDTH,
			height: HEIGHT,
			valueMin: 0,
			valueMax: 1,
		});
		expect(camera.baseY).toBeCloseTo(valueToScreen(0, camera));
	});

	it("round-trips value and time through the screen mapping", () => {
		const camera = fitWaveCamera(
			{ width: WIDTH, height: HEIGHT, valueMin: 0, valueMax: 1 },
			0.25,
			0.5,
		);
		for (const t of [0.25, 0.5, 0.75]) {
			expect(screenToTime(timeToScreen(t, camera), camera)).toBeCloseTo(t);
		}
		for (const v of [0, 0.5, 1]) {
			expect(screenToValue(valueToScreen(v, camera), camera)).toBeCloseTo(v);
		}
	});

	it.each([
		["default", params()],
		["many cycles", params({ cycles: 8 })],
		["strong damping", params({ damping: 0.3 })],
		["biased", params({ bias: 0.6 })],
		["one-way", params({ mode: "cycle" })],
		["wide amplitude", params({ amplitude: 2.5 })],
	])(
		"keeps the whole wave and its handles inside the canvas (%s)",
		(_label, wave) => {
			const points = buildCyclicWave(template, wave);
			const range = points.reduce(
				(acc, point) => ({
					min: Math.min(acc.min, point.y),
					max: Math.max(acc.max, point.y),
				}),
				{ min: 0, max: 1 },
			);
			const camera = fitWaveCamera({
				width: WIDTH,
				height: HEIGHT,
				valueMin: range.min,
				valueMax: range.max,
			});
			// 4px slack covers anti-aliased stroke edges; the padding alone
			// must keep every sample strictly inside the canvas.
			const margin = 4;
			for (const point of points) {
				const y = valueToScreen(point.y, camera);
				expect(y).toBeGreaterThanOrEqual(margin);
				expect(y).toBeLessThanOrEqual(HEIGHT - margin);
			}
			const handles = waveHandlePositions(template, wave);
			for (const position of Object.values(handles)) {
				const y = valueToScreen(position.y, camera);
				expect(y).toBeGreaterThanOrEqual(margin);
				expect(y).toBeLessThanOrEqual(HEIGHT - margin);
			}
		},
	);
});
