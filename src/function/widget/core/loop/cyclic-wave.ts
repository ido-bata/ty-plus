/**
 * Cyclic wave model shared by the Loop widget (rendering) and the AE host
 * (application). The replication rule here is canonical; see
 * `docs/architecture/widget/loop.md`.
 *
 * Model (Alight Motion "Cyclic" semantics):
 * - the template is ONE attack leg (the value curve from the segment start
 *   to the segment end);
 * - `cycles`  = frequency (cycles across the segment);
 * - `amplitude` = deviation from the chord;
 * - `damping` = settle toward the target;
 * - `bias` = share of each cycle spent on the attack (0.5 = symmetric);
 * - `mode` = "pingpong" (attack + mirrored return, the default) or "cycle"
 *   (one-way repeat).
 */

type LoopMode = "pingpong" | "cycle";

export type WavePoint = {
	x: number;
	y: number;
	hIn: { x: number; y: number };
	hOut: { x: number; y: number };
};

export type CyclicWaveParams = {
	/** Cycles across the edited segment (2..16). */
	cycles: number;
	/** Deviation from the chord, relative to the template (0 = straight). */
	amplitude: number;
	/** Per-cycle decay of the deviation; 1 keeps it constant. */
	damping: number;
	/** Attack share of one cycle (0.5 = symmetric attack and return). */
	bias: number;
	/** Repetition style. */
	mode: LoopMode;
};

const MIN_CYCLES = 2;
const MAX_CYCLES = 16;
export const DEFAULT_CYCLES = 3;

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

/** Share of one cycle spent on the attack leg (0.5 = symmetric). */
export const attackShare = (bias: number): number =>
	clamp(0.5 + bias / 2, 0.05, 0.95);

/** Decay factor of the given cycle. */
const cycleDecay = (index: number, damping: number): number => damping ** index;

/** Normalized x positions of the cycle boundaries (0..1). */
export const cycleBoundaries = (cycles: number): number[] => {
	const count = Math.max(1, Math.round(cycles));
	const out: number[] = [];
	for (let i = 0; i <= count; i += 1) out.push(i / count);
	return out;
};

/** Linear chord value of the template at `x`. */
export const chordValue = (template: WavePoint[], x: number): number => {
	if (template.length === 0) return x;
	const first = template[0];
	const last = template[template.length - 1];
	const span = last.x - first.x;
	if (Math.abs(span) < 1e-9) return first.y;
	const ratio = clamp((x - first.x) / span, 0, 1);
	return first.y + (last.y - first.y) * ratio;
};

/**
 * Replicate the single-cycle template into the full wave.
 *
 * Canonical rule (docs/architecture/widget/loop.md):
 * - the deviation from the template's chord is scaled by amplitude and decays
 *   per cycle, so the outer keyframe values stay untouched;
 * - handles are scaled in BOTH axes, so every leg keeps the slope ratio
 *   (and therefore the shape) of the template;
 * - "pingpong" appends a mirrored return leg to every cycle.
 */
export const buildCyclicWave = (
	template: WavePoint[],
	params: CyclicWaveParams,
): WavePoint[] => {
	const cycles = Math.max(1, Math.round(params.cycles));
	const share = attackShare(params.bias);
	const out: WavePoint[] = [];
	const deviationOf = (point: WavePoint, decay: number): number =>
		(point.y - chordValue(template, point.x)) * params.amplitude * decay;
	const pushAttack = (start: number, end: number, decay: number): void => {
		const span = end - start;
		if (span <= 0) return;
		for (const point of template) {
			out.push({
				x: start + point.x * span,
				y: chordValue(template, point.x) + deviationOf(point, decay),
				hIn: { x: point.hIn.x * span, y: point.hIn.y * span },
				hOut: { x: point.hOut.x * span, y: point.hOut.y * span },
			});
		}
	};
	const pushReturn = (start: number, end: number, decay: number): void => {
		const span = end - start;
		if (span <= 0) return;
		for (const point of [...template].reverse()) {
			out.push({
				x: start + point.x * span,
				y: chordValue(template, point.x) - deviationOf(point, decay),
				hIn: { x: point.hOut.x * span, y: -point.hOut.y * span },
				hOut: { x: point.hIn.x * span, y: -point.hIn.y * span },
			});
		}
	};
	for (let i = 0; i < cycles; i += 1) {
		const decay = cycleDecay(i, params.damping);
		const cycleStart = i / cycles;
		const isLast = i === cycles - 1;
		if (params.mode === "pingpong" && !isLast) {
			const attackEnd = cycleStart + share / cycles;
			pushAttack(cycleStart, attackEnd, decay);
			pushReturn(attackEnd, (i + 1) / cycles, decay);
			continue;
		}
		pushAttack(cycleStart, isLast ? 1 : (i + 1) / cycles, decay);
	}
	return out.sort((a, b) => a.x - b.x);
};

