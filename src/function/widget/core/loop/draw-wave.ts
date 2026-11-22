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
	ctx.strokeStyle = text;
	ctx.lineWidth = 2;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	wavePoints.forEach((point, index) => {
		const x = timeToScreen(point.x, cam);
		const y = valueToScreen(point.y, cam);
		if (index === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
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
	for (const key of Object.keys(handles) as (keyof typeof handles)[]) {
		const position = handles[key];
		const x = timeToScreen(position.x, cam);
		const y = valueToScreen(position.y, cam);
		const active = hover?.kind === "wave-handle" && hover.handle === key;
		ctx.fillStyle = active ? accent : text;
		ctx.beginPath();
		ctx.arc(x, y, active ? HANDLE_RADIUS + 1 : HANDLE_RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = active ? accent : muted;
		ctx.font = "10px system-ui, sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		const labelX = Math.min(
			Math.max(x + HANDLE_RADIUS + 3, 2),
			Math.max(2, width - ctx.measureText(labels[key]).width - 2),
		);
		ctx.fillText(labels[key], labelX, y);
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
