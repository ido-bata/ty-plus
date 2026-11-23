/**
 * Loop widget's motion preview.
 *
 * The preview is not decoration: the moving marker is driven by the same
 * `cyclic-wave.ts` model that the AE host applies, so what the user sees is
 * what AE receives. The marker travels along the time axis and its height is
 * the animated value.
 */

import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	buildCyclicWave,
	type CyclicWaveParams,
	sampleWave,
	type WavePoint,
} from "@/function/widget/core/loop/cyclic-wave";

export type MotionPreviewProps = {
	template: WavePoint[];
	wave: CyclicWaveParams;
	/** Normalized time of the playhead (0..1), or null when idle. */
	time: number | null;
};

const TRAIL_LENGTH = 18;

export function MotionPreview({
	template,
	wave,
	time,
}: MotionPreviewProps): JSX.Element {
	const { t } = useTranslation("widgets");
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const trailRef = useRef<{ x: number; y: number }[]>([]);
	const points = buildCyclicWave(template, wave);
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;
		const resize = (): void => {
			const rect = container.getBoundingClientRect();
			const width = Math.max(1, Math.floor(rect.width));
			const height = Math.max(1, Math.floor(rect.height));
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.floor(width * dpr);
			canvas.height = Math.floor(height * dpr);
			const ctx = canvas.getContext("2d");
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			draw(width, height);
		};
		const draw = (width: number, height: number): void => {
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.clearRect(0, 0, width, height);
			const style = getComputedStyle(canvas);
			const text = style.getPropertyValue("--ty-text-primary").trim() || "#fff";
			const muted = style.getPropertyValue("--ty-text-muted").trim() || "#999";
			const accent = style.getPropertyValue("--ty-text-accent").trim() || text;
			const values = points.map((point) => point.y);
			const min = Math.min(...values, 0);
			const max = Math.max(...values, 1);
			const pad = (max - min) * 0.15 + 0.05;
			const top = min - pad;
			const bottom = max + pad;
			const toY = (value: number): number =>
				height - ((value - top) / (bottom - top)) * height;
			const toX = (t: number): number => t * width;
			// The travelled path (the motion trail).
			const trail = trailRef.current;
			if (trail.length > 1) {
				ctx.strokeStyle = muted;
				ctx.lineWidth = 1;
				ctx.beginPath();
				trail.forEach((point, index) => {
					if (index === 0) ctx.moveTo(point.x, point.y);
					else ctx.lineTo(point.x, point.y);
				});
				ctx.stroke();
			}
			// The motion path: the value over time.
			ctx.strokeStyle = muted;
			ctx.globalAlpha = 0.2;
			ctx.lineWidth = 1;
			ctx.beginPath();
			points.forEach((point, index) => {
				const x = toX(point.x);
				const y = toY(point.y);
				if (index === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.stroke();
			ctx.globalAlpha = 1;

			// The moving marker: its height is the animated value.
			if (time !== null) {
				const value = sampleWave(points, time);
				const x = toX(time);
				const y = toY(value);
				trail.push({ x, y });
				while (trail.length > TRAIL_LENGTH) trail.shift();
				ctx.strokeStyle = accent;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
				ctx.stroke();
				// The runner on the time track and the value it produces.
				const trackY = height - 6;
				ctx.strokeStyle = muted;
				ctx.globalAlpha = 0.5;
				ctx.beginPath();
				ctx.moveTo(0, trackY);
				ctx.lineTo(width, trackY);
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.strokeStyle = accent;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x, trackY);
				ctx.stroke();
				ctx.fillStyle = accent;
				ctx.fillRect(x - 4, trackY - 4, 8, 8);
				ctx.beginPath();
				ctx.arc(x, y, 4, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = accent;
				ctx.globalAlpha = 0.35;
				ctx.beginPath();
				ctx.arc(x, y, 9, 0, Math.PI * 2);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
		};
		resize();
		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", resize);
			return () => window.removeEventListener("resize", resize);
		}
		const observer = new ResizeObserver(resize);
		observer.observe(container);
		return () => observer.disconnect();
	}, [points, time]);

	return (
		<div
			ref={containerRef}
			style={{ position: "relative", width: "100%", height: "100%" }}
		>
			<canvas
				ref={canvasRef}
				aria-label={t("loop.previewCanvas")}
				style={{ width: "100%", height: "100%", display: "block" }}
			/>
		</div>
	);
}
