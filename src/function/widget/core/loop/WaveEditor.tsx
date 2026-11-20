/**
 * Loop widget's wave editor.
 *
 * This is NOT the Easing widget's square value graph: the horizontal axis is
 * time across the edited segment and the vertical axis is the animated value.
 * The whole surface is one interaction canvas: the repeated waveform, the
 * representative (edited) cycle, the cycle boundaries, the damping envelope,
 * the playhead and the four direct-manipulation handles (easing / frequency /
 * bias / damping).
 */

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import {
	applyWaveHandleDrag,
	attackShare,
	buildCyclicWave,
	type CyclicWaveParams,
	chordValue,
	cycleBoundaries,
	type WaveHandle,
	type WavePoint,
	waveHandlePositions,
} from "@/function/widget/curve-editor/cyclic-wave";
import {
	fitWaveCamera,
	screenToTime,
	screenToValue,
	timeToScreen,
	valueToScreen,
	type WaveCamera,
} from "./wave-camera";

export type WaveHandleLabels = {
	easing: string;
	frequency: string;
	bias: string;
	damping: string;
};

export type WaveEditorProps = {
	/** Labels drawn next to the parameter handles. */
	labels: WaveHandleLabels;
	/** The shared template: one attack leg of the cycle. */
	template: WavePoint[];
	/** The cyclic wave parameters. */
	wave: CyclicWaveParams;
	onTemplateChange: (points: WavePoint[]) => void;
	onWaveChange: (wave: CyclicWaveParams) => void;
	/** Normalized time of the playhead (0..1), or null when idle. */
	previewTime?: number | null;
};

type DragTarget =
	| { kind: "wave-handle"; handle: WaveHandle }
	| { kind: "template-point"; index: number }
	| { kind: "template-handle"; index: number; side: "hIn" | "hOut" }
	| { kind: "pan" };

const shareOf = (wave: CyclicWaveParams): number => attackShare(wave.bias);

const HANDLE_HIT_PX = 12;
const HANDLE_RADIUS = 5;

const cloneTemplate = (points: WavePoint[]): WavePoint[] =>
	points.map((point) => ({
		x: point.x,
		y: point.y,
		hIn: { ...point.hIn },
		hOut: { ...point.hOut },
	}));

