import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { assertContrast } from "@/storybook/quality/color";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { type ViewMode, ViewModeToggle } from "./ViewModeToggle";

type Args = {
	viewMode: ViewMode;
};

const baseArgs: Args = {
	viewMode: "icons",
};

const decoratorBoxClass = css({ padding: "2" });

const meta = {
	title: "Shared/Controls/ViewModeToggle",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<ViewModeToggle
			viewMode={args.viewMode}
			onViewModeChange={() => undefined}
			onEnterIconView={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #194: selected-state contract — `aria-pressed` must reflect
// `viewMode` on both buttons and the toggle must satisfy the layout
// contract.
const playViewMode =
	(expected: "list" | "icons") =>
	async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
		expectCanvasLayout(canvasElement);
		const fieldset = canvasElement.querySelector("fieldset");
		const buttons = Array.from(canvasElement.querySelectorAll("button"));
		expect(buttons).toHaveLength(2);
		const [listButton, iconButton] = buttons;
		expect(listButton.getAttribute("aria-pressed")).toBe(
			expected === "list" ? "true" : "false",
		);
		expect(iconButton.getAttribute("aria-pressed")).toBe(
			expected === "icons" ? "true" : "false",
		);

		// Issue #454: no whole-control opacity dim, the selected button
		// must read as a distinct surface, and both icon states must keep
		// at least 3:1 contrast against their effective background.
		if (!fieldset) throw new Error("view mode toggle fieldset not found");
		expect(getComputedStyle(fieldset).opacity).toBe("1");
		const activeButton = expected === "list" ? listButton : iconButton;
		const inactiveButton = expected === "list" ? iconButton : listButton;
		const activeBg = getComputedStyle(activeButton).backgroundColor;
		const inactiveBg = getComputedStyle(inactiveButton).backgroundColor;
		expect(activeBg).not.toBe(inactiveBg);
		assertContrast(activeButton, activeButton, { backdrop: fieldset });
		assertContrast(inactiveButton, fieldset);
	};

export const IconView: Story = {
	args: { viewMode: "icons" },
	play: playViewMode("icons"),
};

export const ListView: Story = {
	args: { viewMode: "list" },
	play: playViewMode("list"),
};
