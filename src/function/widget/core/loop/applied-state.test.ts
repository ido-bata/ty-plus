import { describe, expect, it } from "vitest";
import {
	type AppliedLoopRecord,
	detectConflict,
	mergeAppliedRecords,
	templateRowsToPoints,
} from "./applied-state";

const record = (over: Partial<AppliedLoopRecord> = {}): AppliedLoopRecord => ({
	propertyId: "Layer 1.Position",
	range: { start: 0, end: 2 },
	loopParams: {
		cycles: 3,
		amplitude: 1,
		damping: 1,
		bias: 0,
		mode: "pingpong",
	},
	template: [[0, 0, 0, 0, 0.2, 0]],
	originalKeyframes: [
		{
			time: 0,
			value: [0],
			inEase: [],
			outEase: [],
			interpolationType: 6612,
		},
	],
	writtenKeyframes: [
		{ time: 0.5, value: [10] },
		{ time: 1, value: [20] },
	],
	appliedAt: 1000,
	...over,
});

describe("detectConflict", () => {
	it("reports no conflict when the keyframes still match", () => {
		const current = [
			{ time: 0.5, value: [10] },
			{ time: 1, value: [20] },
		];
		expect(detectConflict(record(), current)).toBe(false);
	});

	it("detects a moved keyframe", () => {
		const current = [
			{ time: 0.6, value: [10] },
			{ time: 1, value: [20] },
		];
		expect(detectConflict(record(), current)).toBe(true);
	});

	it("detects a re-typed value", () => {
		const current = [
			{ time: 0.5, value: [11] },
			{ time: 1, value: [20] },
		];
		expect(detectConflict(record(), current)).toBe(true);
	});

	it("detects an added or removed keyframe", () => {
		expect(detectConflict(record(), [{ time: 0.5, value: [10] }])).toBe(true);
	});
});

describe("mergeAppliedRecords", () => {
	it("keeps the original snapshot when a loop is updated", () => {
		const first = record();
		const updated = record({
			appliedAt: 2000,
			loopParams: { ...first.loopParams, cycles: 5 },
		});
		const merged = mergeAppliedRecords([first], [updated]);
		expect(merged).toHaveLength(1);
		expect(merged[0].originalKeyframes).toEqual(first.originalKeyframes);
		expect(merged[0].loopParams.cycles).toBe(5);
	});

	it("keeps records of different properties apart", () => {
		const first = record();
		const other = record({ propertyId: "Layer 2.Scale" });
		const merged = mergeAppliedRecords([first], [first, other]);
		expect(merged.map((item) => item.propertyId)).toEqual([
			"Layer 1.Position",
			"Layer 2.Scale",
		]);
	});
});

describe("templateRowsToPoints", () => {
	it("restores the editor points from the host rows", () => {
		const points = templateRowsToPoints([[0, 0.5, 0, 0, 0.2, 0.1]]);
		expect(points[0]).toEqual({
			x: 0,
			y: 0.5,
			hIn: { x: 0, y: 0 },
			hOut: { x: 0.2, y: 0.1 },
		});
	});
});
