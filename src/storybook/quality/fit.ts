/**
 * Rendered-fit contract helpers for Storybook `play()` assertions
 * (Issue #726).
 *
 * The regressions behind #721–#724 / #730–#736 / #741 all shipped with
 * green machine audits: components *used* shared styles and tokens, yet
 * the final rendered result violated the contract (a search field that
 * stopped tracking its widget width, a tab strip that wrapped, an
 * invisible scrollbar thumb). "Uses the right class" is not "renders
 * correctly" — these helpers assert the painted result on the real DOM:
 * measured widths, single-row geometry, icon aspect, scrollbar
 * affordance.
 *
 * CEF99 constraint (#700): container queries are unavailable, so every
 * check here is px measurement (`getBoundingClientRect` / `clientWidth`),
 * never `@container` assumptions.
 *
 * Layering matches `layout.ts` / `border.ts`: everything is DOM-facing and
 * only runs inside the `storybook` browser project. Failures throw
 * {@link LayoutAssertionError} so a story `play()` fails.
 */

import {
	describeElement,
	LayoutAssertionError,
	measureBox,
	nextPaint,
} from "./layout";

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

export interface FitOptions {
	/** Per-side slack in px for sub-pixel rounding. Default 1. */
	readonly tolerance?: number;
	/** Override label used in error messages. */
	readonly label?: string;
}

const nameOf = (el: Element, label?: string): string =>
	label ?? describeElement(el);

// ---------------------------------------------------------------------------
// Container width tracking (Issue #721 shape)
// ---------------------------------------------------------------------------

/**
 * Assert `track`'s rendered width follows `container`'s width: the width
 * ratio `track / container` must stay within `tolerance` px-equivalent
 * across a probe resize.
 *
 * The probe writes an inline `width` onto `container` (restored
 * afterwards), lets layout settle, and measures both elements before and
 * after. Use this for the "input/strip inside a resizable widget tracks
 * the container" contract — e.g. the #721 palette-search wrapper whose
 * `flexShrink: 0` collapsed it to content width on CEF.
 *
 * `track` should be the element whose width is *supposed* to track the
 * container (the field root, the strip). Pass `expectedRatio` when the
 * contract is "fills the container" (ratio ≈ 1) — the default only checks
 * that the ratio is *preserved*, not its value.
 */
export async function expectContainerWidthTracking(
	container: HTMLElement,
	track: Element,
	options: FitOptions & {
		/** Inline width applied to `container` for the probe. Default "50%". */
		readonly resizeTo?: string;
		/** Fraction of container width `track` must occupy. Default: preserve initial ratio. */
		readonly expectedRatio?: number;
		/** Max ms to wait for the resize to settle. Default 1000. */
		readonly timeoutMs?: number;
	} = {},
): Promise<void> {
	const tolerance = options.tolerance ?? 1;
	const resizeTo = options.resizeTo ?? "50%";
	const timeoutMs = options.timeoutMs ?? 1000;
	const label = nameOf(track, options.label);

	const containerWidth = (): number => measureBox(container).width;
	const trackWidth = (): number => measureBox(track).width;
	const ratio = (): number => {
		const cw = containerWidth();
		return cw > 0 ? trackWidth() / cw : Number.NaN;
	};

	const beforeContainer = containerWidth();
	const beforeTrack = trackWidth();
	const beforeRatio = ratio();
	if (!(beforeContainer > 0) || !(beforeTrack > 0)) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${label}: cannot measure width before resize (container=${fmt(beforeContainer)} track=${fmt(beforeTrack)})`,
		);
	}

	const originalWidth = container.style.width;
	container.style.width = resizeTo;
	try {
		// Poll until the container actually resizes and the tracked
		// element's width has had a chance to follow (ResizeObserver /
		// flex layout settle asynchronously).
		const deadline = Date.now() + timeoutMs;
		let settled = false;
		while (Date.now() < deadline) {
			await nextPaint();
			if (Math.abs(containerWidth() - beforeContainer) > 0.5) {
				settled = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 16));
		}
		if (!settled) {
			// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
			throw new LayoutAssertionError(
				`${nameOf(container, options.label)} did not resize to ${resizeTo} within ${timeoutMs}ms`,
			);
		}
		await nextPaint();
	} finally {
		container.style.width = originalWidth;
	}

	const afterContainer = containerWidth();
	const afterTrack = trackWidth();
	const afterRatio = ratio();
	const expected = options.expectedRatio ?? beforeRatio;
	if (
		Math.abs(afterRatio - expected) >
		tolerance / Math.max(afterContainer, 1)
	) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${label} does not track its container: width ${fmt(beforeTrack)}→${fmt(afterTrack)} while container ${fmt(beforeContainer)}→${fmt(afterContainer)} (ratio ${fmt(beforeRatio)}→${fmt(afterRatio)}, expected ≈${fmt(expected)})`,
		);
	}
}

/**
 * Assert `el`'s border-box width matches `reference`'s within `tolerance`
 * px — the "fills its slot" half of the tracking contract, checked
 * statically (no resize probe). Pair with
 * {@link expectContainerWidthTracking} for the dynamic half.
 */
