import { type RefObject, useEffect, useMemo, useState } from "react";

/**
 * Runtime frame fitting for preset glyphs.
 *
 * The glyph frames used to size their text with container-query units
 * (`cqi` / `cqh` / `container-type: size`). The CEP panel runs on CEF
 * (Chromium 99), which has no container queries — every `…cqi` declaration
 * was invalid and dropped, so badge text fell back to the inherited ~16px
 * and overflowed its frame. These helpers reproduce the same sizing in
 * plain px, measured with a single shared `ResizeObserver`.
 *
 * CEF 99 does support `ResizeObserver` (Chrome 64+), canvas 2D
 * `measureText`, `getComputedStyle` and inline styles, so this path works
 * unchanged on the production host and in Storybook's modern Chromium.
 */

export type FrameMetrics = {
	/**
	 * Border-box size of the observed element. The glyph shell fills its
	 * host's content box, so this is the `cqi`/`cqh` reference the old
	 * container-query declarations resolved against.
	 */
	boxWidth: number;
	boxHeight: number;
	/** Content-box size actually available to the glyph's children. */
	contentWidth: number;
	contentHeight: number;
};

const px = (value: string): number => {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

export function measureFrame(el: HTMLElement): FrameMetrics {
	const rect = el.getBoundingClientRect();
	const style = getComputedStyle(el);
	const padX = px(style.paddingLeft) + px(style.paddingRight);
	const padY = px(style.paddingTop) + px(style.paddingBottom);
	const borderX = px(style.borderLeftWidth) + px(style.borderRightWidth);
	const borderY = px(style.borderTopWidth) + px(style.borderBottomWidth);
	return {
		boxWidth: rect.width,
		boxHeight: rect.height,
		contentWidth: Math.max(0, rect.width - padX - borderX),
		contentHeight: Math.max(0, rect.height - padY - borderY),
	};
}

type FrameCallback = () => void;

// One shared ResizeObserver for every glyph frame. Glyph lists can render
// ~300 rows; a single observer batches all resize notifications into one
// layout pass instead of one observer instance per row.
const frameCallbacks = new Map<Element, Set<FrameCallback>>();
let sharedObserver: ResizeObserver | null = null;

function sharedResizeObserver(): ResizeObserver | null {
	if (typeof ResizeObserver === "undefined") return null;
	if (!sharedObserver) {
		sharedObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const callbacks = frameCallbacks.get(entry.target);
				if (!callbacks) continue;
				for (const callback of callbacks) callback();
			}
		});
	}
	return sharedObserver;
}

/**
 * Subscribes `callback` to size changes of `el`. Returns an unsubscribe
 * function. When `ResizeObserver` is unavailable (jsdom unit tests) this is
 * a no-op and callers keep their fallback styles.
 */
export function observeFrameSize(
	el: Element,
	callback: FrameCallback,
): () => void {
	const observer = sharedResizeObserver();
	if (!observer) return () => {};
	let callbacks = frameCallbacks.get(el);
	if (!callbacks) {
		callbacks = new Set();
		frameCallbacks.set(el, callbacks);
		observer.observe(el);
	}
	callbacks.add(callback);
	return () => {
		callbacks.delete(callback);
		if (callbacks.size === 0) {
			frameCallbacks.delete(el);
			observer.unobserve(el);
		}
	};
}

/**
 * Tracks the `FrameMetrics` of the element `ref` points to. Returns `null`
 * until the first measurement (and forever when `ResizeObserver` is
 * missing), so callers must keep a CSS/inline fallback.
 */
export function useFrameMetrics(
	ref: RefObject<HTMLElement | null>,
): FrameMetrics | null {
	const [metrics, setMetrics] = useState<FrameMetrics | null>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") {
			setMetrics(null);
			return;
		}
		const update = () => {
			const next = measureFrame(el);
			setMetrics((prev) =>
				prev &&
				prev.boxWidth === next.boxWidth &&
				prev.boxHeight === next.boxHeight &&
				prev.contentWidth === next.contentWidth &&
				prev.contentHeight === next.contentHeight
					? prev
					: next,
			);
		};
		// Measure immediately: ResizeObserver also reports the initial size,
		// but doing it here keeps the first painted frame correct even if an
		// embedding environment suppresses the initial notification.
		update();
		return observeFrameSize(el, update);
	}, [ref]);
	return metrics;
}

// --- text measurement -------------------------------------------------

// East-Asian wide/full-width ranges plus emoji-ish blocks: these occupy
// ~1em; everything else ~0.58em. Only used when canvas 2D is unavailable.
const WIDE_GLYPH =
	/[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u{20000}-\u{2FA1F}]/u;

let measureContext: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
	if (measureContext !== undefined) return measureContext;
	if (typeof document === "undefined") {
		measureContext = null;
		return null;
	}
	const canvas = document.createElement("canvas");
	measureContext = canvas.getContext("2d");
	return measureContext;
}

const widthCache = new Map<string, number>();

