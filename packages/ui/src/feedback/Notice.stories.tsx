import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { css } from "@/styled-system/css";

import { Notice } from "./Notice";

const meta = {
	title: "Shared/Feedback/Notice",
	component: Notice,
	argTypes: {
		tone: {
			control: { type: "select" },
			options: ["info", "success", "warning", "error"],
		},
		children: { control: "text" },
	},
	args: {
		tone: "info",
		children: "Something worth noting.",
	},
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

const stack = css({
	display: "flex",
	flexDirection: "column",
	gap: "3",
	maxWidth: "32rem",
});

export const Playground: Story = {};

export const Tones: Story = {
	render: (args) => (
		<div className={stack}>
			{(["info", "success", "warning", "error"] as const).map((tone) => (
				<Notice {...args} key={tone} tone={tone}>
					{tone} notice
				</Notice>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const tone of ["info", "success", "warning", "error"]) {
			expect(canvas.getByText(`${tone} notice`)).toBeVisible();
		}
	},
};

/**
 * Rich content: inline link inside a sentence plus a second paragraph.
 * Guards the regression where text nodes and anchors became separate
 * flex items and the sentence was split across columns.
 */
export const RichContent: Story = {
	render: () => (
		<div className={stack}>
			<Notice tone="warning" role="status">
				Release data is temporarily unavailable; showing the last published
				snapshot. Check{" "}
				<a href="https://github.com/ido-bata/ty-plus/releases">
					GitHub Releases
				</a>{" "}
				for the newest builds.
				<p>
					Beta and Insider builds are also published — see the changelog for the
					full list.
				</p>
			</Notice>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const link = canvas.getByRole("link", { name: "GitHub Releases" });
		expect(link).toBeVisible();
		// The link must share a flow block with surrounding text, not sit in
		// its own flex item: its parent must contain the sentence text node.
		const parent = link.parentElement as HTMLElement;
		expect(parent.textContent).toContain("snapshot. Check");
		expect(
			canvas.getByText(/Beta and Insider builds are also published/),
		).toBeVisible();
	},
};
