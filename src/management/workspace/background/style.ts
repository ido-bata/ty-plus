import type { CSSProperties } from "react";
import type {
	Background,
	Layer,
	PatternValue,
} from "@/management/workspace/background/contract";

/*
 * Fallback colours must be concrete hex, not `var(--color-ws-*)` references:
 * `hexToRgba` has to bake the layer opacity into an `rgba()` triplet, which
 * a `var()` cannot provide — the unresolved `var(--color-ws-transparent-rgb-*)`
 * fallback invalidated the whole `background-image` declaration and the
 * preview/grid rendered solid (issue #754). Values mirror the
 * `color-ws-*` tokens in `design-tokens-defaults.ts`.
 */
const DEFAULT_GRID_BG = "var(--color-ty-bg-surface)";
const BG_DEFAULT = "#1d1d1d";
const PATTERN_FG = "#383838";
const PATTERN_BG = "transparent";

function hexToRgba(hex: string, opacityPct: number): string {
	if (hex === "transparent") {
		return "var(--color-ws-transparent)";
	}
	const alpha = opacityPct / 100;
	let h = hex.startsWith("#") ? hex.slice(1) : hex;
	// `#rgb` shorthand expands to `#rrggbb` before parsing.
	if (h.length === 3) {
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	}
	const invalid = `rgba(0, 0, 0, ${alpha})`;
	if (h.length < 6) {
		return invalid;
	}
	const r = Number.parseInt(h.slice(0, 2), 16);
	const g = Number.parseInt(h.slice(2, 4), 16);
	const b = Number.parseInt(h.slice(4, 6), 16);
	if ([r, g, b].some((n) => Number.isNaN(n))) {
		return invalid;
	}
	return `rgba(${r},${g},${b},${alpha})`;
}

function filePathToCssUrl(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) {
		return "";
	}
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed;
	}
	const norm = trimmed.replace(/\\/g, "/");
	const prefix = /^[a-zA-Z]:\//.test(norm) ? "file:///" : "file://";
	return prefix + encodeURI(norm);
}

function layerToParts(layer: Layer): {
	image: string;
	size: string;
	position: string;
	repeat: string;
} | null {
	if (layer.type === "color") {
		const c = layer.color ?? BG_DEFAULT;
		const co = Math.max(0, Math.min(100, layer.colorOpacity ?? 100));
		const rgba = hexToRgba(c, (layer.opacity * co) / 100);
		return {
			image: `linear-gradient(${rgba},${rgba})`,
			size: "100% 100%",
			position: "0 0",
			repeat: "no-repeat",
		};
	}

	if (layer.type === "image") {
		const raw = layer.imagePath?.trim() ?? "";
		if (!raw) {
			return null;
		}
		const url =
			layer.imageSource === "url"
				? raw
				: filePathToCssUrl(raw).replaceAll('"', "%22");
		if (!url) {
			return null;
		}
		const scale = Math.max(1, Math.min(500, layer.imageScale ?? 100));
		const fit = layer.imageFit ?? "cover";
		const sx = layer.imageShiftX ?? 0;
		const sy = layer.imageShiftY ?? 0;
		const size =
			fit === "cover"
				? "cover"
				: fit === "contain"
					? "contain"
					: fit === "stretch"
						? "100% 100%"
						: `${scale}%`;
		return {
			image: `url("${url.replaceAll('"', "%22")}")`,
			size,
			position: `calc(50% + ${sx}px) calc(50% + ${sy}px)`,
			repeat: layer.imageRepeat ?? "no-repeat",
		};
	}

	if (layer.type === "pattern") {
		const pt: PatternValue = layer.patternType ?? "dots";
		const fg = layer.patternColor ?? PATTERN_FG;
		const pbg = layer.patternBgColor ?? PATTERN_BG;
		const po = Math.max(0, Math.min(100, layer.opacity));
		const fgo = Math.max(0, Math.min(100, layer.patternColorOpacity ?? 100));
		const bgo = Math.max(0, Math.min(100, layer.patternBgOpacity ?? 100));
		const patternSize = Math.max(2, Math.min(64, layer.patternSize ?? 6));
		const fgR = hexToRgba(fg, (po * fgo) / 100);
		const bgR =
			pbg === "transparent" ? PATTERN_BG : hexToRgba(pbg, (po * bgo) / 100);
		if (pt === "dots") {
			return {
				image: `radial-gradient(${fgR} 1px, transparent 1px), linear-gradient(${bgR},${bgR})`,
				size: `${patternSize}px ${patternSize}px, 100% 100%`,
				position: "0 0, 0 0",
				repeat: "repeat, no-repeat",
			};
		}
		if (pt === "grid") {
			return {
				image: `linear-gradient(${fgR} 1px, transparent 1px), linear-gradient(90deg, ${fgR} 1px, transparent 1px), linear-gradient(${bgR},${bgR})`,
				size: `${patternSize}px ${patternSize}px, ${patternSize}px ${patternSize}px, 100% 100%`,
				position: "0 0, 0 0, 0 0",
				repeat: "repeat, repeat, no-repeat",
			};
		}
		return {
			image: `repeating-linear-gradient(45deg, ${fgR} 0, ${fgR} 1px, transparent 0, transparent 50%), linear-gradient(${bgR},${bgR})`,
			size: `${patternSize}px ${patternSize}px, 100% 100%`,
			position: "0 0, 0 0",
			repeat: "repeat, no-repeat",
		};
	}

	return null;
}

/**
 * Background layered under the grid. Enabled layers are front-most (CSS background order).
 */
export function toStyle(bg: Background | null | undefined): CSSProperties {
	if (!bg?.layers?.length) {
		return { backgroundColor: DEFAULT_GRID_BG };
	}

	const enabled = bg.layers.filter((l: Layer) => l.enabled);
	if (enabled.length === 0) {
		return { backgroundColor: DEFAULT_GRID_BG };
	}

	const images: string[] = [];
	const sizes: string[] = [];
	const positions: string[] = [];
	const repeats: string[] = [];

	for (const layer of enabled) {
		const parts = layerToParts(layer);
		if (!parts) {
			continue;
		}
		images.push(parts.image);
		sizes.push(parts.size);
		positions.push(parts.position);
		repeats.push(parts.repeat);
	}

	if (images.length === 0) {
		return { backgroundColor: DEFAULT_GRID_BG };
	}

	return {
		backgroundColor: DEFAULT_GRID_BG,
		backgroundImage: images.join(", "),
		backgroundSize: sizes.join(", "),
		backgroundPosition: positions.join(", "),
		backgroundRepeat: repeats.join(", "),
	};
}
