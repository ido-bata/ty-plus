import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #752 / #723 contract: every segmented strip stays on one
		// row — nowrap + horizontal scroll/compact labels, never wrapped
		// segments. Three strips (level / source / scope) share the panel.
		const strips =
			canvasElement.querySelectorAll<HTMLElement>('[role="toolbar"]');
		expect(strips.length).toBe(3);
		for (const strip of strips) {
			const style = getComputedStyle(strip);
			expect(style.flexWrap).toBe("nowrap");
			expect(["auto", "scroll"]).toContain(style.overflowX);
			const buttons = strip.querySelectorAll("button");
			expect(buttons.length).toBeGreaterThan(0);
			const tops = new Set(
				[...buttons].map((b) => Math.round(b.getBoundingClientRect().top)),
			);
			expect(tops.size, `segmented strip wrapped into ${tops.size} rows`).toBe(
				1,
			);
		}
		// Issue #752 (minor): the three filter strips must not consume
		// half the panel — assert the chrome stays under 50% of the 320px
		// story frame so the message list keeps the majority.
		const panel = canvasElement.firstElementChild as HTMLElement | null;
		if (panel) {
			let stripsHeight = 0;
			for (const strip of strips) {
				stripsHeight += strip.parentElement?.offsetHeight ?? 0;
			}
			const ratio = stripsHeight / panel.clientHeight;
			expect(
				ratio,
				`filter strips consume ${(ratio * 100).toFixed(0)}% of panel height`,
			).toBeLessThan(0.5);
		}
	},
};

export const ErrorsOnly: Story = {
	args: { filter: "error", messageCount: 5 },
};

export const Empty: Story = {
	args: { messageCount: 0 },
};

export const AutoscrollOff: Story = {
	args: { autoScroll: false },
};