export function assertMatchesWidth(
	el: Element,
	reference: Element,
	options: FitOptions = {},
): void {
	const tolerance = options.tolerance ?? 1;
	const elWidth = measureBox(el).width;
	const refWidth = measureBox(reference).width;
	if (Math.abs(elWidth - refWidth) > tolerance) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${nameOf(el, options.label)} width ${fmt(elWidth)} does not match ${describeElement(reference)} width ${fmt(refWidth)} (tolerance ${tolerance}px)`,
		);
	}
}

// ---------------------------------------------------------------------------
// Single-row strips (Issue #723 shape)
// ---------------------------------------------------------------------------

/**
 * Assert a horizontal strip (tab bar, segmented control, toolbar) never
 * wraps: every rendered child shares one row AND the container's content
 * does not exceed its client height (no second line is painted).
 *
 * This is the machine-checkable half of the #723 contract. What it cannot
 * see: whether a *single* row's items are readable — that is the
 * adaptive-label contract ({@link expectAdaptiveLabels} consumers assert
 * label *content* changes, not just geometry).
 */
export function assertSingleRow(
	container: Element,
	options: FitOptions & {
		/** Selector for the row items. Default: all element children. */
		readonly itemSelector?: string;
	} = {},
): void {
	const tolerance = options.tolerance ?? 1;
	const label = nameOf(container, options.label);
	const items = options.itemSelector
		? Array.from(container.querySelectorAll(options.itemSelector))
		: Array.from(container.children);
	const visible = items.filter((el) => {
		const box = measureBox(el);
		return box.width > 0 && box.height > 0;
	});
	if (visible.length === 0) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(`${label}: no visible row items found`);
	}
	const tops = new Set(
		visible.map((el) => Math.round(measureBox(el).y / tolerance) * tolerance),
	);
	if (tops.size !== 1) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${label}: items wrap across ${tops.size} rows (expected 1)`,
		);
	}
	// A wrapped flex/grid strip grows scrollHeight past clientHeight even
	// when item tops coincide (e.g. negative margins); catch that too.
	if (container.scrollHeight > container.clientHeight + tolerance) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${label}: content height ${container.scrollHeight}px exceeds client height ${container.clientHeight}px — strip wrapped`,
		);
	}
}

// ---------------------------------------------------------------------------
// Icon aspect (Issue #726 contract 5)
// ---------------------------------------------------------------------------

/**
 * Assert a rendered icon's border box keeps its expected aspect ratio.
 * Lucide icons are square viewBoxes, so `expectedRatio` defaults to 1;
 * pass e.g. `16 / 9` for deliberately non-square glyphs.
 *
 * Boundary: this checks the *box*, not the glyph — it cannot verify that
 * the icon's strokes, optical weight, or silhouette are correct at real
 * sizes. That remains a visual-review concern; what this catches is the
 * regression class where a wrapper's flex sizing squashes or stretches
 * the icon (the #587/#582 shape of defect).
 */
export function assertIconAspect(
	icon: Element,
	options: FitOptions & { readonly expectedRatio?: number } = {},
): void {
	const tolerance = options.tolerance ?? 0.05;
	const expectedRatio = options.expectedRatio ?? 1;
	const box = measureBox(icon);
	if (!(box.width > 0) || !(box.height > 0)) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${nameOf(icon, options.label)} has a zero-area box (${fmt(box.width)}×${fmt(box.height)})`,
		);
	}
	const actual = box.width / box.height;
	if (Math.abs(actual - expectedRatio) > tolerance) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${nameOf(icon, options.label)} aspect ${fmt(actual)} ≠ expected ${fmt(expectedRatio)} (box ${fmt(box.width)}×${fmt(box.height)})`,
		);
	}
}

// ---------------------------------------------------------------------------
// Scroll affordance (Issue #741 shape)
// ---------------------------------------------------------------------------

/**
 * Assert a scroll container actually overflows AND paints a visible
 * scrollbar thumb at rest. The thumb color is parsed out of the computed
 * `scrollbar-color` (`"<thumb> <track>"`); a fully transparent thumb is
 * the #735/#741 defect — overflow exists but gives zero affordance.
 *
 * Boundary: `scrollbar-color` is ignored by CEF's older engine paths and
 * by overlay-scrollbar platforms, where `::-webkit-scrollbar` styling or
 * the platform default applies. Stories that must hold on CEF99 should
 * also assert the geometric half (`scrollHeight > clientHeight`); this
 * helper covers the token/color contract only.
 */
export function assertScrollbarThumbVisible(
	scroller: Element,
	options: FitOptions & {
		/** Assert the container overflows before checking the thumb. Default true. */
		readonly requireOverflow?: boolean;
	} = {},
): void {
	const label = nameOf(scroller, options.label);
	const requireOverflow = options.requireOverflow ?? true;
	if (requireOverflow && scroller.scrollHeight <= scroller.clientHeight + 1) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${label}: expected vertical overflow (scrollHeight=${scroller.scrollHeight} clientHeight=${scroller.clientHeight})`,
		);
	}
	const scrollbarColor = getComputedStyle(scroller).scrollbarColor;
	const thumbMatch = scrollbarColor.match(/rgba?\([^)]*,\s*([\d.]+)\)/);
	const alpha = thumbMatch ? Number.parseFloat(thumbMatch[1]) : Number.NaN;
	if (!(alpha > 0)) {
		// i18n-exempt: internal diagnostic — storybook layout assertion, not UI copy
		throw new LayoutAssertionError(
			`${label}: scrollbar thumb is not visible at rest (scrollbar-color=${scrollbarColor})`,
		);
	}
}
