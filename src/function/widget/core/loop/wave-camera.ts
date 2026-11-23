/**
 * Time-space camera for the Loop widget's wave editor.
 *
 * The Loop editor is NOT a square value graph: the horizontal axis is time
 * across the edited segment and the vertical axis is the animated value.
 * The camera therefore maps normalized time (0..1 of the segment) to pixels
 * and can show a window of the segment when many cycles would not fit.
 */

export type WaveCamera = {
	/** Normalized time at the left edge of the viewport. */
	viewStart: number;
	/** Normalized time span shown in the viewport. */
	viewSpan: number;
	/** Pixels per normalized time unit. */
	scale: number;
	/** Pixel x of normalized time 0. */
	offset: number;
	/** Pixel y of the value 0 (the bottom of the value range). */
	baseY: number;
	/** Pixels per value unit. */
	valueScale: number;
};

export type WaveViewport = {
	width: number;
	height: number;
	/** Value range shown vertically (min, max). */
	valueMin: number;
	valueMax: number;
	/** Padding around the value range, in value units. */
	padding?: number;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

/**
 * Fit the whole segment horizontally, or a window of it when the cycles
 * would otherwise be too dense to read.
 */
export const fitWaveCamera = (
	viewport: WaveViewport,
	viewStart = 0,
	viewSpan = 1,
): WaveCamera => {
	const width = Math.max(1, viewport.width);
	const height = Math.max(1, viewport.height);
	const span = clamp(viewSpan, 0.05, 1);
	const scale = width / span;
	const offset = -viewStart * scale;
	const pad = viewport.padding ?? 0.08;
	const range = Math.max(0.1, viewport.valueMax - viewport.valueMin);
	const valueScale = height / (range + pad * 2);
	const baseY = height - (viewport.valueMin - pad) * valueScale;
	return {
		viewStart,
		viewSpan: span,
		scale,
		offset,
		baseY,
		valueScale,
	};
};

/** Normalized time -> pixel x. */
export const timeToScreen = (time: number, camera: WaveCamera): number =>
	camera.offset + time * camera.scale;

/** Pixel x -> normalized time. */
export const screenToTime = (x: number, camera: WaveCamera): number =>
	(x - camera.offset) / camera.scale;

/** Value -> pixel y (the value axis points up). */
export const valueToScreen = (value: number, camera: WaveCamera): number =>
	camera.baseY - value * camera.valueScale;

/** Pixel y -> value. */
export const screenToValue = (y: number, camera: WaveCamera): number =>
	(camera.baseY - y) / camera.valueScale;
