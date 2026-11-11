import type { CompInfo } from "@/management/workspace/surface/contract";

export type { ActiveItemJson } from "@/management/workspace/extendscript/ae-text-layer-scripts.ext";
export {
	ACTIVE_COMP_INFO,
	ACTIVE_ITEM_SUMMARY,
	ALIGN_CENTER,
	ALIGN_LEFT,
	ALIGN_RIGHT,
	buildFontSizeDeltaScript,
	TOGGLE_ALL_CAPS,
	TOGGLE_FAUX_BOLD,
	TOGGLE_FAUX_ITALIC,
} from "@/management/workspace/extendscript/ae-text-layer-scripts.ext";

/** Font names are alphanumeric / space / partial symbols only */
export const isSafeAeFontFamily = (s: string): boolean =>
	/^[\w\s.,\-']{1,120}$/.test(s);

const isRgbTuple = (v: unknown): v is [number, number, number] =>
	Array.isArray(v) &&
	v.length === 3 &&
	typeof v[0] === "number" &&
	typeof v[1] === "number" &&
	typeof v[2] === "number";

/** Validates and parses return value of `ACTIVE_COMP_INFO` */
export const parseAeCompInfoJson = (
	raw: string,
): { data: CompInfo | null; error: string | null } => {
	try {
		const o = JSON.parse(raw) as unknown;
		if (!o || typeof o !== "object") {
			return { data: null, error: "Invalid response format" };
		}
		const rec = o as Record<string, unknown>;
		if (typeof rec.error === "string") {
			return { data: null, error: rec.error };
		}
		const d = rec.data;
		if (!d || typeof d !== "object" || Array.isArray(d)) {
			return { data: null, error: "Invalid response format" };
		}
		const x = d as Record<string, unknown>;
		if (typeof x.name !== "string") {
			return { data: null, error: "Invalid response format" };
		}
		const nums = [
			"width",
			"height",
			"pixelAspect",
			"duration",
			"frameRate",
			"layers",
			"selectedLayers",
			"shutterAngle",
			"shutterPhase",
		] as const;
		for (const k of nums) {
			if (typeof x[k] !== "number") {
				return { data: null, error: "Invalid response format" };
			}
		}
		if (typeof x.dropFrame !== "boolean" || typeof x.motionBlur !== "boolean") {
			return { data: null, error: "Invalid response format" };
		}
		if (typeof x.draft3d !== "boolean") {
			return { data: null, error: "Invalid response format" };
		}
		let bg: [number, number, number] | null = null;
		if (x.bgColor !== null && x.bgColor !== undefined) {
			if (!isRgbTuple(x.bgColor)) {
				return { data: null, error: "Invalid response format" };
			}
			bg = x.bgColor;
		}
		const data: CompInfo = {
			name: x.name,
			width: x.width as number,
			height: x.height as number,
			pixelAspect: x.pixelAspect as number,
			duration: x.duration as number,
			frameRate: x.frameRate as number,
			dropFrame: x.dropFrame as boolean,
			bgColor: bg,
			layers: x.layers as number,
			selectedLayers: x.selectedLayers as number,
			shutterAngle: x.shutterAngle as number,
			shutterPhase: x.shutterPhase as number,
			motionBlur: x.motionBlur as boolean,
			draft3d: x.draft3d as boolean,
		};
		return { data, error: null };
	} catch {
		return { data: null, error: "Failed to parse response" };
	}
};
