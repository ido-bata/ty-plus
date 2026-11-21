import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect } from "storybook/test";
import { FilterToggleButton } from "./FilterToggleButton";

type Args = {
	pressed: boolean;
	label: string;
	onClick: () => void;
};

const meta = {
	title: "DirectoryBrowser/FilterToggleButton",
	component: FilterToggleButton,
	args: {
		pressed: false,
		label: ".ffx",
		onClick: () => undefined,
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pressed: Story = {
	args: { pressed: true },
};

export const LongLabel: Story = {
	args: { label: ".aepreset" },
};

export const WithCallback: Story = {
	args: { pressed: false, label: "Click me" },
};

// Issue #146: selected-state capture. The component is controlled, so a
// stateful render wrapper flips `pressed` on a real-pointer click; the
// post-click pressed state (`aria-pressed` + the shared `ghost` variant)
// is what the screenshot pipeline captures.
export const ToggleOnClick: Story = {
	render: (args: Args) => {
		const [pressed, setPressed] = useState(false);
		return (
			<FilterToggleButton
				pressed={pressed}
				label={args.label}
				onClick={() => setPressed((p) => !p)}
			/>
		);
	},
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector("button");
		if (!button) throw new Error("toggle button not found");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(button);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(button.getAttribute("aria-pressed")).toBe("true");
	},
};
