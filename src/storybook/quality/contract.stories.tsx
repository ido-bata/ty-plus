import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { css } from "@/styled-system/css";

import {
	assertNoOverlap,
	assertNotClipped,
	assertWithinViewport,
	captureLayoutError,
	expectCanvasLayout,
	INTERACTIVE_SELECTOR,
	measureBox,
} from "./layout";

/**
 * Quality-contract fixtures (Issue #194, product-model §4.3).
 *
 * These stories exist to prove the render-quality inspection itself works:
 *
 * - `HealthyCard` must PASS every assertion — the inspection accepts a
 *   correct layout.
 * - `ClippedOverflow`, `ViewportEscape` and `OverlappingControls` are
 *   intentionally broken. Their play functions assert that the layout
 *   contract REJECTS them (`captureLayoutError` must return a
 *   `LayoutAssertionError`). If a refactor ever makes the assertions
 *   blind, these stories fail — screenshot capture succeeding is never
 *   treated as a visual pass.
 *
 * Component stories reuse the same helpers for real surfaces; see
 * docs/architecture/quality/ui-render-contract.md.
 */

const cardClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
	padding: "3",
	width: "20rem",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	borderRadius: "md",
	backgroundColor: "surface.panel",
});

const buttonClass = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	paddingX: "3",
	paddingY: "1",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	borderRadius: "sm",
	backgroundColor: "interactive.default",
	color: "text.primary",
	cursor: "pointer",
	_hover: { backgroundColor: "interactive.hover" },
});

