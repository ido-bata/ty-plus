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
			// Issue #764: when a strip overflows, the edge clips the last
			// visible segment — that is only acceptable because the strip
			// scrolls, and the scroll affordance must be visible at rest.
			// The global scrollbar chrome hides thumbs until hover, so the
			// segmented strip opts its thumb back in.
			if (strip.scrollWidth > strip.clientWidth + 1) {
				const thumb = getComputedStyle(strip, "::-webkit-scrollbar-thumb");
				expect(
					thumb.visibility,
					"overflowing segmented strip hides its scrollbar thumb at rest",
				).toBe("visible");
				// Issue #796: the default 4px muted thumb still read as "no
				// scroll cue" — the strip opts into a taller scrollbar so
				// overflow stays discoverable at rest.
				const bar = getComputedStyle(strip, "::-webkit-scrollbar");
				expect(
					parseFloat(bar.height),
					"overflowing segmented strip keeps the default 4px scrollbar",
				).toBeGreaterThanOrEqual(6);
			}
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
		// Issue #764: the autoscroll toggle is a pressed-state button —
		// with autoScroll on it must expose the shared `data-active`
		// surface so the on state is not a passive-looking icon.
		const toggle = canvasElement.querySelector("button[data-active]");
		expect(
			toggle,
			"auto-scroll toggle missing its active/pressed surface",
		).not.toBeNull();
	},
};

export const ErrorsOnly: Story = {
	args: { filter: "error", messageCount: 5 },
};

export const Empty: Story = {
	args: { messageCount: 0 },
	play: async ({ canvasElement }) => {
		// Issue #764: an empty console must show an explicit placeholder,
		// not a dead region.
		const empty = canvasElement.querySelector("[data-debug-empty]");
		expect(empty, "empty-state placeholder not rendered").not.toBeNull();
		expect(empty?.textContent?.trim().length).toBeGreaterThan(0);
	},
};

export const AutoscrollOff: Story = {
	args: { autoScroll: false },
	play: async ({ canvasElement }) => {
		// Companion to Default: with autoScroll off the toggle must NOT
		// carry the active surface.
		const toggle = canvasElement.querySelector("button[data-active]");
		expect(
			toggle,
			"auto-scroll toggle shows the active surface while disabled",
		).toBeNull();
	},
};
