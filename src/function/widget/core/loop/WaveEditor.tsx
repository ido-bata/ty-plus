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
import { useTranslation } from "react-i18next";
import {
	applyWaveHandleDrag,
	attackShare,
	buildCyclicWave,
	type CyclicWaveParams,
	chordValue,
	type WavePoint,
} from "@/function/widget/core/loop/cyclic-wave";
import { drawWaveScene } from "./draw-wave";
import { type DragTarget, hitTestWave } from "./hit-test";
import {
	fitWaveCamera,
	screenToTime,
	screenToValue,
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
	/** Called while the user scrubs the timeline (the background drag). */
	onScrub?: (time: number) => void;
};

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
	onScrub,
}: WaveEditorProps): JSX.Element {
	const { t } = useTranslation("widgets");
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<DragTarget | null>(null);
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
	useEffect(() => {
		cameraRef.current = camera;
	}, [camera]);
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		drawWaveScene(ctx, {
			canvas,
			width: size.width,
			height: size.height,
			camera: cameraRef.current,
			wavePoints,
			template,
			wave,
			labels,
			hover,
			previewTime,
		});
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
		(screenX: number, screenY: number): DragTarget =>
			hitTestWave(screenX, screenY, cameraRef.current, template, wave),
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
				onScrub?.(Math.max(0, Math.min(1, time)));
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
				const legScale = Math.max(1e-6, attackShare(wave.bias) / wave.cycles);
				point.x = Math.max(0, Math.min(1, time / legScale));
				point.y = value;
				onTemplateChange(next);
				return;
			}
			if (target.kind === "template-handle") {
				const point = next[target.index];
				if (!point) return;
				const legScale = Math.max(1e-6, attackShare(wave.bias) / wave.cycles);
				const handle = point[target.side];
				handle.x = (time - point.x * legScale) / legScale;
				handle.y = value - chordValue(template, point.x);
				onTemplateChange(next);
			}
		},
		[hitTest, onScrub, onTemplateChange, onWaveChange, template, wave],
	);

	const handlePointerUp = useCallback(() => {
		dragRef.current = null;
	}, []);

	const handleWheel = useCallback((event: WheelEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const cam = cameraRef.current;
		if (event.shiftKey) {
			const delta = (event.deltaY > 0 ? 1 : -1) * cam.viewSpan * 0.1;
			setView((current) => ({
				start: Math.max(0, Math.min(1 - current.span, current.start + delta)),
				span: current.span,
			}));
			return;
		}
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
				aria-label={t("loop.waveCanvas")}
				data-ws-loop-wave-canvas="1"
				data-tutorial-target="loop-canvas"
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
