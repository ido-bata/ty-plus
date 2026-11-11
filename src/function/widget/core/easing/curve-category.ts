/**
 * Bezier easing curve category detection and AE label color mapping.
 *
 * Restored from the legacy easing editor
 * (archive/rebuild-foundation-legacy-root/src/js/system/usecases/easing.ts).
 * The category classifies a `(x1, y1, x2, y2)` cubic bezier tuple so the AE
 * label color of the applied keyframes can match the curve shape (linear,
 * hold, ease-in/out, overshoot, …) — without forcing the user to pick a color
 * manually for every apply.
 */

export type CurveCategory =
	| "linear"
	| "hold"
	| "easeInGentle"
	| "easeInSharp"
	| "easeOutGentle"
	| "easeOutSharp"
	| "easeInOut"
	| "overshoot"
	| "bezier";

/** AE label color indices 1–16 (Default_CURVE_COLORS reference). */
export const DEFAULT_CURVE_COLORS: Record<CurveCategory, number> = {
	linear: 8, // Blue
	hold: 12, // Brown
	easeInGentle: 9, // Green
	easeInSharp: 16, // DarkGreen
	easeOutGentle: 11, // Orange
	easeOutSharp: 1, // Red
	easeInOut: 10, // Purple
	overshoot: 4, // Pink
	bezier: 3, // Aqua
};

export const detectCurveCategory = (
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): CurveCategory => {
	const tolerance = 0.05;

	// Linear: both handles on the diagonal (y = x)
	const isLinear =
		Math.abs(y1 - x1) < tolerance && Math.abs(y2 - x2) < tolerance;
	if (isLinear) return "linear";

	// Hold: both Y values near 0 (flat at start)
	if (Math.abs(y1) < tolerance && Math.abs(y2) < tolerance) {
		return "hold";
	}

	// Overshoot: Y values exceed the 0-1 range
	if (y1 > 1.1 || y1 < -0.1 || y2 > 1.1 || y2 < -0.1) {
		return "overshoot";
	}

	// Intensity based on how far handles are from linear
	const intensity = Math.abs(y1 - x1) + Math.abs(y2 - x2);
	const isSharp = intensity > 0.5;

	// Ease-In: starts slow (y1 near 0)
	if (Math.abs(y1) < tolerance && Math.abs(y2 - x2) < tolerance * 3) {
		return isSharp ? "easeInSharp" : "easeInGentle";
	}

	// Ease-Out: ends slow (y2 near 1)
	if (Math.abs(y1 - x1) < tolerance * 3 && Math.abs(1 - y2) < tolerance) {
		return isSharp ? "easeOutSharp" : "easeOutGentle";
	}

	// Ease-In-Out: starts slow (y1 near 0), ends slow (y2 near 1)
	if (Math.abs(y1) < tolerance && Math.abs(1 - y2) < tolerance) {
		return "easeInOut";
	}

	return "bezier";
};

export const getColorForCurveCategory = (
	category: CurveCategory,
	customColors?: Partial<Record<CurveCategory, number>>,
): number => {
	const custom = customColors?.[category];
	if (custom !== undefined) {
		return custom;
	}
	return DEFAULT_CURVE_COLORS[category];
};

export type EasingType =
	| "linear"
	| "easeIn"
	| "easeOut"
	| "easeInOut"
	| "hold"
	| "bezier";

export const mapCategoryToType = (category: CurveCategory): EasingType => {
	switch (category) {
		case "linear":
			return "linear";
		case "hold":
			return "hold";
		case "easeInGentle":
		case "easeInSharp":
			return "easeIn";
		case "easeOutGentle":
		case "easeOutSharp":
			return "easeOut";
		case "easeInOut":
			return "easeInOut";
		default:
			return "bezier";
	}
};
