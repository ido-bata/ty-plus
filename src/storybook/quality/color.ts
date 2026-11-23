/**
 * Color-contrast helpers for Storybook `play()` assertions.
 *
 * Product-model §4.3 requires render quality to be asserted on the real
 * DOM. Opacity-dimmed or low-contrast treatments are invisible to
 * structure-only checks, so stories that care about legibility measure
 * the computed colors and compare their WCAG contrast ratio here.
 *
 * Computed colors may carry alpha (`rgba()`, `color-mix()` is rejected).
 * Semi-transparent paints are composited over an explicit backdrop before
 * the ratio is computed — the same thing the browser does when it blends
 * e.g. `rgb(255 255 255 / 0.12)` over the surface behind the control.
 *
 * Layering matches `layout.ts`: the parsing/luminance math is pure and
 * unit-tested under the `unit` project; the DOM-facing `assertContrast`
 * only runs inside the `storybook` browser project.
 */

import { LayoutAssertionError } from "./layout";

/** sRGB channel triple in 0..1, fully opaque. */
export interface RgbColor {
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

/** sRGB channels plus alpha in 0..1. */
export interface RgbaColor extends RgbColor {
	readonly a: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Parse a computed CSS color into sRGB channels + alpha. Accepts `#rgb`,
 * `#rrggbb`, `rgb()/rgba()` (channels may be numbers or percentages) and
 * returns null for anything else (`var()` that did not resolve,
 * `color-mix()`, `transparent` keyword).
 */
export function parseCssColor(value: string): RgbaColor | null {
	const text = value.trim().toLowerCase();
	if (!text || text === "transparent") return null;

	const hex = /^#([0-9a-f]{3,8})$/.exec(text);
	if (hex) {
		const digits = hex[1];
		if (digits.length === 3 || digits.length === 4) {
			return {
				r: Number.parseInt(digits[0] + digits[0], 16) / 255,
				g: Number.parseInt(digits[1] + digits[1], 16) / 255,
				b: Number.parseInt(digits[2] + digits[2], 16) / 255,
				a:
					digits.length === 4
						? Number.parseInt(digits[3] + digits[3], 16) / 255
						: 1,
			};
		}
		if (digits.length === 6 || digits.length === 8) {
			return {
				r: Number.parseInt(digits.slice(0, 2), 16) / 255,
				g: Number.parseInt(digits.slice(2, 4), 16) / 255,
				b: Number.parseInt(digits.slice(4, 6), 16) / 255,
				a:
					digits.length === 8
						? Number.parseInt(digits.slice(6, 8), 16) / 255
						: 1,
			};
		}
		return null;
	}

	const fn = /^rgba?\(([^)]+)\)$/.exec(text);
	if (!fn) return null;
	const parts = fn[1].split(/[\s,/]+/).filter((p) => p.length > 0);
	if (parts.length < 3) return null;
	const channel = (raw: string): number | null => {
		if (raw.endsWith("%")) {
			const n = Number.parseFloat(raw);
			return Number.isFinite(n) ? clamp01(n / 100) : null;
		}
		const n = Number.parseFloat(raw);
		return Number.isFinite(n) ? clamp01(n / 255) : null;
	};
	const r = channel(parts[0]);
	const g = channel(parts[1]);
	const b = channel(parts[2]);
	if (r === null || g === null || b === null) return null;
	const alphaRaw = parts[3];
	const a =
		alphaRaw === undefined
			? 1
			: Number.isFinite(Number.parseFloat(alphaRaw))
				? clamp01(Number.parseFloat(alphaRaw))
				: null;
	if (a === null) return null;
	return { r, g, b, a };
}

/** Composite `fg` (with alpha) over opaque `bg`, per WCAG/blending rules. */
export function flattenOver(fg: RgbaColor, bg: RgbColor): RgbColor {
	const mix = (f: number, b: number): number => f * fg.a + b * (1 - fg.a);
	return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

const linearize = (channel: number): number =>
	channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** WCAG 2.x relative luminance of an opaque sRGB color. */
export function relativeLuminance(color: RgbColor): number {
	return (
		0.2126 * linearize(color.r) +
		0.7152 * linearize(color.g) +
		0.0722 * linearize(color.b)
	);
}

/** WCAG contrast ratio between two opaque colors, 1..21. */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}

const describe = (color: RgbColor): string =>
	`rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;

const BLACK: RgbColor = { r: 0, g: 0, b: 0 };

const resolveColor = (
	source: Element | string,
	property: "color" | "backgroundColor",
): RgbaColor | null =>
	parseCssColor(
		typeof source === "string" ? source : getComputedStyle(source)[property],
	);

/**
 * Assert the WCAG contrast ratio between the computed `color` of `el` and
 * the given background reaches `minRatio` (default 3:1, the non-text /
 * UI-component threshold). `background` may be an element whose computed
 * `backgroundColor` is measured, or a raw CSS color string.
 *
 * Alpha is composited: a translucent background (e.g. `ink-12` active
 * surfaces, `transparent` inactive buttons) is flattened over `backdrop`
 * (default black — pass the enclosing surface element for dark UIs), and
 * a translucent text color is flattened over the effective background.
 * Throws {@link LayoutAssertionError} so story `play()` fails.
 */
export function assertContrast(
	el: Element,
	background: Element | string,
	options: {
		minRatio?: number;
		label?: string;
		backdrop?: Element | string;
	} = {},
): void {
	const minRatio = options.minRatio ?? 3;
	const label = options.label ?? el.tagName.toLowerCase();
	const bgParsed = resolveColor(background, "backgroundColor");
	const fgParsed = resolveColor(el, "color");
	if (!fgParsed || !bgParsed) {
		// i18n-exempt: internal diagnostic — storybook contrast assertion, not UI copy
		throw new LayoutAssertionError(
			`${label}: cannot parse colors (color=${getComputedStyle(el).color}, background=${typeof background === "string" ? background : getComputedStyle(background).backgroundColor})`,
		);
	}
	const backdropParsed = options.backdrop
		? (resolveColor(options.backdrop, "backgroundColor") ??
			(typeof options.backdrop === "string"
				? parseCssColor(options.backdrop)
				: null))
		: null;
	const backdrop = backdropParsed
		? backdropParsed.a >= 1
			? { r: backdropParsed.r, g: backdropParsed.g, b: backdropParsed.b }
			: flattenOver(backdropParsed, BLACK)
		: BLACK;
	const effectiveBg =
		bgParsed.a >= 1
			? { r: bgParsed.r, g: bgParsed.g, b: bgParsed.b }
			: flattenOver(bgParsed, backdrop);
	const effectiveFg =
		fgParsed.a >= 1
			? { r: fgParsed.r, g: fgParsed.g, b: fgParsed.b }
			: flattenOver(fgParsed, effectiveBg);
	const ratio = contrastRatio(effectiveFg, effectiveBg);
	if (ratio < minRatio) {
		// i18n-exempt: internal diagnostic — storybook contrast assertion, not UI copy
		throw new LayoutAssertionError(
			`${label}: contrast ${ratio.toFixed(2)}:1 < ${minRatio}:1 (color=${describe(effectiveFg)} on ${describe(effectiveBg)})`,
		);
	}
}
