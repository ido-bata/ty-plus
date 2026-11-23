import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { FontViewerStatusLine } from "./FontViewerStatusLine";
import type { FontLoadVia } from "./use-font-catalog";

type Args = {
	loading: boolean;
	familyCount: number;
	filteredFaceCount: number;
	total: number;
	via: FontLoadVia | null;
};

const baseArgs: Args = {
	loading: false,
	familyCount: 48,
	filteredFaceCount: 120,
	total: 412,
	via: "after-effects",
};

const meta = {
	title: "FontViewer/StatusLine",
	component: FontViewerStatusLine,
	args: baseArgs,
	argTypes: {
		loading: { control: "boolean" },
		familyCount: { control: { type: "number", min: 0, max: 500 } },
		filteredFaceCount: { control: { type: "number", min: 0, max: 2000 } },
		total: { control: { type: "number", min: 0, max: 2000 } },
		via: {
			control: { type: "select" },
			options: [null, "after-effects", "queryLocalFonts", "documentFonts"],
		},
	},
	decorators: [
		(Story) => (
			<div style={{ width: 320, padding: 12 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

const expectOpaqueStatusLine = async (
	canvasElement: HTMLElement,
): Promise<void> => {
	const span = canvasElement.querySelector("span");
	expect(span).not.toBeNull();
	let node: Element | null = span;
	while (node) {
		expect(getComputedStyle(node).opacity).toBe("1");
		node = node.parentElement;
	}
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
	},
};

export const Loading: Story = {
	args: { loading: true },
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
	},
};

export const Empty: Story = {
	args: { familyCount: 0, filteredFaceCount: 0, total: 0, via: null },
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
	},
};

export const LocalApi: Story = {
	args: { via: "queryLocalFonts" },
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
	},
};
