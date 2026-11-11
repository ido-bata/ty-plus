/**
 * Procedural easing curve point generation (bounce / elastic).
 *
 * Restored from the legacy easing editor (archive/rebuild-foundation-legacy-root/
 * src/js/ui/easing/easing-editor-view.tsx) to recover the least-squares bezier
 * fit, prominence-based extremum detection, monotonicity guards, and
 * simplification loop that the simplified `proceduralPointsForApply` had lost.
 *
 * The simplified version produced bezier handles with `hOut.y = hIn.y = 0` for
 * every segment, which erased the bounce peaks and elastic wobble at extreme
 * handle values. The AE script (applyComplexEase) maps `hOut.y / hOut.x` to
 * KeyframeEase slope, so flat handles flatten the applied easing shape.
 */

type ProceduralMode = "bounce" | "elastic";
export type ProceduralPoint = { x: number; y: number };
export type ProceduralCurvePoint = {
	x: number;
	y: number;
	hIn: ProceduralPoint;
	hOut: ProceduralPoint;
};
type ExtremumType = "max" | "min";

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

const getElasticValue = (t: number, hx: number, hy: number): number => {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const freq = 1 + clamp(hx, 0, 1) * 4;
	const amp = clamp(1 - hy, 0, 1);
	const minAmp = 0.02;
	const target = minAmp + amp * (1 - minAmp);
	const base = 1 - Math.exp(-6 * t);
	const omega = Math.PI * 2 * freq;
	const decay = Math.exp(-3 * t);
	const t0 = 0.35 / freq;
	const sRaw = clamp(t / t0, 0, 1);
	const s = sRaw * sRaw * (3 - 2 * sRaw);
	const wobble = target * decay * Math.sin(omega * t);
	const centered = 1 + wobble;
	const blended = base * (1 - s) + centered * s;
	return Math.max(0, blended);
};

const getBounceValue = (t: number, hx: number, hy: number): number => {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	const freq = 1 + clamp(hx, 0, 1) * 4;
	const amp = clamp(1 - hy, 0, 1);
	const minAmp = 0.03;
	const target = minAmp + amp * (1 - minAmp);
	const wave = Math.abs(Math.cos(Math.PI * freq * t));
	const relax = 1 - Math.exp(-6 * t);
	const depth = wave * (1 - relax * (1 - target));
	const firstBounceAt = 0.5 / freq;
	if (t < firstBounceAt) {
		const tt = t / firstBounceAt;
		return clamp(tt * tt, 0, 1);
	}
	return clamp(1 - (1 - t) * depth, 0, 1);
};

const getProceduralValue = (
	mode: ProceduralMode,
	t: number,
	handle: ProceduralPoint,
): number =>
	mode === "elastic"
		? getElasticValue(t, handle.x, handle.y)
		: getBounceValue(t, handle.x, handle.y);

const solveLeastSquares2 = (
	a11: number,
	a12: number,
	a22: number,
	b1: number,
	b2: number,
): { y1: number; y2: number } | null => {
	const det = a11 * a22 - a12 * a12;
	if (Math.abs(det) < 1e-10) return null;
	return { y1: (b1 * a22 - b2 * a12) / det, y2: (b2 * a11 - b1 * a12) / det };
};

