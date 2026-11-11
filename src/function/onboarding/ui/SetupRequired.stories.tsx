import type { Meta, StoryObj } from "@storybook/react";
import { SetupRequired } from "./SetupRequired";

const meta = {
	title: "Onboarding/SetupRequired",
	component: SetupRequired,
	decorators: [
		(Story) => (
			<div
				style={{
					position: "relative",
					width: 480,
					height: 360,
					border: "1px solid #3a3a3a",
					borderRadius: 4,
					overflow: "hidden",
					background: "#1f1f1f",
				}}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof SetupRequired>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state with the manual URL unresolved (Storybook's `usePublicLink`
 * has no Supabase gateway or settings cache to populate from). The Open
 * Manual button falls back to the "Manual link unavailable" copy.
 */
export const Default: Story = {};

/**
 * Renders inside a tall viewport so the layout proportions of the
 * onboarding-shell grid match the production overlay.
 */
export const TallViewport: Story = {
	decorators: [
		(Story) => (
			<div
				style={{
					position: "relative",
					width: 640,
					height: 540,
					border: "1px solid #3a3a3a",
					borderRadius: 4,
					overflow: "hidden",
					background: "#1f1f1f",
				}}
			>
				<Story />
			</div>
		),
	],
};
