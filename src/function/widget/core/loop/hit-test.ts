/**
 * Hit testing for the loop wave editor canvas.
 *
 * Maps a screen position to the draggable target under the pointer:
 * a wave parameter handle, a template control point / bezier handle, or the
 * background (pan / scrub).
 */

import {
	attackShare,
	type CyclicWaveParams,
	chordValue,
	type WaveHandle,
	type WavePoint,
	waveHandlePositions,
} from "@/function/widget/core/loop/cyclic-wave";
import { timeToScreen, valueToScreen, type WaveCamera } from "./wave-camera";

export type DragTarget =
	| { kind: "wave-handle"; handle: WaveHandle }
	| { kind: "template-point"; index: number }
	| { kind: "template-handle"; index: number; side: "hIn" | "hOut" }
	| { kind: "pan" };

const HANDLE_HIT_PX = 12;

export function hitTestWave(
	screenX: number,
	screenY: number,
	camera: WaveCamera,
	template: WavePoint[],
	wave: CyclicWaveParams,
): DragTarget {
	const handles = waveHandlePositions(template, wave);
	for (const key of Object.keys(handles) as WaveHandle[]) {
		const position = handles[key];
		const x = timeToScreen(position.x, camera);
		const y = valueToScreen(position.y, camera);
		if (Math.hypot(x - screenX, y - screenY) <= HANDLE_HIT_PX) {
			return { kind: "wave-handle", handle: key };
		}
	}
	// The template's control points and handles (edit cycle only).
	const legScale = Math.max(1e-6, attackShare(wave.bias) / wave.cycles);
	for (let index = 0; index < template.length; index += 1) {
		const point = template[index];
		const px = timeToScreen(point.x * legScale, camera);
		const py = valueToScreen(chordValue(template, point.x), camera);
		if (Math.hypot(px - screenX, py - screenY) <= HANDLE_HIT_PX) {
			return { kind: "template-point", index };
		}
		for (const side of ["hIn", "hOut"] as const) {
			const handle = point[side];
			const hx = timeToScreen(point.x * legScale + handle.x * legScale, camera);
			const hy = valueToScreen(
				chordValue(template, point.x) + handle.y,
				camera,
			);
			if (Math.hypot(hx - screenX, hy - screenY) <= HANDLE_HIT_PX) {
				return { kind: "template-handle", index, side };
			}
		}
	}
	return { kind: "pan" };
}