const meta = {
	title: "Quality/LayoutContract",
	parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const requireButton = (canvasElement: HTMLElement): HTMLButtonElement => {
	const button = canvasElement.querySelector("button");
	if (!button) throw new Error("fixture button not found");
	return button;
};

/** Correct layout: assertions must accept it. */
export const HealthyCard: Story = {
	render: () => (
		<div className={cardClass} data-testid="healthy-card">
			<strong>Preset card</strong>
			<span>Short supporting text that fits.</span>
			<div>
				<button type="button" className={buttonClass}>
					Apply
				</button>
			</div>
		</div>
	),
	play: async ({ canvasElement }) => {
		// Generic contract: no violations.
		expectCanvasLayout(canvasElement);
		const card = canvasElement.querySelector("[data-testid='healthy-card']");
		const button = requireButton(canvasElement);
		if (!card) throw new Error("card not found");
		// Granular contract: button inside card inside viewport.
		assertWithinViewport(button);
		assertNotClipped(button);
		expect(measureBox(button).width).toBeGreaterThan(0);
	},
};

/**
 * Anti-case: a control wider than its `overflow:hidden` parent is clipped
 * before the user can read or click it. The audit must reject this.
 */
export const ClippedOverflow: Story = {
	render: () => (
		<div
			style={{
				width: "10rem",
				overflow: "hidden",
				border: "1px solid #666",
				padding: "0.5rem",
			}}
		>
			<button
				type="button"
				style={{
					display: "inline-block",
					whiteSpace: "nowrap",
					width: "30rem",
				}}
				className={buttonClass}
			>
				This button is far wider than its clipping parent
			</button>
		</div>
	),
	play: async ({ canvasElement }) => {
		const button = requireButton(canvasElement);
		const clipped = captureLayoutError(() => assertNotClipped(button));
		expect(clipped).not.toBeNull();
		expect(clipped?.message).toContain("clipped");
		// The composite audit must flag it too.
		const violations = captureLayoutError(() =>
			expectCanvasLayout(canvasElement, {
				interactiveSelector: "button",
				unclippedSelector: "button",
			}),
		);
		expect(violations).not.toBeNull();
	},
};

/**
 * Positive case: a control below the fold of a scrollable body inside an
 * `overflow:hidden` shell (the whole-dialog shape — `DialogShell` root is
 * `overflow:hidden`, `[data-dialog-content]` scrolls). The control's
 * border box extends past the shell, but the scrollport owns that clip:
 * the control is reachable by scrolling, so no ancestor may flag it.
 * Guards the scroll-aware clip accounting in `isClippedByHiddenAncestor`.
 */
export const ScrolledBodyInsideClippedShell: Story = {
	render: () => (
		<div
			className={css({
				position: "relative",
				height: "12rem",
				width: "20rem",
				overflow: "hidden",
				borderWidth: "hairline",
				borderStyle: "solid",
				borderColor: "border.default",
			})}
			data-testid="scroll-shell"
		>
			<div
				className={css({
					height: "100%",
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: "1",
					padding: "2",
				})}
				data-testid="scroll-body"
			>
				{Array.from({ length: 30 }, (_, i) => (
					<div key={i} style={{ height: "2rem" }}>
						Row {i}
					</div>
				))}
				<button type="button" className={buttonClass}>
					Below fold action
				</button>
			</div>
		</div>
	),
	play: async ({ canvasElement }) => {
		const button = requireButton(canvasElement);
		// The scrollport legitimately owns the below-fold clip.
		assertNotClipped(button);
		expectCanvasLayout(canvasElement);
	},
};

/** Anti-case: a control rendered outside the viewport is unreachable. */
export const ViewportEscape: Story = {
	render: () => (
		<div style={{ position: "relative", width: "10rem", height: "4rem" }}>
			<button
				type="button"
				className={buttonClass}
				style={{ position: "absolute", left: "1300px", top: "10px" }}
			>
				Off-screen
			</button>
		</div>
	),
	play: async ({ canvasElement }) => {
		const button = requireButton(canvasElement);
		const escaped = captureLayoutError(() => assertWithinViewport(button));
		expect(escaped).not.toBeNull();
		expect(escaped?.message).toContain("viewport");
	},
};

/** Anti-case: two controls occupying the same box cannot both be used. */
export const OverlappingControls: Story = {
	render: () => (
		<div style={{ position: "relative", width: "12rem", height: "3rem" }}>
			<button
				type="button"
				className={buttonClass}
				style={{ position: "absolute", left: 0, top: 0 }}
			>
				First
			</button>
			<button
				type="button"
				className={buttonClass}
				style={{ position: "absolute", left: "2rem", top: "0.5rem" }}
			>
				Second
			</button>
		</div>
	),
	play: async ({ canvasElement }) => {
		const buttons = Array.from(canvasElement.querySelectorAll("button"));
		expect(buttons).toHaveLength(2);
		const [first, second] = buttons;
		const overlap = captureLayoutError(() => assertNoOverlap(first, second));
		expect(overlap).not.toBeNull();
		expect(overlap?.message).toContain("overlaps");
	},
};

/**
 * Reference interaction-state contract: hover, focus and an ARIA selected
 * state must all be assertable on a real rendered control. Component
 * stories apply the same pattern (see Button/SegmentedControl stories).
 */
export const InteractiveStates: Story = {
	render: () => (
		<div className={cardClass}>
			<button type="button" className={buttonClass} aria-pressed="false">
				Toggleable action
			</button>
		</div>
	),
	play: async ({ canvasElement }) => {
		const button = requireButton(canvasElement);
		expectCanvasLayout(canvasElement, { interactiveSelector: "button" });

		const { userEvent } = await import("vitest/browser");

		// Hover: :hover matches and a painted style may change.
		await userEvent.hover(button);
		expect(button.matches(":hover")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Focus: real focus reaches the control.
		await userEvent.click(button);
		expect(button.matches(":focus")).toBe(true);

		// Selected: ARIA state is machine-checkable.
		expect(button.getAttribute("aria-pressed")).toBe("false");
		button.setAttribute("aria-pressed", "true");
		expect(button.getAttribute("aria-pressed")).toBe("true");

		// Audit still passes with the control in its interacted state.
		expectCanvasLayout(canvasElement, {
			interactiveSelector: INTERACTIVE_SELECTOR,
		});
	},
};
