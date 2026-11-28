import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { expect } from "storybook/test";

import { measureBox } from "@/storybook/quality/layout";
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

/*
 * Issue #797 (re-check of the #728 contract): the SearchField must fill
 * its wrapper — a fixed-width field leaves dead space on the row. The
 * wrapper itself is `width: full`, so assert field ≈ wrapper.
 */
const expectSearchFieldFillsWrapper = (canvasElement: HTMLElement): void => {
	const input = canvasElement.querySelector("input");
	const fieldRoot = input?.parentElement;
	const wrapper = fieldRoot?.parentElement;
	if (!input || !fieldRoot || !wrapper) {
		throw new Error("palette search controls not found");
	}
	const fieldWidth = measureBox(fieldRoot).width;
	const wrapperWidth = measureBox(wrapper).width;
	expect(Math.abs(fieldWidth - wrapperWidth)).toBeLessThanOrEqual(1);
};

export const Default: Story = {
	play: ({ canvasElement }) => {
		expectSearchFieldFillsWrapper(canvasElement);
	},
};

export const WithQuery: Story = {
	args: { value: "glow" },
	play: ({ canvasElement }) => {
		expectSearchFieldFillsWrapper(canvasElement);
	},
};

export const CustomPlaceholder: Story = {
	args: { placeholder: "Type to search presets…" },
	play: ({ canvasElement }) => {
		expectSearchFieldFillsWrapper(canvasElement);
	},
};