/** Piecewise-linear value of a generated wave at the normalized time `t`. */
export const sampleWave = (wave: WavePoint[], t: number): number => {
	if (wave.length === 0) return 0;
	const time = clamp(t, 0, 1);
	if (time <= wave[0].x) return wave[0].y;
	const last = wave[wave.length - 1];
	if (time >= last.x) return last.y;
	for (let i = 0; i < wave.length - 1; i += 1) {
		const a = wave[i];
		const b = wave[i + 1];
		if (time < a.x || time > b.x) continue;
		const span = b.x - a.x;
		const ratio = span <= 0 ? 0 : (time - a.x) / span;
		return a.y + (b.y - a.y) * ratio;
	}
	return last.y;
};

/** The template point that deviates most from the chord (the wave's bulge). */
const waveBulge = (
	template: WavePoint[],
): { phase: number; deviation: number } => {
	let best = { phase: 0.5, deviation: 0 };
	for (const point of template) {
		const deviation = point.y - chordValue(template, point.x);
		if (Math.abs(deviation) > Math.abs(best.deviation)) {
			best = { phase: point.x, deviation };
		}
	}
	return best;
};

export type WaveHandle = "frequency" | "bias" | "damping";

export type NormalizedPoint = { x: number; y: number };

/**
 * Normalized positions of the loop editor's parameter handles.
 *
 * - frequency: the first cycle boundary (its width is the period)
 * - bias: the end of the first attack leg (the attack/return split)
 * - damping: the bulge of the last cycle (how much is left at the end)
 */
export const waveHandlePositions = (
	template: WavePoint[],
	params: CyclicWaveParams,
): Record<WaveHandle, NormalizedPoint> => {
	const cycles = Math.max(1, Math.round(params.cycles));
	const share = attackShare(params.bias);
	const bulge = waveBulge(template);
	const decay = cycleDecay(cycles - 1, params.damping);
	return {
		frequency: { x: 1 / cycles, y: 0 },
		bias: { x: share / cycles, y: chordValue(template, 1) },
		damping: {
			x: (cycles - 1) / cycles + bulge.phase * ((1 - share) / cycles),
			y:
				chordValue(template, bulge.phase) +
				bulge.deviation * params.amplitude * decay,
		},
	};
};

/**
 * Resolve a handle drag into updated wave parameters.
 *
 * The handle drag works on normalized graph coordinates; the inverse mapping
 * keeps the graph and the parameters in sync (the graph IS the parameter
 * readout - there is no separate numeric form).
 */
export const applyWaveHandleDrag = (
	handle: WaveHandle,
	world: NormalizedPoint,
	template: WavePoint[],
	params: CyclicWaveParams,
): CyclicWaveParams => {
	if (handle === "frequency") {
		const cycles = Math.round(1 / Math.max(0.02, world.x));
		return { ...params, cycles: clamp(cycles, MIN_CYCLES, MAX_CYCLES) };
	}
	if (handle === "bias") {
		const cycles = Math.max(1, Math.round(params.cycles));
		const share = clamp(world.x * cycles, 0.05, 0.95);
		return { ...params, bias: share * 2 - 1 };
	}
	const bulge = waveBulge(template);
	const base = chordValue(template, bulge.phase);
	const span = bulge.deviation * params.amplitude;
	if (Math.abs(span) < 1e-6) return params;
	const damping = clamp((world.y - base) / span, 0, 1);
	return { ...params, damping };
};