const fitSegmentHandles = (
	mode: ProceduralMode,
	handle: ProceduralPoint,
	p0: ProceduralPoint,
	p3: ProceduralPoint,
	startFlat: boolean,
	endFlat: boolean,
): { hOut: ProceduralPoint; hIn: ProceduralPoint } => {
	const dx = p3.x - p0.x;
	if (dx <= 1e-6) {
		return { hOut: { x: 0, y: 0 }, hIn: { x: 0, y: 0 } };
	}

	const samples = 10;
	const ts = Array.from({ length: samples }, (_, i) => (i + 1) / (samples + 1));
	const uMin = 0.12;
	const uMax = 0.45;
	const vMin = 0.55;
	const vMax = 0.88;
	const step = 0.05;
	const minGap = 0.08;

	let bestError = Number.POSITIVE_INFINITY;
	let best = {
		x1: p0.x + dx / 3,
		x2: p0.x + (dx * 2) / 3,
		y1: p0.y,
		y2: p3.y,
	};

	for (let u = uMin; u <= uMax + 1e-6; u += step) {
		for (let v = Math.max(vMin, u + minGap); v <= vMax + 1e-6; v += step) {
			const x1 = p0.x + dx * u;
			const x2 = p0.x + dx * v;
			let a11 = 0;
			let a12 = 0;
			let a22 = 0;
			let b1 = 0;
			let b2 = 0;
			let bOnly = 0;
			let bDen = 0;

			for (const t of ts) {
				const mt = 1 - t;
				const b0 = mt * mt * mt;
				const b1c = 3 * mt * mt * t;
				const b2c = 3 * mt * t * t;
				const b3 = t * t * t;
				const x = b0 * p0.x + b1c * x1 + b2c * x2 + b3 * p3.x;
				const yTarget = getProceduralValue(mode, x, handle);
				const c = b0 * p0.y + b3 * p3.y;

				const rhs = yTarget - c;

				if (!startFlat && !endFlat) {
					a11 += b1c * b1c;
					a12 += b1c * b2c;
					a22 += b2c * b2c;
					b1 += b1c * rhs;
					b2 += b2c * rhs;
				} else if (startFlat && !endFlat) {
					bOnly += b2c * rhs;
					bDen += b2c * b2c;
				} else if (!startFlat && endFlat) {
					bOnly += b1c * rhs;
					bDen += b1c * b1c;
				}
			}

			let y1 = p0.y;
			let y2 = p3.y;

			if (!startFlat && !endFlat) {
				const solved = solveLeastSquares2(a11, a12, a22, b1, b2);
				if (!solved) continue;
				y1 = solved.y1;
				y2 = solved.y2;
			} else if (startFlat && !endFlat) {
				if (Math.abs(bDen) < 1e-10) continue;
				y2 = bOnly / bDen;
			} else if (!startFlat && endFlat) {
				if (Math.abs(bDen) < 1e-10) continue;
				y1 = bOnly / bDen;
			}

			let error = 0;
			for (const t of ts) {
				const mt = 1 - t;
				const b0 = mt * mt * mt;
				const b1c = 3 * mt * mt * t;
				const b2c = 3 * mt * t * t;
				const b3 = t * t * t;
				const x = b0 * p0.x + b1c * x1 + b2c * x2 + b3 * p3.x;
				const yTarget = getProceduralValue(mode, x, handle);
				const yFit = b0 * p0.y + b1c * y1 + b2c * y2 + b3 * p3.y;
				const diff = yFit - yTarget;
				error += diff * diff;
			}

			if (error < bestError) {
				bestError = error;
				best = { x1, x2, y1, y2 };
			}
		}
	}

	const hOutY = startFlat ? 0 : best.y1 - p0.y;
	const hInY = endFlat ? 0 : best.y2 - p3.y;

	return {
		hOut: { x: best.x1 - p0.x, y: hOutY },
		hIn: { x: best.x2 - p3.x, y: hInY },
	};
};

const segmentMaxError = (
	mode: ProceduralMode,
	handle: ProceduralPoint,
	p0: ProceduralCurvePoint,
	p3: ProceduralCurvePoint,
	hOut: ProceduralPoint,
	hIn: ProceduralPoint,
): number => {
	const ts = Array.from({ length: 12 }, (_, i) => (i + 1) / 13);
	let maxError = 0;
	const p1 = { x: p0.x + hOut.x, y: p0.y + hOut.y };
	const p2 = { x: p3.x + hIn.x, y: p3.y + hIn.y };
	for (const t of ts) {
		const mt = 1 - t;
		const b0 = mt * mt * mt;
		const b1c = 3 * mt * mt * t;
		const b2c = 3 * mt * t * t;
		const b3 = t * t * t;
		const x = b0 * p0.x + b1c * p1.x + b2c * p2.x + b3 * p3.x;
		const y = b0 * p0.y + b1c * p1.y + b2c * p2.y + b3 * p3.y;
		const target = getProceduralValue(mode, x, handle);
		const err = Math.abs(y - target);
		if (err > maxError) maxError = err;
	}
	return maxError;
};

