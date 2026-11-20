import { type Camera, worldToScreen } from "./camera";
import {
	buildCyclicWave,
	type CyclicWaveParams,
	chordValue,
	cycleBoundaries,
	type WaveHandle,
	type WavePoint,
	waveHandlePositions,
} from "./cyclic-wave";

export type WaveDrawColors = {
	text: string;
	muted: string;
	accent: string;
	grid: string;
};

const drawDot = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	color: string,
): void => {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fill();
};

/**
 * Draw the cyclic wave: the repeated waveform, the cycle boundaries, the
 * editable template (first cycle) and the three parameter handles.
 */
export const drawCyclicWave = (
	ctx: CanvasRenderingContext2D,
	template: WavePoint[],
	params: CyclicWaveParams,
	camera: Camera,
	colors: WaveDrawColors,
	selected: WaveHandle | null,
): void => {
	const wave = buildCyclicWave(template, params);
	ctx.strokeStyle = colors.text;
	ctx.lineWidth = 2;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.beginPath();
	wave.forEach((point, index) => {
		const screen = worldToScreen(point, camera);
		if (index === 0) ctx.moveTo(screen.x, screen.y);
		else ctx.lineTo(screen.x, screen.y);
	});
	ctx.stroke();

	ctx.strokeStyle = colors.grid;
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (const x of cycleBoundaries(params.cycles)) {
		const top = worldToScreen({ x, y: 1 }, camera);
		const bottom = worldToScreen({ x, y: 0 }, camera);
		ctx.moveTo(top.x, top.y);
		ctx.lineTo(bottom.x, bottom.y);
	}
	ctx.stroke();

	const share = 0.5 + params.bias / 2;
	const scale = share / Math.max(1, Math.round(params.cycles));
	ctx.strokeStyle = colors.muted;
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (const point of template) {
		const chord = chordValue(template, point.x);
		const deviation = (point.y - chord) * params.amplitude;
		const screen = worldToScreen(
			{ x: point.x * scale, y: chord + deviation },
			camera,
		);
		drawDot(ctx, screen.x, screen.y, 4, colors.text);
	}
	ctx.stroke();

	const handles = waveHandlePositions(template, params);
	for (const key of Object.keys(handles) as WaveHandle[]) {
		const position = handles[key];
		const screen = worldToScreen(position, camera);
		const active = key === selected;
		drawDot(
			ctx,
			screen.x,
			screen.y,
			active ? 6 : 4,
			active ? colors.accent : colors.muted,
		);
	}
};
