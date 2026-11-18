import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import "@/function/widget/registry";
import { WidgetHelpOverlay } from "./WidgetHelpOverlay";

const meta = {
	title: "Management/Tutorial/WidgetHelpOverlay",
	component: WidgetHelpOverlay,
	args: {
		widgetType: "easing",
	},
	decorators: [
		(Story) => (
			<div
				style={{
					position: "relative",
					width: 240,
					height: 160,
					border: "1px dashed #888",
				}}
			>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof WidgetHelpOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	// Issue #159: the help affordance opens an in-tile panel with the widget's
	// tutorial summary and ordered steps, then closes again.
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The decorator renders only this overlay, so the help affordance is
		// the single button before the panel opens (locale-agnostic query).
		const helpButton = canvas.getByRole("button");
		expect(helpButton).toHaveAttribute("aria-expanded", "false");
		expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();

		await userEvent.click(helpButton);
		const dialog = await canvas.findByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expectCanvasLayout(canvasElement);

		await userEvent.click(within(dialog).getByRole("button"));
		await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
	},
};

export const WithoutTutorial: Story = {
	args: {
		widgetType: "not-a-real-widget",
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.queryByRole("button")).not.toBeInTheDocument();
	},
};
