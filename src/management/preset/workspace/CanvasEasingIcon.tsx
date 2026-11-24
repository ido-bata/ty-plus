import type { CSSProperties, JSX } from "react";
import { useEffect, useRef } from "react";

import {
	type CubicParams,
	easingCurveBounds,
	easingCurveSegments,
	type MultiPointParams,
} from "./easing-curve";
import { CANVAS_EASING_AXES_COLOR } from "@/management/preset/literals/canvas-colors";

/** Renders a cubic bezier easing curve in a small canvas. If `points` is
 *  provided (multi-ease), draws the full multi-segment curve. Otherwise
 *  falls back to a single cubic bezier drawn from `cubic`. */
export function CanvasEasingIcon({
	cubic,
	points,
	color = "currentColor",
}: {
	cubic?: CubicParams;
	points?: MultiPointParams;
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
		// The curve stroke is 1.5px wide, so it needs a slightly larger inset
		// than the axes or its outermost pixels would touch the canvas edge.
		const curvePad = pad + 1;

		ctx.clearRect(0, 0, w, h);

		// Draw axes
		ctx.strokeStyle = CANVAS_EASING_AXES_COLOR;
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		ctx.moveTo(pad, h - pad);
		ctx.lineTo(w - pad, h - pad);
		ctx.moveTo(pad, pad);
		ctx.lineTo(pad, h - pad);
		ctx.stroke();

		const segments = easingCurveSegments(cubic, points);
		if (segments.length === 0) return;

		// Overshooting easings leave the 0..1 value range, so the curve is
		// mapped onto its measured bounding box instead of the unit square —
		// otherwise the stroke is clipped at the canvas edge (#481).
		const bounds = easingCurveBounds(segments);
		const rangeX = bounds.maxX - bounds.minX || 1;
		const rangeY = bounds.maxY - bounds.minY || 1;
		const plotW = w - 2 * curvePad;
		const plotH = h - 2 * curvePad;
		const toCanvas = (x: number, y: number): [number, number] => [
			curvePad + (plotW * (x - bounds.minX)) / rangeX,
			h - curvePad - (plotH * (y - bounds.minY)) / rangeY,
		];

		// `currentColor` is not a valid canvas color — assigning it is
		// silently ignored and the curve keeps the previous (faint axes)
		// stroke, which is what made the curve disappear into dark tile
		// backgrounds. Resolve it against the element's computed color.
		ctx.strokeStyle =
			color === "currentColor" ? getComputedStyle(canvas).color : color;
		ctx.lineWidth = 1.5;
		ctx.beginPath();

		if (points && points.length >= 2) {
			// Multi-segment: draw the curve as a series of cubic beziers
			// where each segment uses the previous key's hOut and the
			// next key's hIn as the control points.
			const p0 = toCanvas(points[0][0], points[0][1]);
			ctx.moveTo(p0[0], p0[1]);
			for (let i = 0; i < points.length - 1; i += 1) {
				const cur = points[i];
				const next = points[i + 1];
				const [cp1x, cp1y] = toCanvas(cur[0] + cur[4], cur[1] + cur[5]);
				const [cp2x, cp2y] = toCanvas(next[0] + next[2], next[1] + next[3]);
				const [p3x, p3y] = toCanvas(next[0], next[1]);
				ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p3x, p3y);
			}
		} else {
			// Single cubic fallback
			const [x1, y1, x2, y2] = cubic ?? [0, 0, 1, 1];
			const [sx, sy] = toCanvas(0, 0);
			const [c1x, c1y] = toCanvas(x1, y1);
			const [c2x, c2y] = toCanvas(x2, y2);
			const [ex, ey] = toCanvas(1, 1);
			ctx.moveTo(sx, sy);
			ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
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