export function WaveEditor({
	labels,
	template,
	wave,
	onTemplateChange,
	onWaveChange,
	previewTime,
}: WaveEditorProps): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<DragTarget | null>(null);
	const lastX = useRef(0);
	const [size, setSize] = useState({ width: 320, height: 140 });
	const [view, setView] = useState({ start: 0, span: 1 });
	const [hover, setHover] = useState<DragTarget | null>(null);
	const wavePoints = buildCyclicWave(template, wave);
	const valueRange = wavePoints.reduce(
		(acc, point) => ({
			min: Math.min(acc.min, point.y),
			max: Math.max(acc.max, point.y),
		}),
		{ min: 0, max: 1 },
	);
	const camera = fitWaveCamera(
		{
			width: size.width,
			height: size.height,
			valueMin: valueRange.min,
			valueMax: valueRange.max,
		},
		wave.cycles,
		view.start,
		view.span,
	);
	const cameraRef = useRef<WaveCamera>(camera);
	cameraRef.current = camera;
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const cam = cameraRef.current;
		const width = size.width;
		const height = size.height;
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
		const legTimeScale = Math.max(1e-6, shareOf(wave) / wave.cycles);
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
		// The three parameter handles.
		const handles = waveHandlePositions(template, wave);
		for (const key of Object.keys(handles) as WaveHandle[]) {
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
	}, [hover, labels, previewTime, size, template, wave, wavePoints]);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) return;
		const resize = (): void => {
			const rect = container.getBoundingClientRect();
			const width = Math.max(1, Math.floor(rect.width));
			const height = Math.max(1, Math.floor(rect.height));
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.floor(width * dpr);
			canvas.height = Math.floor(height * dpr);
			const ctx = canvas.getContext("2d");
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			setSize({ width, height });
		};
		resize();
		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", resize);
			return () => window.removeEventListener("resize", resize);
		}
		const observer = new ResizeObserver(resize);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		draw();
	}, [draw]);
	const hitTest = useCallback(
		(screenX: number, screenY: number): DragTarget => {
			const cam = cameraRef.current;
			const handles = waveHandlePositions(template, wave);
			for (const key of Object.keys(handles) as WaveHandle[]) {
				const position = handles[key];
				const x = timeToScreen(position.x, cam);
				const y = valueToScreen(position.y, cam);
				if (Math.hypot(x - screenX, y - screenY) <= HANDLE_HIT_PX) {
					return { kind: "wave-handle", handle: key };
				}
			}
			// The template's control points and handles (edit cycle only).
			const legScale = Math.max(1e-6, shareOf(wave) / wave.cycles);
			for (let index = 0; index < template.length; index += 1) {
				const point = template[index];
				const px = timeToScreen(point.x * legScale, cam);
				const py = valueToScreen(chordValue(template, point.x), cam);
				if (Math.hypot(px - screenX, py - screenY) <= HANDLE_HIT_PX) {
					return { kind: "template-point", index };
				}
				for (const side of ["hIn", "hOut"] as const) {
					const handle = point[side];
					const hx = timeToScreen(
						point.x * legScale + handle.x * legScale,
						cam,
					);
					const hy = valueToScreen(
						chordValue(template, point.x) + handle.y,
						cam,
					);
					if (Math.hypot(hx - screenX, hy - screenY) <= HANDLE_HIT_PX) {
						return { kind: "template-handle", index, side };
					}
				}
			}
			return { kind: "pan" };
		},
		[template, wave],
	);

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			const target = hitTest(x, y);
			dragRef.current = target;
			setHover(target);
			if (target.kind === "pan") return;
			event.preventDefault();
			event.stopPropagation();
			if (typeof event.pointerId === "number") {
				canvas.setPointerCapture(event.pointerId);
			}
		},
		[hitTest],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			const target = dragRef.current;
			if (!target) {
				setHover(hitTest(x, y));
				return;
			}
			const cam = cameraRef.current;
			const time = screenToTime(x, cam);
			const value = screenToValue(y, cam);
			if (target.kind === "pan") {
				const span = cam.viewSpan;
				const delta = (x - lastX.current) / cam.scale;
				setView((current) => ({
					start: Math.max(0, Math.min(1 - span, current.start - delta)),
					span: current.span,
				}));
				lastX.current = x;
				return;
			}
			if (target.kind === "wave-handle") {
				onWaveChange(
					applyWaveHandleDrag(
						target.handle,
						{ x: time, y: value },
						template,
						wave,
					),
				);
				return;
			}
			const next = cloneTemplate(template);
			if (target.kind === "template-point") {
				const point = next[target.index];
				if (!point) return;
				const legScale = Math.max(1e-6, shareOf(wave) / wave.cycles);
				point.x = Math.max(0, Math.min(1, time / legScale));
				point.y = value;
				onTemplateChange(next);
				return;
			}
			if (target.kind === "template-handle") {
				const point = next[target.index];
				if (!point) return;
				const legScale = Math.max(1e-6, shareOf(wave) / wave.cycles);
				const handle = point[target.side];
				handle.x = (time - point.x * legScale) / legScale;
				handle.y = value - chordValue(template, point.x);
				onTemplateChange(next);
			}
		},
		[hitTest, onTemplateChange, onWaveChange, template, wave],
	);

	const handlePointerUp = useCallback(() => {
		dragRef.current = null;
	}, []);

	const handleWheel = useCallback((event: WheelEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const cam = cameraRef.current;
		const span = Math.max(
			0.05,
			Math.min(1, cam.viewSpan * (event.deltaY > 0 ? 1.1 : 0.9)),
		);
		setView((current) => ({ ...current, span }));
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		canvas.addEventListener("wheel", handleWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", handleWheel);
	}, [handleWheel]);

	return (
		<div
			ref={containerRef}
			style={{ position: "relative", width: "100%", height: "100%" }}
		>
			<canvas
				ref={canvasRef}
				aria-label="Loop wave editor"
				data-ws-loop-wave-canvas="1"
				style={{ width: "100%", height: "100%", touchAction: "none" }}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onPointerLeave={() => setHover(null)}
			/>
		</div>
	);
}
