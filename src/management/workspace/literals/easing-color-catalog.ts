/**
 * Canonical easing curve → workspace label color index mapping and row labels.
 * Consumed by workspace persistence (`easing-colors`) and the easing widget editor.
 *
 * `label` is a lazy getter (not a module-level `i18n.t` call): the catalog is
 * imported before i18n finishes initializing, and consumers read `.label` at
 * menu/render time when the active locale is already known.
 */

import { i18n } from "@/management/i18n/index";

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

export type EasingCurveColorRowKey =
	| "linear"
	| "hold"
	| "easeInGentle"
	| "easeInSharp"
	| "easeOutGentle"
	| "easeOutSharp"
	| "easeInOut"
	| "overshoot"
	| "bezier";

type EasingCurveColorRow = {
	key: EasingCurveColorRowKey;
	label: string;
};

const easingCurveLabel = (key: EasingCurveColorRowKey, fallback: string) =>
	i18n.t(`workspace:easingCurveColors.${key}`, { defaultValue: fallback });

export const EASING_CURVE_COLOR_ROWS: readonly EasingCurveColorRow[] = [
	{
		key: "linear",
		get label() {
			return easingCurveLabel("linear", "Linear");
		},
	},
	{
		key: "hold",
		get label() {
			return easingCurveLabel("hold", "Hold");
		},
	},
	{
		key: "easeInGentle",
		get label() {
			return easingCurveLabel("easeInGentle", "Ease In");
		},
	},
	{
		key: "easeInSharp",
		get label() {
			return easingCurveLabel("easeInSharp", "In (Sharp)");
		},
	},
	{
		key: "easeOutGentle",
		get label() {
			return easingCurveLabel("easeOutGentle", "Ease Out");
		},
	},
	{
		key: "easeOutSharp",
		get label() {
			return easingCurveLabel("easeOutSharp", "Out (Sharp)");
		},
	},
	{
		key: "easeInOut",
		get label() {
			return easingCurveLabel("easeInOut", "In-Out");
		},
	},
	{
		key: "overshoot",
		get label() {
			return easingCurveLabel("overshoot", "Overshoot");
		},
	},
	{
		key: "bezier",
		get label() {
			return easingCurveLabel("bezier", "Bezier");
		},
	},
];
