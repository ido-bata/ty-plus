import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useEffect } from "react";
import { expect } from "storybook/test";
import { View, type ViewProps } from "./View";

type Args = {
	onCompleted: ViewProps["onCompleted"];
};

const logCompleted: ViewProps["onCompleted"] = (detail) => {
	if (typeof console !== "undefined") {
		// eslint-disable-next-line no-console
		console.info("[onboarding] completed", detail);
	}
};

/**
 * Test-only wrapper that flips the onboarding View into its fullscreen variant
 * on mount by activating the header toggle. Storybook uses the wrapper to
 * render the expanded layout without depending on the Storybook viewport
 * controls.
 */
function FullscreenView({
	onCompleted,
}: {
	onCompleted: ViewProps["onCompleted"];
}): JSX.Element {
	useEffect(() => {
		const button = document.querySelector<HTMLButtonElement>(
			'[data-testid="onboarding-view-mode-toggle"]',
		);
		button?.click();
	}, []);
	return <View onCompleted={onCompleted} />;
}

const meta = {
	title: "Onboarding/View",
	component: View,
	argTypes: {
		onCompleted: {
			action: "completed",
			description:
				"Fired after the finish step writes settings, imports presets, and broadcasts the onboarding-completed shell message.",
		},
	},
	args: {
		onCompleted: logCompleted,
	},
	render: (args: Args) => (
		<div
			data-frame=""
			style={{
				position: "relative",
				width: 480,
				height: 480,
				border: "1px solid #3a3a3a",
				borderRadius: 4,
				overflow: "hidden",
				background: "#1f1f1f",
				// `transform` makes this frame the containing block for
				// `position: fixed` descendants, so the onboarding shell's
				// viewport-sized overlay stays inside the simulated panel
				// instead of covering the whole Storybook canvas (#451).
				transform: "translateZ(0)",
			}}
		>
			<View onCompleted={args.onCompleted ?? logCompleted} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/**
 * #451: the onboarding shell is `position: fixed` in production; inside
 * the story frame (a transform-containing-block) it must resolve to the
 * frame box, not the Storybook viewport.
 */
const expectShellInsideFrame = (canvasElement: HTMLElement): void => {
	const frame = canvasElement.querySelector<HTMLElement>("[data-frame]");
	const shell = canvasElement.querySelector<HTMLElement>(
		'[data-testid="onboarding-shell"]',
	);
	if (!frame || !shell) throw new Error("frame or onboarding shell not found");
	const frameRect = frame.getBoundingClientRect();
	const shellRect = shell.getBoundingClientRect();
	expect(shellRect.left).toBeGreaterThanOrEqual(frameRect.left - 0.5);
	expect(shellRect.top).toBeGreaterThanOrEqual(frameRect.top - 0.5);
	expect(shellRect.right).toBeLessThanOrEqual(frameRect.right + 0.5);
	expect(shellRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 0.5);
};

/**
 * Default state at the intro step. The intro animation runs in the canvas
 * below the welcome copy; the Next button advances the wizard.
 */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		// #451: Storybook i18n is english-fixed — the intro title must be
		// the English copy, never a stored-preference `ja` leftover.
		expect(
			canvasElement.querySelector('[data-testid="onboarding-title"]')
				?.textContent,
		).toContain("Welcome");
	},
};

/**
 * Larger viewport matching the production overlay size (max-w-sm ×
 * max-h-[420px]).
 */
export const ProductionSize: Story = {
	// Render `View` directly: the meta `render` already wraps stories in a
	// 480×480 frame, and stacking the 384×420 decorator on top would nest
	// two transformed frames (#451).
	render: (args: Args) => (
		<View onCompleted={args.onCompleted ?? logCompleted} />
	),
	decorators: [
		(Story) => (
			<div
				data-frame=""
				style={{
					position: "relative",
					width: 384,
					height: 420,
					border: "1px solid #3a3a3a",
					borderRadius: 8,
					overflow: "hidden",
					background: "#1f1f1f",
					transform: "translateZ(0)",
				}}
			>
				<Story />
			</div>
		),
	],
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
	},
};

/**
 * Fullscreen view-mode. The header toggle is activated on mount so the panel
 * renders in its expanded (non-modal) layout. The decorator sets an inner
 * viewport sized like the capture viewport; the inner `View` then fills that
 * viewport edge to edge. Height is capped at 720 because the capture
 * pipeline pins `page.viewport()` to 1280×720 for every story
 * (screenshot-capture.ts) — a taller frame would lose its footer (#451).
 */
export const Fullscreen: Story = {
	render: (args: Args) => (
		<div
			data-frame=""
			style={{
				position: "relative",
				width: 1280,
				height: 720,
				border: "1px solid #3a3a3a",
				borderRadius: 8,
				overflow: "hidden",
				background: "#1f1f1f",
				transform: "translateZ(0)",
			}}
		>
			<FullscreenView onCompleted={args.onCompleted ?? logCompleted} />
		</div>
	),
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		// Issue #541: the dialog used `width/height: screen` (100vw/100vh),
		// which includes the scrollbar and pushed the right/bottom edges
		// outside the frame. Assert the dialog box itself stays inside.
		const shell = canvasElement.querySelector<HTMLElement>(
			'[data-testid="onboarding-shell"]',
		);
		const frame = canvasElement.querySelector<HTMLElement>("[data-frame]");
		const dialog = shell?.firstElementChild as HTMLElement | null;
		if (!frame || !dialog) throw new Error("frame or dialog not found");
		const frameRect = frame.getBoundingClientRect();
		const dialogRect = dialog.getBoundingClientRect();
		expect(dialogRect.left).toBeGreaterThanOrEqual(frameRect.left - 0.5);
		expect(dialogRect.top).toBeGreaterThanOrEqual(frameRect.top - 0.5);
		expect(dialogRect.right).toBeLessThanOrEqual(frameRect.right + 0.5);
		expect(dialogRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 0.5);
	},
};
