/**
 * Contract test: the AE host's loop replication must produce the same
 * waveform as the widget's canonical model.
 *
 * The host implementation is ExtendScript (host-bundle.ext.ts); this test
 * mirrors that rule and compares it with `buildCyclicWave`.
 */

import { describe, expect, it } from "vitest";
import {
	buildCyclicWave,
	type CyclicWaveParams,
	type WavePoint,
} from "@/function/widget/core/loop/cyclic-wave";

type Row = number[];

/** Mirror of the host's buildLoopReplicatedPoints (ExtendScript). */
const hostReplicate = (
	template: Row[],
	loopCount: number,
	wave: CyclicWaveParams,
): Row[] => {
	const cycles = Math.max(1, Math.round(loopCount));
	const amplitude = wave.amplitude;
	const damping = wave.damping;
	const bias = wave.bias;
	const oneWay = wave.mode === "cycle";
	const share = Math.max(0.05, Math.min(0.95, 0.5 + bias / 2));
	const first = template[0];
	const lastPoint = template[template.length - 1];
	const span = lastPoint[0] - first[0];
	const chordAt = (x: number): number => {
		if (Math.abs(span) < 1e-9) return first[1];
		const ratio = Math.max(0, Math.min(1, (x - first[0]) / span));
		return first[1] + (lastPoint[1] - first[1]) * ratio;
	};
	const out: Row[] = [];
	for (let i = 0; i < cycles; i += 1) {
		const decay = damping ** i;
		const hasReturn = !oneWay && i < cycles - 1;
		const leg = hasReturn ? share : 1;
		for (let j = 0; j < template.length; j += 1) {
			const pnt = template[j];
			const chord = chordAt(pnt[0]);
			const deviation = (pnt[1] - chord) * amplitude * decay;
			const isOuterStart = i === 0 && j === 0;
			const isOuterEnd = i === cycles - 1 && j === template.length - 1;
			if (!isOuterStart && !isOuterEnd) {
				out.push([
					(i + pnt[0] * leg) / cycles,
					chord + deviation,
					pnt[2],
					pnt[3],
					pnt[4],
					pnt[5],
				]);
			}
			if (!hasReturn) continue;
			const back = template[template.length - 1 - j];
			const backChord = chordAt(back[0]);
			const backDeviation = (back[1] - backChord) * amplitude * decay;
			out.push([
				(i + share + (1 - back[0]) * (1 - share)) / cycles,
				backChord - backDeviation,
				back[4],
				-back[5],
				back[2],
				-back[3],
			]);
		}
	}
	out.sort((a, b) => a[0] - b[0]);
	return out;
};

const template: WavePoint[] = [
	{ x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0.2, y: 0.2 } },
	{ x: 0.5, y: 0.9, hIn: { x: -0.2, y: 0.2 }, hOut: { x: 0.2, y: 0.2 } },
	{ x: 1, y: 1, hIn: { x: -0.2, y: 0.2 }, hOut: { x: 0, y: 0 } },
];

const toRows = (points: WavePoint[]): Row[] =>
	points.map((p) => [p.x, p.y, p.hIn.x, p.hIn.y, p.hOut.x, p.hOut.y]);

const params = (over: Partial<CyclicWaveParams> = {}): CyclicWaveParams => ({
	cycles: 3,
	amplitude: 1,
	damping: 1,
	bias: 0,
	mode: "pingpong",
	...over,
});

/** The model wave without the segment's outer endpoints (they are keys). */
const modelInner = (wave: CyclicWaveParams): WavePoint[] =>
	buildCyclicWave(template, wave).filter(
		(p) => Math.abs(p.x) > 1e-9 && Math.abs(p.x - 1) > 1e-9,
	);

const compare = (wave: CyclicWaveParams): void => {
	const host = hostReplicate(toRows(template), wave.cycles, wave);
	const model = modelInner(wave);
	expect(host.length).toBe(model.length);
	for (const row of host) {
		const match = model.find(
			(p) => Math.abs(p.x - row[0]) < 1e-6 && Math.abs(p.y - row[1]) < 1e-6,
		);
		expect(match, `no model point for host row ${row.join(",")}`).toBeDefined();
	}
};

describe("loop replication contract", () => {
	it("matches the canonical model for the ping-pong wave", () => {
		compare(params());
	});

	it("matches the canonical model with damping and bias", () => {
		compare(params({ damping: 0.6, bias: 0.5 }));
	});

	it("matches the canonical model for the one-way repeat", () => {
		compare(params({ mode: "cycle" }));
	});
});
