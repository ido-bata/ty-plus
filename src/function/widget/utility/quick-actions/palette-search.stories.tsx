import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";

import { PaletteSearch } from "./palette-search";

type Args = {
	value: string;
	placeholder: string;
	focused: boolean;
};

const noop = (): void => undefined;

const baseArgs: Args = {
	value: "",
	placeholder: "Search quick actions",
	focused: false,
};

const meta = {
	title: "QuickActions/PaletteSearch",
	args: baseArgs,
	argTypes: {
		value: { control: "text" },
		placeholder: { control: "text" },
		focused: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div style={{ width: 320, padding: 12 }}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		const anchorRef = useRef<HTMLDivElement | null>(null);
		const inputRef = useRef<HTMLInputElement | null>(null);
		return (
			<PaletteSearch
				anchorRef={anchorRef}
				inputRef={inputRef}
				value={args.value}
				placeholder={args.placeholder}
				instanceAttr={{}}
				onChange={noop}
				onFocus={noop}
				onBlur={noop}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithQuery: Story = {
	args: { value: "glow" },
};

export const CustomPlaceholder: Story = {
	args: { placeholder: "Type to search presets…" },
};
