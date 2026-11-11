import type { Meta, StoryObj } from "@storybook/react";

import type { LogMessage } from "@/management/debug/console/types";

import { type FilterLevel, Panel } from "./Panel";

const makeMessage = (
	level: LogMessage["level"],
	text: string,
	offsetMs: number,
	source?: string,
): LogMessage => ({
	id: `story-${level}-${offsetMs}`,
	level,
	text,
	args: [],
	timestamp: new Date(Date.now() + offsetMs),
	source: source ?? "story",
});

const sampleMessages: readonly LogMessage[] = [
	makeMessage("info", "Debug console booted", 0, "boot"),
	makeMessage("log", "selected 3 entries", 1000, "directory-browser"),
	makeMessage("info", "loaded preset catalog (12 items)", 2000, "catalog"),
	makeMessage("warn", "fallback renderer used", 3000, "workspace"),
	makeMessage("error", "thumbnail resolution failed", 4000, "thumbnail"),
	makeMessage("debug", "scrolled to bottom", 5000, "panel"),
];

type Args = {
	filter: FilterLevel;
	autoScroll: boolean;
	messageCount: number;
};

const baseArgs: Args = {
	filter: "all",
	autoScroll: true,
	messageCount: sampleMessages.length,
};

const renderPanel = (args: Args) => (
	<Panel
		messages={sampleMessages.slice(0, args.messageCount)}
		filter={args.filter}
		autoScroll={args.autoScroll}
		onFilterChange={() => undefined}
		onAutoScrollChange={() => undefined}
		onClear={() => undefined}
		onCommandExecute={() => undefined}
	/>
);

const meta = {
	title: "Debug/Console/Panel",
	args: baseArgs,
	argTypes: {
		filter: {
			control: { type: "inline-radio" },
			options: ["all", "log", "info", "warn", "error"],
		},
		autoScroll: { control: "boolean" },
		messageCount: { control: { type: "range", min: 0, max: 12, step: 1 } },
	},
	decorators: [
		(Story) => (
			<div style={{ height: 320, width: 360 }}>
				<Story />
			</div>
		),
	],
	render: renderPanel,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const ErrorsOnly: Story = {
	args: { filter: "error", messageCount: 5 },
};

export const Empty: Story = {
	args: { messageCount: 0 },
};

export const AutoscrollOff: Story = {
	args: { autoScroll: false },
};
