import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useRef } from "react";
import { css } from "@/styled-system/css";

import { EditorLines } from "./EditorLines";

type Args = {
	lines: string;
	cursorLineIndex: number;
};

const baseArgs: Args = {
	lines: "# Title\n\nSome **bold** text.\n\n- item one\n- item two",
	cursorLineIndex: 0,
};

const decoratorBoxClass = css({
	width: "36rem",
	padding: "2",
	color: "text.primary",
});

const meta = {
	title: "Preset/Markdown/EditorLines",
	args: baseArgs,
	argTypes: {
		lines: { control: "text" },
		cursorLineIndex: { control: { type: "number", min: 0, max: 20, step: 1 } },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		function Harness(): JSX.Element {
			const cursorRef = useRef<HTMLSpanElement | null>(null);
			const split = args.lines.split("\n");
			const idx = Math.max(0, Math.min(args.cursorLineIndex, split.length - 1));
			return (
				<EditorLines
					lines={split}
					cursorLineIndex={idx}
					cursorLineRef={cursorRef}
				/>
			);
		}
		return <Harness />;
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Empty: Story = {
	args: { lines: "", cursorLineIndex: 0 },
};

export const LongBody: Story = {
	args: {
		lines:
			"## Section\n\nFirst paragraph with **strong** and *italic*.\n\n- bullet\n- bullet\n- bullet",
		cursorLineIndex: 1,
	},
};
