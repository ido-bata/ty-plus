import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { css } from "@/styled-system/css";

import { MarkdownLiveEditor } from "./LiveEditor";

/**
 * Markdown live editor (Issue #610): the in-place rich-text editor used
 * by preset markdown surfaces. `value`/`onChange` are controlled; the
 * stories pin the populated and placeholder states.
 */

const SAMPLE = `# Changelog

- Fixed glyph scaling on small tiles
- Added multi-segment easing preview

\`\`\`ts
const ok = true;
\`\`\`
`;

type Args = {
	value: string;
	disabled: boolean;
};

const baseArgs: Args = {
	value: SAMPLE,
	disabled: false,
};

const meta = {
	title: "Preset/Markdown/LiveEditor",
	args: baseArgs,
	argTypes: {
		value: { control: "text" },
		disabled: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div
				className={css({
					width: "96",
					padding: "4",
					backgroundColor: "surface.dialog",
				})}
			>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		const [value, setValue] = useState(args.value);
		return (
			<MarkdownLiveEditor
				aria-label="Markdown editor"
				value={value}
				onChange={setValue}
				disabled={args.disabled}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/** Populated editor with markdown content. */
export const Default: Story = {};

/** Empty value — placeholder overlay visible. */
export const Empty: Story = {
	args: { value: "" },
	render: (args: Args) => {
		const [value, setValue] = useState("");
		return (
			<MarkdownLiveEditor
				aria-label="Markdown editor"
				value={value}
				onChange={setValue}
				placeholder="Write markdown…"
				disabled={args.disabled}
			/>
		);
	},
};
