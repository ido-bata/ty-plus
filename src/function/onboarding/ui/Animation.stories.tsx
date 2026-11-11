import type { Meta, StoryObj } from "@storybook/react";
import { Animation } from "./Animation";

type Args = {
	variant: "intro" | "workspace";
};

const meta = {
	title: "Onboarding/Animation",
	component: Animation,
	argTypes: {
		variant: {
			control: { type: "inline-radio" },
			options: ["intro", "workspace"],
			description:
				"Animation variant. `intro` is the high-contrast welcome pattern; `workspace` uses lower alpha to read as a background flourish.",
		},
	},
	args: {
		variant: "intro",
	},
	decorators: [
		(Story) => (
			<div
				style={{
					width: 480,
					height: 112,
					border: "1px solid #3a3a3a",
					borderRadius: 4,
					background: "#1f1f1f",
				}}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/**
 * Default intro animation. The canvas runs a `requestAnimationFrame` loop
 * until the user has `prefers-reduced-motion: reduce` set, in which case
 * the canvas stays empty (decorative).
 */
export const Default: Story = {};

/**
 * Lower-alpha workspace variant used inside the workspace preview step.
 */
export const Workspace: Story = {
	args: { variant: "workspace" },
};
