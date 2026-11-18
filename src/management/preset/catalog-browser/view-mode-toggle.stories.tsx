import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import {
	type CatalogBrowserViewMode,
	CatalogBrowserViewModeToggle,
} from "./view-mode-toggle";

type Args = {
	viewMode: CatalogBrowserViewMode;
};

const baseArgs: Args = {
	viewMode: "icons",
};

const decoratorBoxClass = css({ padding: "2" });

const meta = {
	title: "Preset/CatalogBrowser/ViewModeToggle",
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
		<CatalogBrowserViewModeToggle
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
// contract (initial state coverage for the preset catalog browser).
const playViewMode =
	(expected: "list" | "icons") =>
	async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
		expectCanvasLayout(canvasElement);
		const buttons = Array.from(canvasElement.querySelectorAll("button"));
		expect(buttons).toHaveLength(2);
		const [listButton, iconButton] = buttons;
		expect(listButton.getAttribute("aria-pressed")).toBe(
			expected === "list" ? "true" : "false",
		);
		expect(iconButton.getAttribute("aria-pressed")).toBe(
			expected === "icons" ? "true" : "false",
		);
	};

export const IconView: Story = {
	args: { viewMode: "icons" },
	play: playViewMode("icons"),
};

export const ListView: Story = {
	args: { viewMode: "list" },
	play: playViewMode("list"),
};
