import { describe, expect, it } from "vitest";
import {
	applyWaveHandleDrag,
	attackShare,
	buildCyclicWave,
	type CyclicWaveParams,
	chordValue,
	cycleBoundaries,
	sampleWave,
	type WavePoint,
	waveHandlePositions,
} from "./cyclic-wave";

const template: WavePoint[] = [
	{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.2, y: 0.2 } },
	{ x: 0.5, y: 0.9, hIn: { x: -0.2, y: 0.2 }, hOut: { x: 0.2, y: 0.2 } },
	{ x: 1, y: 1, hIn: { x: -0.2, y: 0.2 }, hOut: { x: 0, y: 0 } },
];

const params = (over: Partial<CyclicWaveParams> = {}): CyclicWaveParams => ({
	cycles: 3,
	amplitude: 1,
	damping: 1,
	bias: 0,
	mode: "pingpong",
	...over,
});

/** Point of the wave closest to `x`. */
const atX = (wave: WavePoint[], x: number): WavePoint =>
	wave.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));

/** Deviation of the template's mid point from the chord. */
const midDeviation = 0.9 - chordValue(template, 0.5);

describe("buildCyclicWave", () => {
	it("spans the whole segment and repeats the template", () => {
		const wave = buildCyclicWave(template, params({ mode: "cycle" }));
		expect(wave[0].x).toBeCloseTo(0);
		expect(wave[wave.length - 1].x).toBeCloseTo(1);
		expect(wave).toHaveLength(template.length * 3);
	});

	it("adds a mirrored return leg in pingpong mode", () => {
		const wave = buildCyclicWave(template, params({ mode: "pingpong" }));
		expect(wave).toHaveLength(template.length * (2 * 2 + 1));
		const attack = atX(wave, (0.5 * 0.5) / 3);
		const ret = atX(wave, 0.5 + ((1 - 0.5) * 0.5) / 3);
		expect(attack.y).toBeCloseTo(0.5 + midDeviation);
		expect(ret.y).toBeCloseTo(0.5 - midDeviation);
	});

	it("scales the deviation from the chord by amplitude", () => {
		const x = (0.5 * 0.5) / 3;
		const full = buildCyclicWave(template, params({ amplitude: 1 }));
		const half = buildCyclicWave(template, params({ amplitude: 0.5 }));
		expect(atX(half, x).y).toBeCloseTo(atX(full, x).y - midDeviation * 0.5);
	});

	it("decays the deviation per cycle", () => {
		const wave = buildCyclicWave(template, params({ damping: 0.5 }));
		const first = atX(wave, (0.5 * 0.5) / 3).y - 0.5;
		const second = atX(wave, 1 / 3 + (0.5 * 0.5) / 3).y - 0.5;
		expect(second).toBeCloseTo(first * 0.5);
	});

	it("keeps the handle slope ratio when replicating", () => {
		const wave = buildCyclicWave(template, params({ cycles: 4 }));
		const out = wave[0].hOut;
		const scale = 0.5 / 4;
		expect(out.x).toBeCloseTo(0.2 * scale);
		expect(out.y).toBeCloseTo(0.2 * scale);
		expect(out.y / out.x).toBeCloseTo(1);
	});

	it("splits the cycle by bias", () => {
		expect(attackShare(0)).toBeCloseTo(0.5);
		expect(attackShare(0.5)).toBeCloseTo(0.75);
		const wave = buildCyclicWave(template, params({ bias: 0.5 }));
		const attack = atX(wave, (0.5 * 0.75) / 3);
		expect(attack.y).toBeCloseTo(0.5 + midDeviation);
	});
});

describe("cycleBoundaries", () => {
	it("returns the boundary positions including both ends", () => {
		expect(cycleBoundaries(3)).toEqual([0, 1 / 3, 2 / 3, 1]);
	});
});

describe("sampleWave", () => {
	it("reads the wave value at a normalized time", () => {
		const wave = buildCyclicWave(template, params());
		expect(sampleWave(wave, 0)).toBeCloseTo(0);
		expect(sampleWave(wave, 1)).toBeCloseTo(1);
	});
});

describe("waveHandlePositions", () => {
	it("puts the frequency handle on the first cycle boundary", () => {
		const handles = waveHandlePositions(template, params({ cycles: 4 }));
		expect(handles.frequency.x).toBeCloseTo(0.25);
	});

	it("puts the bias handle at the end of the first attack leg", () => {
		const handles = waveHandlePositions(template, params({ bias: 0.5 }));
		expect(handles.bias.x).toBeCloseTo(0.75 / 3);
	});
});

describe("applyWaveHandleDrag", () => {
	it("derives the cycle count from the frequency handle", () => {
		const next = applyWaveHandleDrag(
			"frequency",
			{ x: 0.2, y: 0 },
			template,
			params(),
		);
		expect(next.cycles).toBe(5);
	});

	it("derives the attack share from the bias handle", () => {
		const next = applyWaveHandleDrag(
			"bias",
			{ x: 0.25, y: 0 },
			template,
			params(),
		);
		expect(next.bias).toBeCloseTo(0.5);
	});
});
