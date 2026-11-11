/**
 * Workspace grid background (equivalent to archive `background-panel` layer composition).
 * Only JSON-compatible shape shared via CEP panel persistence / APPLICATION bus is defined.
 */

export type LayerType = "color" | "image" | "pattern";

export type PatternValue = "dots" | "grid" | "lines";
export type ImageFitValue = "cover" | "contain" | "stretch" | "auto";
export type ImageRepeatValue = "no-repeat" | "repeat" | "repeat-x" | "repeat-y";

export type Layer = {
	id: string;
	type: LayerType;
	enabled: boolean;
	opacity: number;
	color?: string;
	colorOpacity?: number;
	imagePath?: string;
	imageSource?: "file" | "url";
	imageFit?: ImageFitValue;
	imageRepeat?: ImageRepeatValue;
	imageScale?: number;
	imageShiftX?: number;
	imageShiftY?: number;
	patternType?: PatternValue;
	patternColor?: string;
	patternColorOpacity?: number;
	patternBgColor?: string;
	patternBgOpacity?: number;
	patternSize?: number;
};

/** Includes legacy single-background migration compat fields */
export type Background = {
	type?: "color" | "image" | "pattern";
	value?: string;
	path?: string;
	source?: "file" | "url";
	patternColor?: string;
	backgroundColor?: string;
	layers?: Layer[];
};
