/**
 * Layout-quality assertion helpers for the Storybook Vitest project.
 *
 * Product-model §4.3 (docs/architecture/product-model.md) requires render
 * quality to be asserted on the real DOM — dimensions, overflow, overlap,
 * and interaction state — instead of treating a successful screenshot
 * capture as a visual pass. These helpers are the shared vocabulary for
 * that contract; individual stories compose them inside `play()`.
 *
 * Layering:
 *
 * - Pure geometry (`LayoutBox`, `boxesOverlap`, `boxWithin`, …) has no DOM
 *   dependency and is unit-tested under the `unit` Vitest project.
 * - DOM adapters (`measureBox`, `assertWithinViewport`, `auditCanvas`, …)
 *   only run inside the `storybook` browser project, where
 *   `getBoundingClientRect`/`getComputedStyle` return real layout.
 *
 * A `LayoutAssertionError` is thrown (never returned) so a failing
 * assertion fails the story test — capture success alone never counts as
 * a pass.
 */

/** Axis-aligned box in viewport (client) coordinates. */
export interface LayoutBox {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export const boxRight = (box: LayoutBox): number => box.x + box.width;
export const boxBottom = (box: LayoutBox): number => box.y + box.height;

/** Positive-area intersection test. Touching edges do not count. */
export function boxesOverlap(a: LayoutBox, b: LayoutBox): boolean {
	return (
		boxRight(a) > b.x &&
		a.x < boxRight(b) &&
		boxBottom(a) > b.y &&
		a.y < boxBottom(b)
	);
}

/** Overlap area in px²; 0 when the boxes do not intersect. */
export function overlapArea(a: LayoutBox, b: LayoutBox): number {
	const width = Math.min(boxRight(a), boxRight(b)) - Math.max(a.x, b.x);
	const height = Math.min(boxBottom(a), boxBottom(b)) - Math.max(a.y, b.y);
	if (width <= 0 || height <= 0) return 0;
	return width * height;
}

/**
 * `inner` is fully inside `outer`, allowing `tolerance` px of slack per
 * side (sub-pixel rounding, fractional borders).
 */
export function boxWithin(
	inner: LayoutBox,
	outer: LayoutBox,
	tolerance = 0,
): boolean {
	return (
		inner.x >= outer.x - tolerance &&
		inner.y >= outer.y - tolerance &&
		boxRight(inner) <= boxRight(outer) + tolerance &&
		boxBottom(inner) <= boxBottom(outer) + tolerance
	);
}

/** Non-degenerate box: both dimensions strictly positive. */
export function boxHasArea(box: LayoutBox): boolean {
	return box.width > 0 && box.height > 0;
}

/** Failure type for every render-quality assertion in this module. */
export class LayoutAssertionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LayoutAssertionError";
	}
}