/**
 * Advance width of `text` rendered at a 100px font size, in px. Canvas 2D
 * `measureText` is the accurate path; when it is unavailable (jsdom, or a
 * host without canvas) a per-grapheme em estimate keeps the fit sane.
 * Results are cached per (font, text) — glyph strings repeat heavily in
 * preset lists, so the cache stays small.
 */
export function measureTextWidth100(
	text: string,
	fontFamily = "",
	fontWeight = "400",
	fontStyle = "normal",
): number {
	const key = `${fontStyle}|${fontWeight}|${fontFamily}|${text}`;
	const cached = widthCache.get(key);
	if (cached !== undefined) return cached;
	let width: number;
	const ctx = getMeasureContext();
	if (ctx) {
		ctx.font = `${fontStyle} ${fontWeight} 100px ${fontFamily || "sans-serif"}`;
		width = ctx.measureText(text).width;
	} else {
		width = 0;
		for (const ch of text) {
			width += WIDE_GLYPH.test(ch) ? 100 : 58;
		}
	}
	widthCache.set(key, width);
	return width;
}

// --- fit helpers -----------------------------------------------------

export type FitTextFontOptions = {
	/** Lines sharing one font size; the widest line drives the fit. */
	lines: readonly string[];
	/**
	 * Border-box inline size — the `cqi` reference the old
	 * `fontSize: NNcqi` declarations resolved against.
	 */
	boxWidth: number;
	/** Content-box the lines must fit inside. */
	contentWidth: number;
	contentHeight: number;
	/**
	 * Preferred size as a percentage of `boxWidth` — the numeric part of
	 * the old `NNcqi` value (e.g. `18` for `18cqi`).
	 */
	preferredPct: number;
	minFontPx: number;
	maxFontPx?: number;
	fontFamily?: string;
	fontWeight?: string;
	fontStyle?: string;
	/** `line-height` / `font-size` ratio; glyph lines use `lineHeight: none` = 1. */
	lineHeightFactor?: number;
};

/**
 * Computes the px font size for a multi-line glyph.
 *
 * The preferred size keeps the old container-query proportions
 * (`preferredPct`% of the frame width) so rendering is unchanged wherever
 * the declaration used to be valid. The result is then only ever shrunk —
 * never grown — until every line fits the frame's content box, which is
 * what the dropped `cqi` declarations failed to do on CEF 99.
 * Floors/caps reproduce the old `clamp(min, preferred, max)` semantics.
 */
export function fitTextFontPx(opts: FitTextFontOptions): number {
	const maxFontPx = opts.maxFontPx ?? 96;
	const lineHeightFactor = opts.lineHeightFactor ?? 1;
	let px = (opts.preferredPct / 100) * opts.boxWidth;

	let widest = 0;
	for (const line of opts.lines) {
		widest = Math.max(
			widest,
			measureTextWidth100(
				line,
				opts.fontFamily,
				opts.fontWeight,
				opts.fontStyle,
			),
		);
	}
	// `widest` is the advance at a 100px font; scale linearly to the size
	// that exactly fills the content width, with a small safety margin.
	if (widest > 0 && opts.contentWidth > 0) {
		px = Math.min(px, (opts.contentWidth * 0.98 * 100) / widest);
	}
	if (opts.lines.length > 0 && opts.contentHeight > 0) {
		px = Math.min(
			px,
			(opts.contentHeight * 0.96) / (opts.lines.length * lineHeightFactor),
		);
	}
	return Math.min(Math.max(px, opts.minFontPx), maxFontPx);
}

export type TextFitSpec = {
	/** Lines sharing one font size; the widest line drives the fit. */
	lines: readonly string[];
	/** Preferred size as a percentage of the frame's inline size. */
	preferredPct: number;
	minFontPx: number;
};

/**
 * Computes the fitted px font size for `shellRef`'s text from the frame
 * metrics and the element's computed font. Returns `null` until the first
 * measurement so callers can keep their CSS/inline fallback.
 *
 * Derived during render (not in an effect) because the value is a pure
 * function of `metrics` + `fit` + the already-mounted element — the same
 * inputs that trigger the re-render. Font metrics are read through
 * `getComputedStyle` on the committed element; like the previous effect
 * version, the result refreshes whenever the frame is re-measured.
 */
export function useFittedTextFontPx(
	shellRef: RefObject<HTMLElement | null>,
	metrics: FrameMetrics | null,
	fit: TextFitSpec,
): number | null {
	return useMemo(() => {
		const el = shellRef.current;
		if (!metrics || !el) return null;
		const style = getComputedStyle(el);
		return fitTextFontPx({
			lines: fit.lines,
			boxWidth: metrics.boxWidth,
			contentWidth: metrics.contentWidth,
			contentHeight: metrics.contentHeight,
			preferredPct: fit.preferredPct,
			minFontPx: fit.minFontPx,
			fontFamily: style.fontFamily,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle,
		});
	}, [shellRef, metrics, fit]);
}

/**
 * Old `borderRadius: min(12px, 15cqi)` — 15% of the container inline size,
 * capped at 12px.
 */
export function glyphFrameRadiusPx(boxWidth: number): number {
	return Math.min(12, boxWidth * 0.15);
}
