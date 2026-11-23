import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect } from "storybook/test";
import { SetupRequired } from "./SetupRequired";

// #451: `SetupRequired` is `position: fixed; inset: 0` in production.
// `transform` on the frame makes it the containing block for fixed
// descendants, so the overlay resolves to the simulated panel size
// instead of covering the whole Storybook canvas. Each story renders
// its own frame — a shared meta decorator would nest frames and the
// inner (transformed) one would win the fixed-position containing
// block anyway.
const frameStyle = {
	position: "relative",
	border: "1px solid #3a3a3a",
	borderRadius: 4,
	overflow: "hidden",
	background: "#1f1f1f",
	transform: "translateZ(0)",
} as const;

const frame = (width: number, height: number): JSX.Element => (
	<div data-frame="" style={{ ...frameStyle, width, height }}>
		<SetupRequired />
	</div>
);

const expectOverlayInsideFrame = (canvasElement: HTMLElement): void => {
	const frameEl = canvasElement.querySelector<HTMLElement>("[data-frame]");
	const overlay = canvasElement.querySelector<HTMLElement>(
		'[data-testid="setup-required"]',
	);
	if (!frameEl || !overlay) throw new Error("frame or overlay not found");
	const frameRect = frameEl.getBoundingClientRect();
	const overlayRect = overlay.getBoundingClientRect();
	// `inset: 0` resolves against the frame's padding box, i.e. the
	// border box minus the 1px frame border on every side.
	expect(overlayRect.left).toBeCloseTo(frameRect.left + 1, 0);
	expect(overlayRect.top).toBeCloseTo(frameRect.top + 1, 0);
	expect(overlayRect.width).toBeCloseTo(frameRect.width - 2, 0);
	expect(overlayRect.height).toBeCloseTo(frameRect.height - 2, 0);
};

const meta = {
	title: "Onboarding/SetupRequired",
	component: SetupRequired,
	render: () => frame(480, 360),
} satisfies Meta<typeof SetupRequired>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state with the manual URL unresolved (Storybook's `usePublicLink`
 * has no Supabase gateway or settings cache to populate from). The Open
 * Manual button falls back to the "Manual link unavailable" copy.
 */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectOverlayInsideFrame(canvasElement);
	},
};

/**
 * Renders inside a tall viewport so the layout proportions of the
 * onboarding-shell grid match the production overlay.
 */
export const TallViewport: Story = {
	render: () => frame(640, 540),
	play: async ({ canvasElement }) => {
		expectOverlayInsideFrame(canvasElement);
	},
};
