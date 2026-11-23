/**
 * Pure math for the easing-curve icon: turns the preset `cubic` / `points`
 * payload into cubic bezier segments and measures their true bounding box.
 * Easing control points routinely overshoot the 0..1 value range (pop /
 * wobble curves), so the icon must scale to the curve's actual extrema
 * instead of assuming the unit square — otherwise the stroke is clipped by
 * the canvas edge (#481).
 */

export type CubicParams = [number, number, number, number];
export type MultiPointParams = [
	number,
	number,
	number,
	number,
	number,
	number,
][];

export type EasingCurveSegment = {
	xs: [number, number, number, number];
	ys: [number, number, number, number];
};

export type EasingCurveBounds = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

const bezierAt = (
	v0: number,
	v1: number,
	v2: number,
	v3: number,
	t: number,
): number => {
	const u = 1 - t;
	return (
		u * u * u * v0 + 3 * u * u * t * v1 + 3 * u * t * t * v2 + t * t * t * v3
	);
};

/**
 * Parameter values in (0, 1) where the cubic bezier's derivative vanishes —
 * i.e. the curve's local extrema for one axis. The derivative of a cubic
 * bezier is a quadratic bezier with control values 3(v1-v0), 3(v2-v1),
 * 3(v3-v2); solving it reduces to a quadratic equation.
 */
const bezierExtremaTs = (
	v0: number,
	v1: number,
	v2: number,
	v3: number,
): number[] => {
	const a = -v0 + 3 * v1 - 3 * v2 + v3;
	const b = 2 * (v0 - 2 * v1 + v2);
	const c = v1 - v0;
	const roots: number[] = [];
	if (Math.abs(a) < 1e-12) {
		if (Math.abs(b) > 1e-12) roots.push(-c / b);
	} else {
		const disc = b * b - 4 * a * c;
		if (disc >= 0) {
			const s = Math.sqrt(disc);
			roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
		}
	}
	return roots.filter((t) => t > 0 && t < 1);
};

/**
 * Normalizes the icon payload into absolute cubic segments. For multi-ease
 * `points`, each consecutive key pair forms one segment whose control
 * points are the keys' positions plus their in/out offsets — the same
 * convention `CanvasEasingIcon` draws with.
 */
export function easingCurveSegments(
	cubic?: CubicParams,
	points?: MultiPointParams,
): EasingCurveSegment[] {
	if (points && points.length >= 2) {
		const segments: EasingCurveSegment[] = [];
		for (let i = 0; i < points.length - 1; i += 1) {
			const cur = points[i];
			const next = points[i + 1];
			segments.push({
				xs: [cur[0], cur[0] + cur[4], next[0] + next[2], next[0]],
				ys: [cur[1], cur[1] + cur[5], next[1] + next[3], next[1]],
			});
		}
		return segments;
	}
	if (cubic) {
		const [x1, y1, x2, y2] = cubic;
		return [{ xs: [0, x1, x2, 1], ys: [0, y1, y2, 1] }];
	}
	return [];
}

/** Tight bounding box of the curve itself (not its control polygon). */
export function easingCurveBounds(
	segments: readonly EasingCurveSegment[],
): EasingCurveBounds {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const segment of segments) {
		for (const t of [0, 1, ...bezierExtremaTs(...segment.xs)]) {
			const v = bezierAt(
				segment.xs[0],
				segment.xs[1],
				segment.xs[2],
				segment.xs[3],
				t,
			);
			minX = Math.min(minX, v);
			maxX = Math.max(maxX, v);
		}
		for (const t of [0, 1, ...bezierExtremaTs(...segment.ys)]) {
			const v = bezierAt(
				segment.ys[0],
				segment.ys[1],
				segment.ys[2],
				segment.ys[3],
				t,
			);
			minY = Math.min(minY, v);
			maxY = Math.max(maxY, v);
		}
	}
	return { minX, maxX, minY, maxY };
}
