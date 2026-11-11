import type {
	Background,
	ImageFitValue,
	ImageRepeatValue,
	Layer,
	LayerType,
	PatternValue,
} from "@/management/workspace/background/contract";

const isPattern = (x: unknown): x is PatternValue =>
	x === "dots" || x === "grid" || x === "lines";

const isLayerType = (x: unknown): x is LayerType =>
	x === "color" || x === "image" || x === "pattern";

const isImageFit = (x: unknown): x is ImageFitValue =>
	x === "cover" || x === "contain" || x === "stretch" || x === "auto";

const isImageRepeat = (x: unknown): x is ImageRepeatValue =>
	x === "no-repeat" || x === "repeat" || x === "repeat-x" || x === "repeat-y";

/**
 * Allow-list for `imageSource: "url"`. `javascript:`, `data:text/html`, and
 * other schemes are rejected so the resulting URL cannot be evaluated as
 * script when injected into a CSS `url(...)` value.
 */
const isSafeUrlScheme = (value: string): boolean => {
	const trimmed = value.trim();
	if (!trimmed) return false;
	const lower = trimmed.toLowerCase();
	if (lower.startsWith("https://")) return true;
	if (lower.startsWith("data:image/")) return true;
	return false;
};

function parseLayer(raw: unknown): Layer | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	if (typeof o.id !== "string" || !o.id.trim()) {
		return null;
	}
	if (!isLayerType(o.type)) {
		return null;
	}
	if (typeof o.enabled !== "boolean") {
		return null;
	}
	if (typeof o.opacity !== "number" || Number.isNaN(o.opacity)) {
		return null;
	}

	const base: Layer = {
		id: o.id.trim(),
		type: o.type,
		enabled: o.enabled,
		opacity: o.opacity,
	};

	if (typeof o.color === "string") {
		base.color = o.color;
	}
	if (typeof o.colorOpacity === "number" && !Number.isNaN(o.colorOpacity)) {
		base.colorOpacity = o.colorOpacity;
	}
	if (typeof o.imagePath === "string") {
		base.imagePath = o.imagePath;
	}
	if (o.imageSource === "file") {
		base.imageSource = o.imageSource;
	} else if (o.imageSource === "url" && typeof o.imagePath === "string") {
		// Only allow https: and data:image/ URLs so a crafted background JSON
		// cannot inject `javascript:` or other dangerous schemes into the
		// resulting CSS `url(...)` value.
		if (isSafeUrlScheme(o.imagePath)) {
			base.imageSource = "url";
		}
	}
	if (isImageFit(o.imageFit)) {
		base.imageFit = o.imageFit;
	}
	if (isImageRepeat(o.imageRepeat)) {
		base.imageRepeat = o.imageRepeat;
	}
	if (typeof o.imageScale === "number" && !Number.isNaN(o.imageScale)) {
		base.imageScale = o.imageScale;
	}
	if (typeof o.imageShiftX === "number" && !Number.isNaN(o.imageShiftX)) {
		base.imageShiftX = o.imageShiftX;
	}
	if (typeof o.imageShiftY === "number" && !Number.isNaN(o.imageShiftY)) {
		base.imageShiftY = o.imageShiftY;
	}
	if (isPattern(o.patternType)) {
		base.patternType = o.patternType;
	}
	if (typeof o.patternColor === "string") {
		base.patternColor = o.patternColor;
	}
	if (
		typeof o.patternColorOpacity === "number" &&
		!Number.isNaN(o.patternColorOpacity)
	) {
		base.patternColorOpacity = o.patternColorOpacity;
	}
	if (typeof o.patternBgColor === "string") {
		base.patternBgColor = o.patternBgColor;
	}
	if (
		typeof o.patternBgOpacity === "number" &&
		!Number.isNaN(o.patternBgOpacity)
	) {
		base.patternBgOpacity = o.patternBgOpacity;
	}
	if (typeof o.patternSize === "number" && !Number.isNaN(o.patternSize)) {
		base.patternSize = o.patternSize;
	}

	return base;
}

/** Loose restore from persisted state. Returns null on invalid input. */
export function parse(raw: unknown): Background | null {
	if (raw === null) {
		return null;
	}
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const out: Background = {};

	if (o.type === "color" || o.type === "image" || o.type === "pattern") {
		out.type = o.type;
	}
	if (typeof o.value === "string") {
		out.value = o.value;
	}
	if (typeof o.path === "string") {
		out.path = o.path;
	}
	if (o.source === "file") {
		out.source = o.source;
	} else if (o.source === "url" && typeof o.value === "string") {
		if (isSafeUrlScheme(o.value)) {
			out.source = "url";
		}
	}
	if (typeof o.patternColor === "string") {
		out.patternColor = o.patternColor;
	}
	if (typeof o.backgroundColor === "string") {
		out.backgroundColor = o.backgroundColor;
	}

	if (Array.isArray(o.layers)) {
		const layers = o.layers
			.map(parseLayer)
			.filter((x): x is Layer => Boolean(x));
		if (layers.length > 0) {
			out.layers = layers;
		}
	}

	if (Object.keys(out).length === 0) {
		return null;
	}
	if (
		!out.layers?.length &&
		!out.type &&
		!out.path &&
		!out.value &&
		out.backgroundColor === undefined &&
		out.patternColor === undefined
	) {
		return null;
	}

	return out;
}
