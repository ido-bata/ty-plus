import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useLayoutEffect, useRef } from "react";
import { expect } from "storybook/test";
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
			// LiveEditor keeps the cursor line's DOM text in sync with the
			// controlled value via useLayoutEffect (LiveEditor.tsx) — React
			// intentionally renders the span empty. Mirror that here so the
			// story shows the real editable-line state (#459).
			useLayoutEffect(() => {
				if (cursorRef.current) {
					cursorRef.current.textContent = split[idx] ?? "";
				}
			}, [split, idx]);
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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// The cursor line is the editable one and must show its raw text.
		const cursorLine = canvasElement.querySelector("[data-line='0']");
		expect(cursorLine?.textContent).toContain("# Title");
	},
};

export const Empty: Story = {
	args: { lines: "", cursorLineIndex: 0 },
};

export const LongBody: Story = {
	args: {
		lines:
			"## Section\n\nFirst paragraph with **strong** and _italic_.\n\n- bullet\n- bullet\n- bullet",
		cursorLineIndex: 1,
	},
	play: async ({ canvasElement }) => {
		// `_…_` is the renderer's italic syntax (render.ts) — `*…*` would
		// stay literal asterisks (#459).
		const em = canvasElement.querySelector("em");
		expect(em?.textContent).toBe("italic");
		expect(canvasElement.textContent).not.toContain("*italic*");
	},
};
