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
import {
	CANVAS_FALLBACK_GRID_COLOR,
	CANVAS_FALLBACK_MUTED_COLOR,
	CANVAS_FALLBACK_SURFACE_COLOR,
	CANVAS_FALLBACK_TEXT_COLOR,
} from "@/function/widget/literals/canvas-colors";
import type { DragTarget } from "./hit-test";
import type { WaveHandleLabels } from "./WaveEditor";
import { timeToScreen, valueToScreen, type WaveCamera } from "./wave-camera";

const HANDLE_RADIUS = 5;
const LABEL_HEIGHT = 10;
const LABEL_MARGIN = 2;
const LABEL_GAP = 3;
/** Padding around the label text box for its surface-colored chip. */
const LABEL_CHIP_PAD_X = 3;
const LABEL_CHIP_PAD_Y = 2;
/** Extra radius of the surface-colored halo behind interactive dots. */
const DOT_HALO_PAD = 1.5;
/** Max gap between wave samples used as label obstacles (px). */
const WAVE_OBSTACLE_STEP = 4;

/**
 * The waveform is stroked as a polyline, but label placement only sees
 * points. Sample every segment densely enough that a straight stroke
 * cannot slip between two obstacle points and cross a label box.
 */
export const waveLabelObstacles = (
	points: readonly { x: number; y: number }[],
): { x: number; y: number }[] => {
	const obstacles: { x: number; y: number }[] = [];
	for (let i = 0; i < points.length; i += 1) {
		const point = points[i];
		obstacles.push(point);
		const next = points[i + 1];
		if (!next) break;
		const steps = Math.ceil(
			Math.hypot(next.x - point.x, next.y - point.y) / WAVE_OBSTACLE_STEP,
		);
		for (let step = 1; step < steps; step += 1) {
			const ratio = step / steps;
			obstacles.push({
				x: point.x + (next.x - point.x) * ratio,
				y: point.y + (next.y - point.y) * ratio,
			});
		}
	}
	return obstacles;
};

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

export type WaveLabelChip = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * The surface-colored chip that backs a placed handle label. The chip
 * guarantees legibility even when a dense waveform leaves no obstacle-free
 * candidate: the stroke is masked behind the label instead of crossing the
 * glyphs. The rect is clamped inside the canvas.
 */
export const waveLabelChipRect = (input: {
	labelX: number;
	labelY: number;
	labelWidth: number;
	canvasWidth: number;
	canvasHeight: number;
}): WaveLabelChip => {
	const width = Math.min(
		input.labelWidth + LABEL_CHIP_PAD_X * 2,
		Math.max(1, input.canvasWidth - LABEL_MARGIN * 2),
	);
	const height = Math.min(
		LABEL_HEIGHT + LABEL_CHIP_PAD_Y * 2,
		Math.max(1, input.canvasHeight - LABEL_MARGIN * 2),
	);
	return {
		x: Math.min(
			Math.max(input.labelX - LABEL_CHIP_PAD_X, LABEL_MARGIN),
			Math.max(LABEL_MARGIN, input.canvasWidth - LABEL_MARGIN - width),
		),
		y: Math.min(
			Math.max(
				input.labelY - LABEL_HEIGHT / 2 - LABEL_CHIP_PAD_Y,
				LABEL_MARGIN,
			),
			Math.max(LABEL_MARGIN, input.canvasHeight - LABEL_MARGIN - height),
		),
		width,
		height,
	};
};

const pointInRect = (x: number, y: number, rect: WaveLabelChip): boolean =>
	x >= rect.x &&
	x <= rect.x + rect.width &&
	y >= rect.y &&
	y <= rect.y + rect.height;

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
	const text =
		style.getPropertyValue("--ty-text-primary").trim() ||
		CANVAS_FALLBACK_TEXT_COLOR;
	const muted =
		style.getPropertyValue("--ty-text-muted").trim() ||
		CANVAS_FALLBACK_MUTED_COLOR;
	const accent = style.getPropertyValue("--ty-text-accent").trim() || text;
	const grid =
		style.getPropertyValue("--ty-border-surface").trim() ||
		CANVAS_FALLBACK_GRID_COLOR;
	const surface =
		style.getPropertyValue("--ty-surface-widget").trim() ||
		CANVAS_FALLBACK_SURFACE_COLOR;
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
			// Surface halo keeps the tangent handle readable where the
			// waveform passes nearby; the connector is drawn over it so
			// the handle still reads as attached to its curve point.
			ctx.fillStyle = surface;
			ctx.beginPath();
			ctx.arc(hx, hy, 3 + DOT_HALO_PAD, 0, Math.PI * 2);
			ctx.fill();
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
	const waveObstacles = waveLabelObstacles(waveScreen);
	const placedHandles = handleScreen.map((handle) => {
		const active = hover?.kind === "wave-handle" && hover.handle === handle.key;
		return {
			...handle,
			active,
			radius: active ? HANDLE_RADIUS + 1 : HANDLE_RADIUS,
		};
	});
	const drawHandleDot = (handle: (typeof placedHandles)[number]): void => {
		// Surface halo separates the dot from the waveform stroke; without
		// it a dense oscillation merges into the handle silhouette.
		ctx.fillStyle = surface;
		ctx.beginPath();
		ctx.arc(handle.x, handle.y, handle.radius + DOT_HALO_PAD, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = handle.active ? accent : text;
		ctx.beginPath();
		ctx.arc(handle.x, handle.y, handle.radius, 0, Math.PI * 2);
		ctx.fill();
	};
	for (const handle of placedHandles) drawHandleDot(handle);
	const placedLabels = placedHandles.map((handle) => {
		const labelWidth = ctx.measureText(labels[handle.key]).width;
		const obstacles = waveObstacles.concat(
			placedHandles.flatMap((other) =>
				other.key === handle.key ? [] : [{ x: other.x, y: other.y }],
			),
		);
		const label = placeWaveHandleLabel({
			handleX: handle.x,
			handleY: handle.y,
			handleRadius: handle.radius,
			labelWidth,
			canvasWidth: width,
			canvasHeight: height,
			obstacles,
		});
		return {
			handle,
			label,
			labelWidth,
			chip: waveLabelChipRect({
				labelX: label.x,
				labelY: label.y,
				labelWidth,
				canvasWidth: width,
				canvasHeight: height,
			}),
		};
	});
	// Chips first, then every label: a chip can overlap a sibling chip but
	// must never cover another label's glyphs.
	for (const info of placedLabels) {
		ctx.fillStyle = surface;
		ctx.fillRect(info.chip.x, info.chip.y, info.chip.width, info.chip.height);
	}
	for (const info of placedLabels) {
		ctx.fillStyle = info.handle.active ? accent : muted;
		ctx.fillText(labels[info.handle.key], info.label.x, info.label.y);
	}
	// Edge-clamped chips can still cover a sibling handle dot; redraw it.
	for (const handle of placedHandles) {
		if (
			placedLabels.some((info) => pointInRect(handle.x, handle.y, info.chip))
		) {
			drawHandleDot(handle);
		}
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
