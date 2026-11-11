export const formatDuration = (seconds: number, frameRate: number): string => {
	const frames = Math.floor(seconds * frameRate);
	const secs = Math.floor(frames / frameRate);
	const framesRemainder = Math.round(frames % frameRate);
	const mins = Math.floor(secs / 60);
	const secsRemainder = secs % 60;
	return `${String(mins).padStart(2, "0")}:${String(secsRemainder).padStart(2, "0")}:${String(framesRemainder).padStart(2, "0")}`;
};

export const formatFrameRate = (
	frameRate: number,
	dropFrame: boolean,
): string => `${frameRate.toFixed(2)}${dropFrame ? " DF" : ""}`;

export const rgbToHex = (rgb: [number, number, number]): string => {
	const toHex = (n: number) => {
		const hex = Math.round(n * 255).toString(16);
		return hex.length === 1 ? `0${hex}` : hex;
	};
	return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
};