const enforceMonotonicSegment = (
	points: ProceduralCurvePoint[],
	index: number,
): void => {
	const p0 = points[index];
	const p3 = points[index + 1];
	if (!p0 || !p3) return;
	const minX = p0.x;
	const maxX = p3.x;
	const eps = 0.001;
	let p1x = clamp(p0.x + p0.hOut.x, minX, maxX);
	let p2x = clamp(p3.x + p3.hIn.x, minX, maxX);
	if (p1x > p2x - eps) {
		const mid = (p1x + p2x) / 2;
		p1x = clamp(mid - eps / 2, minX, maxX);
		p2x = clamp(mid + eps / 2, minX, maxX);
		if (p1x > p2x - eps) {
			p1x = clamp(p2x - eps, minX, maxX);
			p2x = clamp(p1x + eps, minX, maxX);
		}
	}
	p0.hOut.x = Math.max(0, p1x - p0.x);
	p3.hIn.x = Math.min(0, p2x - p3.x);
};

const _enforceMonotonicAround = (
	points: ProceduralCurvePoint[],
	index: number,
): void => {
	if (index > 0) enforceMonotonicSegment(points, index - 1);
	if (index < points.length - 1) enforceMonotonicSegment(points, index);
};

export const buildCurvePointsFromProcedural = (
	mode: ProceduralMode,
	handle: ProceduralPoint,
): ProceduralCurvePoint[] => {
	const sampleY = (x: number) => getProceduralValue(mode, x, handle);
	const freq = 1 + clamp(handle.x, 0, 1) * 4;

	const steps = Math.max(240, Math.round(240 * freq));
	const samples: ProceduralPoint[] = [];
	for (let i = 0; i <= steps; i += 1) {
		const x = i / steps;
		samples.push({ x, y: sampleY(x) });
	}

	const candidateIndices: { index: number; type: ExtremumType }[] = [];
	const window = 2;
	const slopeAt = (i: number): number => {
		const i0 = Math.max(0, i - window);
		const i1 = Math.min(samples.length - 1, i + window);
		const p0 = samples[i0];
		const p1 = samples[i1];
		if (!p0 || !p1) return 0;
		const dx = p1.x - p0.x;
		if (Math.abs(dx) < 1e-6) return 0;
		return (p1.y - p0.y) / dx;
	};
	const sign = (value: number): number => {
		const eps = 1e-4;
		if (Math.abs(value) < eps) return 0;
		return value > 0 ? 1 : -1;
	};
	let trend = 0;
	let segmentStart = window;
	for (let i = window; i < samples.length - window; i += 1) {
		const s = sign(slopeAt(i));
		if (s === 0) continue;
		if (trend === 0) {
			trend = s;
			segmentStart = i;
			continue;
		}
		if (s !== trend) {
			const start = Math.max(1, segmentStart - 1);
			const end = Math.min(samples.length - 2, i + 1);
			let best = start;
			let bestValue = samples[start].y;
			const type: ExtremumType = trend > 0 ? "max" : "min";
			for (let j = start; j <= end; j += 1) {
				const y = samples[j].y;
				if (type === "max" ? y > bestValue : y < bestValue) {
					best = j;
					bestValue = y;
				}
			}
			candidateIndices.push({ index: best, type });
			trend = s;
			segmentStart = i;
		}
	}

	const pickExtremumIndex = (center: number, type: ExtremumType): number => {
		const range = 2;
		const start = Math.max(1, center - range);
		const end = Math.min(samples.length - 2, center + range);
		let best = center;
		let bestValue = samples[center].y;
		for (let i = start; i <= end; i += 1) {
			const y = samples[i].y;
			if (type === "max" ? y > bestValue : y < bestValue) {
				best = i;
				bestValue = y;
			}
		}
		return best;
	};

	const minDx = Math.max(0.015, 0.22 / freq);
	const extremaIndices: number[] = [0];
	let lastIdx = 0;
	let lastProm = 0;
	let lastType: ExtremumType | null = null;
	for (const candidate of candidateIndices) {
		const extremumIdx = pickExtremumIndex(candidate.index, candidate.type);
		const prev = samples[Math.max(0, extremumIdx - window)];
		const curr = samples[extremumIdx];
		const next = samples[Math.min(samples.length - 1, extremumIdx + window)];
		if (!prev || !curr || !next) continue;
		const prom = Math.abs(curr.y - (prev.y + next.y) / 2);
		const dx = curr.x - samples[lastIdx].x;
		if (lastIdx === 0) {
			extremaIndices.push(extremumIdx);
			lastIdx = extremumIdx;
			lastProm = prom;
			lastType = candidate.type;
			continue;
		}
		if (lastType && lastType === candidate.type && dx < minDx) {
			if (prom > lastProm) {
				extremaIndices[extremaIndices.length - 1] = extremumIdx;
				lastIdx = extremumIdx;
				lastProm = prom;
				lastType = candidate.type;
			}
			continue;
		}
		extremaIndices.push(extremumIdx);
		lastIdx = extremumIdx;
		lastProm = prom;
		lastType = candidate.type;
	}
	extremaIndices.push(samples.length - 1);

	const uniqueIndices = extremaIndices.filter(
		(idx, i, arr) => i === 0 || idx !== arr[i - 1],
	);

	const points: ProceduralCurvePoint[] = uniqueIndices.map((idx) => {
		const p = samples[idx];
		return {
			x: p.x,
			y: p.y,
			hIn: { x: 0, y: 0 },
			hOut: { x: 0, y: 0 },
		};
	});

	const isExtremum = points.map((_, i) => i > 0 && i < points.length - 1);

	for (let i = 0; i < points.length - 1; i += 1) {
		const curr = points[i];
		const next = points[i + 1];
		const handles = fitSegmentHandles(
			mode,
			handle,
			curr,
			next,
			isExtremum[i],
			isExtremum[i + 1],
		);
		curr.hOut = handles.hOut;
		next.hIn = handles.hIn;
	}

	const maxError = 0.002;
	let simplified = true;
	while (simplified && points.length > 2) {
		simplified = false;
		for (let i = 1; i < points.length - 1; i += 1) {
			const prev = points[i - 1];
			const next = points[i + 1];
			const startFlat = i - 1 > 0;
			const endFlat = i + 1 < points.length - 1;
			const handles = fitSegmentHandles(
				mode,
				handle,
				prev,
				next,
				startFlat,
				endFlat,
			);
			const error = segmentMaxError(
				mode,
				handle,
				prev,
				next,
				handles.hOut,
				handles.hIn,
			);
			if (error <= maxError) {
				prev.hOut = handles.hOut;
				next.hIn = handles.hIn;
				points.splice(i, 1);
				simplified = true;
				break;
			}
		}
	}

	for (let i = 1; i < points.length - 1; i += 1) {
		points[i].hIn.y = 0;
		points[i].hOut.y = 0;
	}

	// Cap the endpoint handle y-offsets. The first and last points are not
	// extrema, so the unconstrained least-squares fit on their adjacent
	// segments can push hOut.y / hIn.y to values well outside the unit
	// square (e.g. ~0.7 for bounce, ~1.4 for elastic at handle (1, 0)). The
	// editor renders handles with worldToScreen at the canvas zoom (which
	// fits the unit square inside a ~40px margin), so even a cap of 0.3
	// draws the handle ~96px off-point — outside the unit square and into
	// the margin, which the user reads as "the handle flies off-canvas".
	// Clamping to 0.05 keeps the on-canvas handle inside the chart margin
	// (≤16px off-point at typical zoom) while still letting the bezier
	// carry a small ease slope at the segment ends.
	const ENDPOINT_HANDLE_Y_CAP = 0.05;
	points[0].hOut.y = clamp(
		points[0].hOut.y,
		-ENDPOINT_HANDLE_Y_CAP,
		ENDPOINT_HANDLE_Y_CAP,
	);
	points[points.length - 1].hIn.y = clamp(
		points[points.length - 1].hIn.y,
		-ENDPOINT_HANDLE_Y_CAP,
		ENDPOINT_HANDLE_Y_CAP,
	);

	return points;
};
