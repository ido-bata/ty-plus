/**
 * Canonical easing curve → workspace label color index mapping and row labels.
 * Consumed by workspace persistence (`easing-colors`) and the easing widget editor.
 */

export const EASING_CURVE_COLOR_DEFAULTS: Record<string, number> = {
	linear: 8,
	hold: 12,
	easeInGentle: 9,
	easeInSharp: 16,
	easeOutGentle: 11,
	easeOutSharp: 1,
	easeInOut: 10,
	overshoot: 4,
	bezier: 3,
};

export const EASING_CURVE_COLOR_ROWS = [
	{ key: "linear", label: "Linear" },
	{ key: "hold", label: "Hold" },
	{ key: "easeInGentle", label: "Ease In" },
	{ key: "easeInSharp", label: "In (Sharp)" },
	{ key: "easeOutGentle", label: "Ease Out" },
	{ key: "easeOutSharp", label: "Out (Sharp)" },
	{ key: "easeInOut", label: "In-Out" },
	{ key: "overshoot", label: "Overshoot" },
	{ key: "bezier", label: "Bezier" },
] as const;

export type EasingCurveColorRowKey =
	(typeof EASING_CURVE_COLOR_ROWS)[number]["key"];
