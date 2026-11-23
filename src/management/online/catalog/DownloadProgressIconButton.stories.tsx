import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";
import { DownloadProgressIconButton } from "./DownloadProgressIconButton";

const RING_CIRCUMFERENCE = 2 * Math.PI * 10;

// The ring fill eases toward its target over ~10 ticks; poll until the
// animated stroke-dashoffset reaches the expected percent.
async function expectRingPercent(
	canvasElement: HTMLElement,
	percent: number,
): Promise<void> {
	const expected = RING_CIRCUMFERENCE * (1 - percent / 100);
	await waitFor(() => {
		const circle = canvasElement.querySelector("circle[stroke-dasharray]");
		expect(circle).not.toBeNull();
		const offset = Number(circle?.getAttribute("stroke-dashoffset"));
		expect(Number.isFinite(offset)).toBe(true);
		expect(Math.abs(offset - expected)).toBeLessThan(0.5);
	});
}

type Args = {
	stage: "fetch" | "download" | "write" | "icon" | "register" | undefined;
	bytesLoaded?: number;
	bytesTotal?: number;
	isComplete: boolean;
	isError: boolean;
	isDownloaded: boolean;
	iconSize: number;
	onClick: () => void;
};

const baseArgs: Args = {
	stage: undefined,
	bytesLoaded: 0,
	bytesTotal: 0,
	isComplete: false,
	isError: false,
	isDownloaded: false,
	iconSize: 12,
	onClick: () => undefined,
};

const meta = {
	title: "Catalog/DownloadProgressIconButton",
	component: DownloadProgressIconButton,
	args: baseArgs,
	argTypes: {
		stage: {
			control: { type: "select" },
			options: [undefined, "fetch", "download", "write", "icon", "register"],
		},
		isComplete: { control: "boolean" },
		isError: { control: "boolean" },
		isDownloaded: { control: "boolean" },
		iconSize: { control: { type: "range", min: 6, max: 24, step: 1 } },
		onClick: { table: { disable: true } },
	},
	decorators: [
		(Story) => (
			<div style={{ padding: 16 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Fetching: Story = {
	// Real fetch events carry no byte counts, so the fill jumps to the end
	// of the fetch slice (5%) instead of sitting at 0%.
	args: { stage: "fetch", bytesLoaded: undefined, bytesTotal: undefined },
	play: async ({ canvasElement }) => {
		await expectRingPercent(canvasElement, 5);
	},
};

export const Downloading: Story = {
	args: { stage: "download", bytesLoaded: 500, bytesTotal: 1000 },
	play: async ({ canvasElement }) => {
		// download slice is 5–70; 500/1000 maps to 37.5%.
		await expectRingPercent(canvasElement, 37.5);
	},
};

export const Writing: Story = {
	args: { stage: "write", bytesLoaded: 800, bytesTotal: 1000 },
};

export const Complete: Story = {
	args: { isComplete: true },
};

export const InError: Story = {
	args: { isError: true },
};

export const AlreadyDownloaded: Story = {
	args: { isDownloaded: true },
};
