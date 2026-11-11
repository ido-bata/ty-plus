import type { Meta, StoryObj } from "@storybook/react";
import { DownloadProgressIconButton } from "./DownloadProgressIconButton";

type Args = {
	stage: "fetch" | "download" | "write" | "icon" | "register" | undefined;
	bytesLoaded: number;
	bytesTotal: number;
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
	args: { stage: "fetch", bytesLoaded: 0, bytesTotal: 100 },
};

export const Downloading: Story = {
	args: { stage: "download", bytesLoaded: 500, bytesTotal: 1000 },
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
