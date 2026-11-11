import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useEffect } from "react";
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
			style={{
				position: "relative",
				width: 480,
				height: 480,
				border: "1px solid #3a3a3a",
				borderRadius: 4,
				overflow: "hidden",
				background: "#1f1f1f",
			}}
		>
			<View onCompleted={args.onCompleted ?? logCompleted} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/**
 * Default state at the intro step. The intro animation runs in the canvas
 * below the welcome copy; the Next button advances the wizard.
 */
export const Default: Story = {};

/**
 * Larger viewport matching the production overlay size (max-w-sm ×
 * max-h-[420px]).
 */
export const ProductionSize: Story = {
	decorators: [
		(Story) => (
			<div
				style={{
					position: "relative",
					width: 384,
					height: 420,
					border: "1px solid #3a3a3a",
					borderRadius: 8,
					overflow: "hidden",
					background: "#1f1f1f",
				}}
			>
				<Story />
			</div>
		),
	],
};

/**
 * Fullscreen view-mode. The header toggle is activated on mount so the panel
 * renders in its expanded (non-modal) layout. The decorator sets an inner
 * viewport sized like an expanded CEP panel; the inner `View` then fills that
 * viewport edge to edge.
 */
export const Fullscreen: Story = {
	render: (args: Args) => (
		<div
			style={{
				position: "relative",
				width: 1280,
				height: 800,
				border: "1px solid #3a3a3a",
				borderRadius: 8,
				overflow: "hidden",
				background: "#1f1f1f",
			}}
		>
			<FullscreenView onCompleted={args.onCompleted ?? logCompleted} />
		</div>
	),
};
