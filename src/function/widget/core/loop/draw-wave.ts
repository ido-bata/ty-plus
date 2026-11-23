/**
 * Canvas scene renderer for the loop wave editor.
 *
 * Draws the repeated waveform, the representative (edited) cycle with its
 * control handles, the parameter handles, the damping envelope and the
 * playhead. Kept outside the component so the editor stays small.
 */

import {
	attackShare,
	type CyclicWaveParams,
	chordValue,
	cycleBoundaries,
	type WavePoint,
	waveHandlePositions,
} from "@/function/widget/core/loop/cyclic-wave";
import type { DragTarget } from "./hit-test";
import type { WaveHandleLabels } from "./WaveEditor";
import { timeToScreen, valueToScreen, type WaveCamera } from "./wave-camera";

const HANDLE_RADIUS = 5;
const LABEL_HEIGHT = 10;
const LABEL_MARGIN = 2;
const LABEL_GAP = 3;

/**
 * Picks a screen position for a handle label that keeps the label box clear
 * of the waveform and the sibling handles. Candidates are tried to the
 * right of the handle first (the historical placement), then above, below,
 * and to the left; the candidate whose box stays farthest from every
 * obstacle wins. The result is always clamped inside the canvas.
 */
export const placeWaveHandleLabel = (input: {
	handleX: number;
	handleY: number;
	handleRadius?: number;
	labelWidth: number;
	canvasWidth: number;
	canvasHeight: number;
	obstacles: readonly { x: number; y: number }[];
}): { x: number; y: number } => {
	const radius = input.handleRadius ?? HANDLE_RADIUS;
	const half = LABEL_HEIGHT / 2;
	const maxX = Math.max(
		LABEL_MARGIN,
		input.canvasWidth - LABEL_MARGIN - input.labelWidth,
	);
	const clampX = (x: number): number =>
		Math.min(Math.max(x, LABEL_MARGIN), maxX);
	const clampY = (y: number): number =>
		Math.min(
			Math.max(y, LABEL_MARGIN + half),
			Math.max(LABEL_MARGIN + half, input.canvasHeight - LABEL_MARGIN - half),
		);
	const candidates = [
		{ x: input.handleX + radius + LABEL_GAP, y: input.handleY },
		{
			x: input.handleX - input.labelWidth / 2,
			y: input.handleY - radius - LABEL_GAP - half,
		},
		{
			x: input.handleX - input.labelWidth / 2,
			y: input.handleY + radius + LABEL_GAP + half,
		},
		{
			x: input.handleX - radius - LABEL_GAP - input.labelWidth,
			y: input.handleY,
		},
	].map((candidate) => ({ x: clampX(candidate.x), y: clampY(candidate.y) }));
	const distanceToRect = (
		px: number,
		py: number,
		rect: { x: number; y: number },
	): number => {
		const dx = Math.max(rect.x - px, 0, px - (rect.x + input.labelWidth));
		const dy = Math.max(rect.y - half - py, 0, py - (rect.y + half));
		return Math.hypot(dx, dy);
	};
	let best = candidates[0];
	let bestDistance = -1;
	for (const candidate of candidates) {
		const distance = input.obstacles.reduce(
			(min, obstacle) =>
				Math.min(min, distanceToRect(obstacle.x, obstacle.y, candidate)),
			Number.POSITIVE_INFINITY,
		);
		if (distance > bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	}
	return best;
};

export type WaveScene = {
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
	camera: WaveCamera;
	wavePoints: WavePoint[];
	template: WavePoint[];
	wave: CyclicWaveParams;
	labels: WaveHandleLabels;
	hover: DragTarget | null;
	previewTime: number | null | undefined;
};

export function drawWaveScene(
	ctx: CanvasRenderingContext2D,
	scene: WaveScene,
): void {
	const {
		canvas,
		width,
		height,
		camera: cam,
		wavePoints,
		template,
		wave,
		labels,
		hover,
		previewTime,
	} = scene;
	ctx.clearRect(0, 0, width, height);
	const style = getComputedStyle(canvas);
	const text = style.getPropertyValue("--ty-text-primary").trim() || "#fff";
	const muted = style.getPropertyValue("--ty-text-muted").trim() || "#999";
	const accent = style.getPropertyValue("--ty-text-accent").trim() || text;
	const grid =
		style.getPropertyValue("--ty-border-surface").trim() ||
		"rgba(255,255,255,0.14)";
	// Cycle boundaries and the segment ends.
	ctx.strokeStyle = grid;
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (const boundary of cycleBoundaries(wave.cycles)) {
		const x = timeToScreen(boundary, cam);
		if (x < -1 || x > width + 1) continue;
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
	}
	ctx.stroke();
	// The waveform itself.
	const waveScreen = wavePoints.map((point) => ({
		x: timeToScreen(point.x, cam),
		y: valueToScreen(point.y, cam),
	}));
	ctx.strokeStyle = text;
	ctx.lineWidth = 2;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	waveScreen.forEach((point, index) => {
		if (index === 0) ctx.moveTo(point.x, point.y);
		else ctx.lineTo(point.x, point.y);
	});
	ctx.stroke();
	// The damping envelope: the peak of every cycle, connected.
	ctx.strokeStyle = muted;
	ctx.setLineDash([4, 4]);
	ctx.lineWidth = 1;
	ctx.beginPath();
	const peaks: { x: number; y: number }[] = [];
	for (let cycle = 0; cycle < wave.cycles; cycle += 1) {
		let peak: { x: number; y: number } | null = null;
		for (const point of wavePoints) {
			if (Math.floor(point.x * wave.cycles) !== cycle) continue;
			if (!peak || point.y > peak.y) peak = point;
		}
		if (peak) peaks.push(peak);
	}
	peaks.forEach((peak, index) => {
		const x = timeToScreen(peak.x, cam);
		const y = valueToScreen(peak.y, cam);
		if (index === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	});
	ctx.stroke();
	ctx.setLineDash([]);
	// The representative (edited) cycle: its control points and handles.
	const legTimeScale = Math.max(1e-6, attackShare(wave.bias) / wave.cycles);
	ctx.strokeStyle = muted;
	ctx.lineWidth = 1;
	for (const point of template) {
		const px = timeToScreen(point.x * legTimeScale, cam);
		const py = valueToScreen(chordValue(template, point.x), cam);
		for (const side of ["hIn", "hOut"] as const) {
			const handle = point[side];
			const hx = timeToScreen(
				point.x * legTimeScale + handle.x * legTimeScale,
				cam,
			);
			const hy = valueToScreen(chordValue(template, point.x) + handle.y, cam);
			ctx.beginPath();
			ctx.moveTo(px, py);
			ctx.lineTo(hx, hy);
			ctx.stroke();
			ctx.fillStyle = muted;
			ctx.beginPath();
			ctx.arc(hx, hy, 3, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = text;
		ctx.beginPath();
		ctx.arc(px, py, 4, 0, Math.PI * 2);
		ctx.fill();
	}
	// The parameter handles.
	const handles = waveHandlePositions(template, wave);
	const handleScreen = (Object.keys(handles) as (keyof typeof handles)[]).map(
		(key) => {
			const position = handles[key];
			return {
				key,
				x: timeToScreen(position.x, cam),
				y: valueToScreen(position.y, cam),
			};
		},
	);
	ctx.font = "10px system-ui, sans-serif";
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	for (const handle of handleScreen) {
		const active = hover?.kind === "wave-handle" && hover.handle === handle.key;
		const radius = active ? HANDLE_RADIUS + 1 : HANDLE_RADIUS;
		ctx.fillStyle = active ? accent : text;
		ctx.beginPath();
		ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = active ? accent : muted;
		const labelWidth = ctx.measureText(labels[handle.key]).width;
		const obstacles = waveScreen.concat(
			handleScreen
				.filter((other) => other.key !== handle.key)
				.map(({ x, y }) => ({ x, y })),
		);
		const label = placeWaveHandleLabel({
			handleX: handle.x,
			handleY: handle.y,
			handleRadius: radius,
			labelWidth,
			canvasWidth: width,
			canvasHeight: height,
			obstacles,
		});
		ctx.fillText(labels[handle.key], label.x, label.y);
	}
	// The playhead: the current time and the value at that time.
	if (previewTime !== null && previewTime !== undefined) {
		const x = timeToScreen(previewTime, cam);
		ctx.strokeStyle = accent;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
}
