import { describe, expect, it, vi } from "vitest";
import {
	buildCyclicWave,
	type CyclicWaveParams,
	type WavePoint,
} from "@/function/widget/core/loop/cyclic-wave";
import {
	drawWaveScene,
	placeWaveHandleLabel,
	waveLabelChipRect,
	waveLabelObstacles,
} from "./draw-wave";
import { fitWaveCamera } from "./wave-camera";

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

	it("densifies wave segments so a stroke cannot cross a label box", () => {
		// A single long diagonal segment: without sampling, both endpoints
		// can be far from the label while the stroke passes straight
		// through it.
		const obstacles = waveLabelObstacles([
			{ x: 0, y: 0 },
			{ x: 200, y: 100 },
		]);
		const maxGap = Math.max(
			...obstacles.slice(1).map((point, i) => {
				const prev = obstacles[i];
				return Math.hypot(point.x - prev.x, point.y - prev.y);
			}),
		);
		expect(maxGap).toBeLessThanOrEqual(4);
		expect(obstacles.length).toBeGreaterThan(2);
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

describe("waveLabelChipRect", () => {
	const canvas = { width: 320, height: 140 };

	it("backs the whole label text box with padding", () => {
		const chip = waveLabelChipRect({
			labelX: 100,
			labelY: 70,
			labelWidth: 40,
			canvasWidth: canvas.width,
			canvasHeight: canvas.height,
		});
		// Text box: x 100..140, y 65..75 (10px tall, middle baseline).
		expect(chip.x).toBeLessThan(100);
		expect(chip.x + chip.width).toBeGreaterThan(140);
		expect(chip.y).toBeLessThan(65);
		expect(chip.y + chip.height).toBeGreaterThan(75);
	});

	it("stays inside the canvas at the edges", () => {
		for (const label of [
			{ labelX: 2, labelY: 70 },
			{ labelX: canvas.width - 2 - LABEL_WIDTH, labelY: 70 },
			{ labelX: 160, labelY: 2 },
			{ labelX: 160, labelY: canvas.height - 2 },
		]) {
			const chip = waveLabelChipRect({
				...label,
				labelWidth: LABEL_WIDTH,
				canvasWidth: canvas.width,
				canvasHeight: canvas.height,
			});
			expect(chip.x).toBeGreaterThanOrEqual(0);
			expect(chip.y).toBeGreaterThanOrEqual(0);
			expect(chip.x + chip.width).toBeLessThanOrEqual(canvas.width);
			expect(chip.y + chip.height).toBeLessThanOrEqual(canvas.height);
		}
	});
});

describe("drawWaveScene label legibility", () => {
	type Op = {
		op: string;
		args: unknown[];
		fillStyle?: unknown;
	};

	const template: WavePoint[] = [
		{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.15, y: 0 } },
		{ x: 0.5, y: 0.92, hIn: { x: -0.2, y: 0.2 }, hOut: { x: 0.2, y: 0.2 } },
		{ x: 1, y: 1, hIn: { x: -0.15, y: 0 }, hOut: { x: 0, y: 0 } },
	];
	const wave: CyclicWaveParams = {
		cycles: 8,
		amplitude: 1,
		damping: 1,
		bias: 0,
		mode: "pingpong",
	};
	const labels = {
		easing: "Easing",
		frequency: "Frequency",
		bias: "Bias",
		damping: "Damping",
	};

	const renderScene = (width: number, height: number): Op[] => {
		const ops: Op[] = [];
		const ctx = {
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 1,
			lineJoin: "",
			lineCap: "",
			font: "",
			textAlign: "",
			textBaseline: "",
			clearRect: (...args: unknown[]) => ops.push({ op: "clearRect", args }),
			beginPath: () => ops.push({ op: "beginPath", args: [] }),
			moveTo: (...args: unknown[]) => ops.push({ op: "moveTo", args }),
			lineTo: (...args: unknown[]) => ops.push({ op: "lineTo", args }),
			stroke: () => ops.push({ op: "stroke", args: [] }),
			setLineDash: () => {},
			arc: (...args: unknown[]) =>
				ops.push({ op: "arc", args, fillStyle: ctx.fillStyle }),
			fill: () => ops.push({ op: "fill", args: [], fillStyle: ctx.fillStyle }),
			fillRect: (...args: unknown[]) =>
				ops.push({ op: "fillRect", args, fillStyle: ctx.fillStyle }),
			fillText: (...args: unknown[]) =>
				ops.push({ op: "fillText", args, fillStyle: ctx.fillStyle }),
			measureText: () => ({ width: 40 }),
		} as unknown as CanvasRenderingContext2D;
		vi.stubGlobal("getComputedStyle", () => ({
			getPropertyValue: () => "",
		}));
		drawWaveScene(ctx, {
			canvas: {} as HTMLCanvasElement,
			width,
			height,
			camera: fitWaveCamera({
				width,
				height,
				valueMin: 0,
				valueMax: 1,
			}),
			wavePoints: buildCyclicWave(template, wave),
			template,
			wave,
			labels,
			hover: null,
			previewTime: null,
		});
		vi.unstubAllGlobals();
		return ops;
	};

	it.each([
		[320, 140],
		[170, 120],
	])(
		"draws a surface chip behind every handle label (%ix%i)",
		(width, height) => {
			const ops = renderScene(width, height);
			const texts = ops.filter((op) => op.op === "fillText");
			expect(texts).toHaveLength(3);
			const chips = ops.filter(
				(op) => op.op === "fillRect" && op.fillStyle === "#1e1e1e",
			);
			expect(chips).toHaveLength(3);
			// Chips and labels are emitted in the same handle order, so the
			// i-th chip backs the i-th label.
			const firstChipIndex = ops.indexOf(chips[0]);
			const firstTextIndex = ops.indexOf(texts[0]);
			expect(firstChipIndex).toBeLessThan(firstTextIndex);
			for (let i = 0; i < texts.length; i += 1) {
				const text = texts[i];
				const chip = chips[i];
				expect(chip).toBeDefined();
				const [tx, ty] = text.args.slice(1) as [number, number];
				const [cx, cy, cw, ch] = chip.args as [number, number, number, number];
				// The chip must fully contain the 40px-wide, 10px-tall text box.
				expect(cx).toBeLessThanOrEqual(tx);
				expect(cx + cw).toBeGreaterThanOrEqual(tx + 40);
				expect(cy).toBeLessThanOrEqual(ty - 5);
				expect(cy + ch).toBeGreaterThanOrEqual(ty + 5);
			}
		},
	);

	it("draws a surface halo behind each parameter handle dot", () => {
		const ops = renderScene(320, 140);
		const haloArcs = ops.filter(
			(op) => op.op === "arc" && op.args[2] === 5 + 1.5,
		);
		expect(haloArcs.length).toBeGreaterThanOrEqual(3);
	});
});