/** Short human-readable element locator for failure messages. */
export function describeElement(el: Element): string {
	const tag = el.tagName.toLowerCase();
	const id = el.id ? `#${el.id}` : "";
	const className =
		typeof el.className === "string" && el.className.trim().length > 0
			? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
			: "";
	const text = el.textContent?.replace(/\s+/g, " ").trim().slice(0, 48);
	return `<${tag}${id}${className}>${text ? ` "${text}"` : ""}`;
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

const describeBox = (box: LayoutBox): string =>
	`x=${fmt(box.x)} y=${fmt(box.y)} w=${fmt(box.width)} h=${fmt(box.height)}`;

// ---------------------------------------------------------------------------
// DOM adapters — Storybook browser project only.
// ---------------------------------------------------------------------------

export function measureBox(el: Element): LayoutBox {
	const rect = el.getBoundingClientRect();
	return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * True when the element actually paints: not `display:none`, not
 * `visibility:hidden/collapse`, and has a non-zero box. `opacity: 0`
 * still counts as rendered — it occupies layout and can receive state.
 */
export function isRendered(el: Element): boolean {
	const style = getComputedStyle(el);
	if (
		style.display === "none" ||
		style.visibility === "hidden" ||
		style.visibility === "collapse"
	) {
		return false;
	}
	return boxHasArea(measureBox(el));
}

export interface ViewportSize {
	readonly width: number;
	readonly height: number;
}

/** Viewport the story iframe is currently pinned to (1280x720 capture). */
export function currentViewport(): ViewportSize {
	return { width: window.innerWidth, height: window.innerHeight };
}

export interface AssertOptions {
	/** Per-side slack in px for sub-pixel rounding. Default 0.5. */
	readonly tolerance?: number;
	/** Override label used in the error message. */
	readonly label?: string;
}

const nameOf = (el: Element, label?: string): string =>
	label ?? describeElement(el);

/** The element's border box must lie fully inside the current viewport. */
export function assertWithinViewport(
	el: Element,
	options: AssertOptions & { viewport?: ViewportSize } = {},
): void {
	const tolerance = options.tolerance ?? 0.5;
	const viewport = options.viewport ?? currentViewport();
	const box = measureBox(el);
	const outer: LayoutBox = {
		x: 0,
		y: 0,
		width: viewport.width,
		height: viewport.height,
	};
	if (!boxWithin(box, outer, tolerance)) {
		throw new LayoutAssertionError(
			`${nameOf(el, options.label)} escapes the viewport: ${describeBox(box)} vs viewport ${describeBox(outer)}`,
		);
	}
}

/** The element's border box must lie fully inside `ancestor`'s padding box. */
export function assertWithinAncestor(
	el: Element,
	ancestor: Element,
	options: AssertOptions = {},
): void {
	const tolerance = options.tolerance ?? 0.5;
	// clientWidth/clientLeft give the padding box, excluding borders —
	// the region descendants may legitimately occupy.
	const ancestorRect = ancestor.getBoundingClientRect();
	const outer: LayoutBox = {
		x: ancestorRect.x + ancestor.clientLeft,
		y: ancestorRect.y + ancestor.clientTop,
		width: ancestor.clientWidth,
		height: ancestor.clientHeight,
	};
	const box = measureBox(el);
	if (!boxWithin(box, outer, tolerance)) {
		throw new LayoutAssertionError(
			`${nameOf(el, options.label)} escapes its container ${describeElement(ancestor)}: ${describeBox(box)} vs container ${describeBox(outer)}`,
		);
	}
}

const CLIPPING_OVERFLOW = new Set(["hidden", "clip"]);

/**
 * True when `el`'s box is fully inside the visible (non-scroll-clipped)
 * region of every ancestor that uses `overflow: hidden|clip`. Scroll/auto
 * ancestors are ignored: scrolling is their intended clipping mechanism.
 * `text-overflow: ellipsis` ancestors are also ignored because truncated
 * text is an intentional, user-visible affordance.
 */
export function isClippedByHiddenAncestor(
	el: Element,
	boundary: Element = document.body,
	tolerance = 0.5,
): boolean {
	for (
		let ancestor = el.parentElement;
		ancestor && ancestor !== boundary.parentElement;
		ancestor = ancestor.parentElement
	) {
		if (ancestor === boundary) break;
		const style = getComputedStyle(ancestor);
		const clipsX = CLIPPING_OVERFLOW.has(style.overflowX);
		const clipsY = CLIPPING_OVERFLOW.has(style.overflowY);
		if (!clipsX && !clipsY) continue;
		if (style.textOverflow === "ellipsis") continue;
		const rect = ancestor.getBoundingClientRect();
		const clipBox: LayoutBox = {
			x: rect.x + ancestor.clientLeft,
			y: rect.y + ancestor.clientTop,
			width: ancestor.clientWidth,
			height: ancestor.clientHeight,
		};
		const box = measureBox(el);
		// Only flag the axis the ancestor actually clips.
		const insideX =
			!clipsX ||
			(box.x >= clipBox.x - tolerance &&
				boxRight(box) <= boxRight(clipBox) + tolerance);
		const insideY =
			!clipsY ||
			(box.y >= clipBox.y - tolerance &&
				boxBottom(box) <= boxBottom(clipBox) + tolerance);
		if (!insideX || !insideY) return true;
	}
	return false;
}

/** Throw when `el` is clipped away by an `overflow:hidden|clip` ancestor. */
export function assertNotClipped(
	el: Element,
	options: AssertOptions & { boundary?: Element } = {},
): void {
	if (isClippedByHiddenAncestor(el, options.boundary, options.tolerance)) {
		throw new LayoutAssertionError(
			`${nameOf(el, options.label)} is clipped by an overflow:hidden ancestor before ${describeElement(options.boundary ?? document.body)}`,
		);
	}
}

/**
 * True when any ancestor between `el` and `boundary` scrolls on either
 * axis — such elements may legitimately sit outside the viewport.
 */
export function hasScrollableAncestor(
	el: Element,
	boundary: Element = document.body,
): boolean {
	for (
		let ancestor = el.parentElement;
		ancestor && ancestor !== boundary;
		ancestor = ancestor.parentElement
	) {
		const style = getComputedStyle(ancestor);
		if (
			style.overflowX === "auto" ||
			style.overflowX === "scroll" ||
			style.overflowY === "auto" ||
			style.overflowY === "scroll"
		) {
			return true;
		}
	}
	return false;
}

/**
 * `el` must not positively overlap any of `others`. `tolerance` is the
 * allowed overlap area in px² (default 0 — any positive intersection
 * fails).
 */
export function assertNoOverlap(
	el: Element,
	others: Element | readonly Element[],
	options: AssertOptions & { tolerance?: number } = {},
): void {
	const list = Array.isArray(others) ? others : [others];
	const box = measureBox(el);
	const allowed = options.tolerance ?? 0;
	for (const other of list) {
		if (other === el) continue;
		const area = overlapArea(box, measureBox(other));
		if (area > allowed) {
			throw new LayoutAssertionError(
				`${nameOf(el, options.label)} overlaps ${describeElement(other)} by ${fmt(area)}px²`,
			);
		}
	}
}

/** Element must be rendered (visible, non-zero box). */
export function assertRendered(el: Element, options: AssertOptions = {}): void {
	if (!isRendered(el)) {
		throw new LayoutAssertionError(
			`${nameOf(el, options.label)} is not rendered (display/visibility/box)`,
		);
	}
}

// ---------------------------------------------------------------------------
// Composite canvas audit
// ---------------------------------------------------------------------------

/** Elements a user can perceive as interactive — the default audit scope. */
export const INTERACTIVE_SELECTOR = [
	"button",
	"a[href]",
	"input",
	"select",
	"textarea",
	"[contenteditable='true']",
	"[role='button']",
	"[role='link']",
	"[role='tab']",
	"[role='checkbox']",
	"[role='radio']",
	"[role='switch']",
	"[role='menuitem']",
	"[role='menuitemcheckbox']",
	"[role='menuitemradio']",
	"[role='option']",
	"[role='combobox']",
	"[role='slider']",
	"[role='spinbutton']",
].join(", ");

export type PageOverflowAxis = "x" | "y" | "both" | false;

export interface CanvasAuditOptions {
	/**
	 * Selector for elements that must be rendered AND fully inside the
	 * viewport unless inside a scrollable ancestor. Default
	 * {@link INTERACTIVE_SELECTOR}.
	 */
	readonly interactiveSelector?: string;
	/**
	 * Selector for elements that must additionally not be clipped by
	 * `overflow:hidden|clip` ancestors. Default: same as
	 * `interactiveSelector`.
	 */
	readonly unclippedSelector?: string;
	/** Elements matching this selector must be rendered (not skipped). */
	readonly requireRenderedSelector?: string;
	/** Page-level overflow check on documentElement. Default "x". */
	readonly pageOverflow?: PageOverflowAxis;
	/** Ancestor boundary for clipping/scroll checks. Default document.body. */
	readonly boundary?: Element;
	/** Per-side slack in px. Default 0.5. */
	readonly tolerance?: number;
	/** Elements/selectors to exclude from every check. */
	readonly exclude?: string | readonly Element[];
}

const collect = (
	root: ParentNode,
	selector: string,
	exclude: readonly (Element | string)[],
): Element[] => {
	const excluded = (el: Element): boolean =>
		exclude.some((item) =>
			typeof item === "string" ? el.matches(item) : item === el,
		);
	return Array.from(root.querySelectorAll(selector)).filter(
		(el) => !excluded(el),
	);
};

/**
 * Inspect every rendered interactive element under `root` (typically the
 * story `canvasElement`) for the machine-checkable parts of the render
 * contract:
 *
 * - rendered elements must not escape the viewport, unless a scrollable
 *   ancestor legitimately owns their overflow;
 * - rendered elements must not be clipped by `overflow:hidden|clip`
 *   ancestors (the popover/dialog conflict from product-model §4.3);
 * - optional page-level horizontal/vertical overflow on documentElement.
 *
 * Returns a list of violation strings; empty means pass. Use
 * {@link expectCanvasLayout} to turn violations into a test failure.
 */
export function auditCanvas(
	root: ParentNode,
	options: CanvasAuditOptions = {},
): string[] {
	const tolerance = options.tolerance ?? 0.5;
	const boundary = options.boundary ?? document.body;
	const interactiveSelector =
		options.interactiveSelector ?? INTERACTIVE_SELECTOR;
	const unclippedSelector = options.unclippedSelector ?? interactiveSelector;
	const pageOverflow = options.pageOverflow ?? "x";
	const exclude = options.exclude ? [options.exclude].flat() : [];
	const viewport = currentViewport();
	const violations: string[] = [];
	const outer: LayoutBox = {
		x: 0,
		y: 0,
		width: viewport.width,
		height: viewport.height,
	};

	for (const el of collect(root, interactiveSelector, exclude)) {
		if (!isRendered(el)) continue;
		if (
			!hasScrollableAncestor(el, boundary) &&
			!boxWithin(measureBox(el), outer, tolerance)
		) {
			violations.push(
				`${describeElement(el)} escapes the viewport: ${describeBox(measureBox(el))} vs ${describeBox(outer)}`,
			);
		}
	}

	for (const el of collect(root, unclippedSelector, exclude)) {
		if (!isRendered(el)) continue;
		if (isClippedByHiddenAncestor(el, boundary, tolerance)) {
			violations.push(
				`${describeElement(el)} is clipped by an overflow:hidden ancestor`,
			);
		}
	}

	if (options.requireRenderedSelector) {
		for (const el of collect(root, options.requireRenderedSelector, exclude)) {
			if (!isRendered(el)) {
				violations.push(`${describeElement(el)} must be rendered but is not`);
			}
		}
	}

	if (pageOverflow) {
		const doc = document.documentElement;
		const clipW = doc.clientWidth;
		const clipH = doc.clientHeight;
		if (
			(pageOverflow === "x" || pageOverflow === "both") &&
			doc.scrollWidth > clipW + tolerance
		) {
			violations.push(
				`documentElement horizontal overflow: scrollWidth=${doc.scrollWidth} clientWidth=${clipW}`,
			);
		}
		if (
			(pageOverflow === "y" || pageOverflow === "both") &&
			doc.scrollHeight > clipH + tolerance
		) {
			violations.push(
				`documentElement vertical overflow: scrollHeight=${doc.scrollHeight} clientHeight=${clipH}`,
			);
		}
	}
	return violations;
}

/**
 * Run {@link auditCanvas} and throw a single
 * {@link LayoutAssertionError} listing every violation. This is the
 * entry point story `play()` functions should call for the generic
 * contract; use the granular `assert*` helpers for component-specific
 * invariants (selected state, focus ring, drag ghost position, …).
 */
export function expectCanvasLayout(
	root: ParentNode,
	options: CanvasAuditOptions = {},
): void {
	const violations = auditCanvas(root, options);
	if (violations.length > 0) {
		throw new LayoutAssertionError(
			`layout contract violations (${violations.length}):\n- ${violations.join("\n- ")}`,
		);
	}
}

/**
 * Run `fn` and return the {@link LayoutAssertionError} it threw, or null.
 * Used by the negative-fixture stories to prove the inspection itself
 * rejects broken layout instead of silently passing.
 */
export function captureLayoutError(
	fn: () => void,
): LayoutAssertionError | null {
	try {
		fn();
	} catch (error) {
		if (error instanceof LayoutAssertionError) return error;
		throw error;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Interaction settle helpers
// ---------------------------------------------------------------------------

/** Wait for two animation frames so style/layout from state changes settle. */
export async function nextPaint(): Promise<void> {
	await new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
	);
}

/**
 * `userEvent.hover` plus a `:hover` assertion and a short settle so the
 * post-hover computed style is measurable. `storybook/test`'s userEvent
 * does not move the real pointer — import `userEvent` from
 * `vitest/browser` in the story (see existing play functions).
 */
export async function hoverAndAssert(
	el: Element,
	opts: { settleMs?: number } = {},
): Promise<void> {
	const { userEvent } = await import("vitest/browser");
	await userEvent.hover(el);
	if (!el.matches(":hover")) {
		throw new LayoutAssertionError(
			`${describeElement(el)} did not match :hover after userEvent.hover`,
		);
	}
	await new Promise((resolve) => setTimeout(resolve, opts.settleMs ?? 50));
}

/** Real focus via `vitest/browser` userEvent, then `:focus` assertion. */
export async function focusAndAssert(el: Element): Promise<void> {
	const { userEvent } = await import("vitest/browser");
	await userEvent.click(el);
	if (!el.matches(":focus")) {
		throw new LayoutAssertionError(
			`${describeElement(el)} did not receive focus`,
		);
	}
}
