import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { DialogBody } from "./DialogBody";

const sectionStyle = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	bg: "surface.widget",
	p: "3",
	fontSize: "shell-text-sm",
	color: "text.primary",
});

const meta = {
	title: "Shared/Shell/DialogBody",
	component: DialogBody,
	args: {
		children: null,
	},
	decorators: [
		(Story) => (
			<div style={{ height: 240, display: "flex", flexDirection: "column" }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof DialogBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: ({ canvasElement }) => {
		const section = Array.from(canvasElement.querySelectorAll("div")).find(
			(element) => element.textContent === "Section A",
		);
		const sheet = section?.parentElement;
		if (!sheet) throw new Error("Dialog sheet did not render");
		const style = getComputedStyle(sheet);
		if (
			Number.parseFloat(style.gap) <= 0 ||
			Number.parseFloat(style.paddingLeft) <= 0
		) {
			throw new Error("Dialog spacing tokens were not applied");
		}
	},
	render: () => (
		<DialogBody>
			<div className={sectionStyle}>Section A</div>
			<div className={sectionStyle}>Section B</div>
			<div className={sectionStyle}>Section C</div>
		</DialogBody>
	),
};

export const Overflow: Story = {
	render: () => (
		<DialogBody>
			{Array.from({ length: 24 }).map((_, i) => (
				<div key={i} className={sectionStyle}>
					Item {i + 1}
				</div>
			))}
		</DialogBody>
	),
};
