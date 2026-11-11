import type { CSSProperties, JSX } from "react";
import { useEffect, useRef } from "react";

/** Renders a cubic bezier easing curve in a small canvas. If `points` is
 *  provided (multi-ease), draws the full multi-segment curve. Otherwise
 *  falls back to a single cubic bezier drawn from `cubic`. */
export function CanvasEasingIcon({
	cubic,
	points,
	color = "currentColor",
}: {
	cubic?: [number, number, number, number];
	points?: [number, number, number, number, number, number][];
	color?: string;
}): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		ctx.scale(dpr, dpr);

		const w = rect.width;
		const h = rect.height;
		const pad = 2;

		ctx.clearRect(0, 0, w, h);

		// Draw axes
		ctx.strokeStyle = "rgba(128,128,128,0.3)";
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		ctx.moveTo(pad, h - pad);
		ctx.lineTo(w - pad, h - pad);
		ctx.moveTo(pad, pad);
		ctx.lineTo(pad, h - pad);
		ctx.stroke();

		ctx.strokeStyle = color;
		ctx.lineWidth = 1.5;
		ctx.beginPath();

		if (points && points.length >= 2) {
			// Multi-segment: draw the curve as a series of cubic beziers
			// where each segment uses the previous key's hOut and the
			// next key's hIn as the control points.
			const toCanvas = (x: number, y: number): [number, number] => [
				pad + (w - 2 * pad) * x,
				h - pad - (h - 2 * pad) * y,
			];
			const p0 = toCanvas(points[0][0], points[0][1]);
			ctx.moveTo(p0[0], p0[1]);
			for (let i = 0; i < points.length - 1; i += 1) {
				const cur = points[i];
				const next = points[i + 1];
				const cp1 = toCanvas(cur[0] + cur[4], cur[1] + cur[5]);
				const cp2 = toCanvas(next[0] + next[2], next[1] + next[3]);
				const p3 = toCanvas(next[0], next[1]);
				ctx.bezierCurveTo(cp1[0], cp1[1], cp2[0], cp2[1], p3[0], p3[1]);
			}
		} else if (cubic) {
			// Single cubic fallback
			const [x1, y1, x2, y2] = cubic;
			ctx.moveTo(pad, h - pad);
			ctx.bezierCurveTo(
				pad + (w - 2 * pad) * x1,
				h - pad - (h - 2 * pad) * y1,
				pad + (w - 2 * pad) * x2,
				h - pad - (h - 2 * pad) * y2,
				w - pad,
				pad,
			);
		}

		ctx.stroke();
	}, [cubic, points, color]);

	return (
		<canvas
			ref={canvasRef}
			style={{ width: "100%", height: "100%" } as CSSProperties}
		/>
	);
}
