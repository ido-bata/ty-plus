import {
	EASING_CURVE_COLOR_DEFAULTS,
	EASING_CURVE_COLOR_ROWS,
} from "./literals/easing-color-catalog";
import { DEFAULT_EASING_LABEL_PREFERENCES_JSON } from "./literals/easing-label-preferences";

type WorkspaceLabelPreference = {
	val: string;
	name: string;
};

export type WorkspaceLabelPreferences = Record<
	number,
	WorkspaceLabelPreference
>;

export const DEFAULT_EASING_CURVE_COLORS = EASING_CURVE_COLOR_DEFAULTS;

export const EASING_COLOR_SETTING_ROWS = EASING_CURVE_COLOR_ROWS;

const parseJson = <T>(value: string): T | null => {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
};

export const readWorkspaceLabelPreferences = (
	input: unknown,
): WorkspaceLabelPreferences => {
	if (!input) {
		return (
			parseJson<WorkspaceLabelPreferences>(
				DEFAULT_EASING_LABEL_PREFERENCES_JSON,
			) ?? {}
		);
	}
	if (typeof input === "string") {
		return parseJson<WorkspaceLabelPreferences>(input) ?? {};
	}
	if (typeof input === "object") {
		return Object.entries(
			input as Record<string, unknown>,
		).reduce<WorkspaceLabelPreferences>((accumulator, [key, value]) => {
			if (
				value &&
				typeof value === "object" &&
				typeof (value as Record<string, unknown>).val === "string" &&
				typeof (value as Record<string, unknown>).name === "string"
			) {
				const index = Number(key);
				if (Number.isFinite(index)) {
					accumulator[index] = {
						val: (value as Record<string, string>).val,
						name: (value as Record<string, string>).name,
					};
				}
			}
			return accumulator;
		}, {});
	}
	return {};
};

export const DEFAULT_EASING_LABEL_PREFERENCES = readWorkspaceLabelPreferences(
	DEFAULT_EASING_LABEL_PREFERENCES_JSON,
);

export const getCurveCategory = (
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): string => {
	const tolerance = 0.05;
	if (Math.abs(y1 - x1) < tolerance && Math.abs(y2 - x2) < tolerance) {
		return "linear";
	}
	if (Math.abs(y1) < tolerance && Math.abs(y2) < tolerance) {
		return "hold";
	}
	if (y1 > 1.1 || y1 < -0.1 || y2 > 1.1 || y2 < -0.1) {
		return "overshoot";
	}
	const intensity = Math.abs(y1 - x1) + Math.abs(y2 - x2);
	const isSharp = intensity > 0.5;
	if (Math.abs(y1) < tolerance && Math.abs(y2 - x2) < tolerance * 3) {
		return isSharp ? "easeInSharp" : "easeInGentle";
	}
	if (Math.abs(y1 - x1) < tolerance * 3 && Math.abs(1 - y2) < tolerance) {
		return isSharp ? "easeOutSharp" : "easeOutGentle";
	}
	if (Math.abs(y1) < tolerance && Math.abs(1 - y2) < tolerance) {
		return "easeInOut";
	}
	return "bezier";
};

export const getEasingLabelColor = (
	curve: { x1: number; y1: number; x2: number; y2: number },
	customColors: Record<string, number>,
): number => {
	const category = getCurveCategory(curve.x1, curve.y1, curve.x2, curve.y2);
	const value =
		customColors[category] ?? DEFAULT_EASING_CURVE_COLORS[category] ?? 0;
	return Math.max(0, Math.round(value));
};
