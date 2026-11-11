import type {
	Background,
	Layer,
	LayerType,
	PatternValue,
} from "@/management/workspace/background/contract";

export const DEFAULT_COLOR = "#1e1e1e";
const DEFAULT_PATTERN_COLOR = "#444444";
export const PRESET_COLORS = [
	"#1e1e1e",
	"#0d1117",
	"#1a1a2e",
	"#16213e",
	"#0f3460",
	"#2d2d2d",
	"#3c3c3c",
	"#252525",
	"#1b1b2f",
	"#162447",
];
const PATTERNS: readonly PatternValue[] = ["dots", "grid", "lines"];

function createNewLayer(type: LayerType): Layer {
	return {
		id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		type,
		enabled: true,
		opacity: 100,
		color: type === "color" ? DEFAULT_COLOR : undefined,
		colorOpacity: 100,
		imagePath: undefined,
		imageSource: type === "image" ? "file" : undefined,
		imageFit: type === "image" ? "cover" : undefined,
		imageRepeat: type === "image" ? "no-repeat" : undefined,
		imageScale: 100,
		imageShiftX: 0,
		imageShiftY: 0,
		patternType: type === "pattern" ? "dots" : undefined,
		patternColor: type === "pattern" ? DEFAULT_PATTERN_COLOR : undefined,
		patternColorOpacity: 100,
		patternBgColor: type === "pattern" ? "transparent" : undefined,
		patternBgOpacity: 100,
		patternSize: type === "pattern" ? 6 : undefined,
	};
}

function migrateToLayers(bg: Background | null): Layer[] {
	if (!bg) {
		return [createNewLayer("color")];
	}
	if (bg.layers?.length) {
		return bg.layers;
	}
	if (bg.type === "color" && bg.value) {
		return [
			{
				...createNewLayer("color"),
				id: "legacy-color",
				color: bg.value,
			},
		];
	}
	if (bg.type === "image" && bg.path) {
		return [
			{
				...createNewLayer("image"),
				id: "legacy-image",
				imagePath: bg.path,
				imageSource: bg.source ?? "file",
			},
		];
	}
	if (bg.type === "pattern" && bg.value) {
		return [
			{
				...createNewLayer("pattern"),
				id: "legacy-pattern",
				patternType: PATTERNS.includes(bg.value as PatternValue)
					? (bg.value as PatternValue)
					: "dots",
				patternColor: bg.patternColor ?? DEFAULT_PATTERN_COLOR,
				patternBgColor: bg.backgroundColor ?? "transparent",
			},
		];
	}
	return [createNewLayer("color")];
}

export function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function isUrlImagePath(value: string): boolean {
	return /^(https?:|data:image\/)/i.test(value.trim());
}
