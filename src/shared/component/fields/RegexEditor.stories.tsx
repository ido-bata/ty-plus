import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { RegexEditor } from "./RegexEditor";

const meta = {
	title: "Shared/Fields/RegexEditor",
	component: RegexEditor,
	argTypes: {
		value: { control: "text" },
		placeholder: { control: "text" },
		disabled: { control: "boolean" },
		className: { control: "text" },
		onChange: { action: "changed" },
	},
	args: {
		value: "/foo(bar)?/gi",
		placeholder: "Regex source",
		onChange: () => {},
	},
} satisfies Meta<typeof RegexEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	play: ({ canvasElement }) => {
		const source = canvasElement.querySelector<HTMLInputElement>(
			'input[placeholder="Regex source"]',
		);
		const flags = canvasElement.querySelector<HTMLInputElement>(
			'input[placeholder="flags"]',
		);
		if (!source || !flags || !source.parentElement) {
			throw new Error("Regex fields did not render");
		}
		const columns = getComputedStyle(source.parentElement).gridTemplateColumns;
		if (columns.split(" ").length !== 12) {
			throw new Error(`Expected twelve grid columns, received ${columns}`);
		}
		const sourceBox = source.getBoundingClientRect();
		const flagsBox = flags.getBoundingClientRect();
		if (sourceBox.width <= flagsBox.width || sourceBox.right > flagsBox.left) {
			throw new Error("Regex fields must use non-overlapping 8:4 column spans");
		}
	},
};

export const PlainSourceOnly: Story = {
	args: {
		value: "abc\\d+",
	},
};

export const InvalidPattern: Story = {
	args: {
		value: "/[unclosed/zz",
	},
};

export const Disabled: Story = {
	args: {
		disabled: true,
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState("/(\\d{3})-(\\d{4})/g");
		return (
			<div style={{ width: 420 }}>
				<RegexEditor value={value} onChange={setValue} />
			</div>
		);
	},
	args: {},
};
