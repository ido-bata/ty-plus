import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { createPresetIconDraft } from "@/management/preset/icon/editor-state";
import { css } from "@/styled-system/css";
import { ConditionRuleCard } from "./ConditionRuleCard";
import type { ConditionRule } from "./condition-rule-helpers";

const baseRule: ConditionRule = {
	id: "rule-1",
	filterType: "name",
	pattern: "Header",
	matchMode: "contains",
	draft: createPresetIconDraft("RX"),
};

type Args = {
	filterType: ConditionRule["filterType"];
	pattern: string;
};

const baseArgs: Args = {
	filterType: "name",
	pattern: "Header",
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/Group/ConditionRuleCard",
	args: baseArgs,
	argTypes: {
		filterType: {
			control: { type: "select" },
			options: ["name", "path", "preset", "presetType"],
		},
		pattern: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		const rule: ConditionRule = {
			...baseRule,
			filterType: args.filterType,
			pattern: args.pattern,
		};
		return (
			<ConditionRuleCard
				rule={rule}
				index={0}
				candidatePresets={[
					{ id: "p1", title: "Header preset", filePath: "/preset/header.ffx" },
				]}
				candidateDirs={["/preset/header"]}
				busy={false}
				onChange={() => undefined}
				onRemove={() => undefined}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #767: the RULE ICON type tabs must claim the full width of
		// the editor's right column, matching the input/swatch rows below —
		// a content-sized strip left a dead gap on the right.
		const strip = canvasElement.querySelector<HTMLElement>(
			'div[role="toolbar"][aria-label="Icon type"]',
		);
		if (!strip) throw new Error("icon type strip not found");
		const host = strip.parentElement;
		if (!host) throw new Error("icon type strip host not found");
		const stripBox = strip.getBoundingClientRect();
		const hostBox = host.getBoundingClientRect();
		expect(Math.abs(stripBox.width - hostBox.width)).toBeLessThanOrEqual(1);
		// …and that column is the same width as the fields column under it.
		const fields = host.nextElementSibling;
		if (!fields) throw new Error("icon editor fields column not found");
		expect(
			Math.abs(hostBox.width - fields.getBoundingClientRect().width),
		).toBeLessThanOrEqual(1);
	},
};

export const PathFilter: Story = {
	args: { filterType: "path", pattern: "" },
};

export const PresetFilter: Story = {
	args: { filterType: "preset", pattern: "" },
	play: async ({ canvasElement }) => {
		// Issue #753: the candidate list is list-only — it must not render
		// the FileEntryList view-mode toggle in its footer.
		expect(
			canvasElement.querySelector('button[aria-label="Icon view"]'),
		).toBeNull();
		expect(
			canvasElement.querySelector('button[aria-label="List view"]'),
		).toBeNull();
		// The filter-type strip claims the row width (minus the remove
		// button) instead of sizing to its labels: it must fill its flex
		// host, which itself takes the row's remaining width.
		const strip = canvasElement.querySelector<HTMLElement>('[role="toolbar"]');
		if (!strip) throw new Error("filter segment strip not found");
		const host = strip.parentElement;
		if (!host) throw new Error("segment host not found");
		const stripBox = strip.getBoundingClientRect();
		const hostBox = host.getBoundingClientRect();
		expect(Math.abs(stripBox.width - hostBox.width)).toBeLessThanOrEqual(1);
		// ~28rem decorator minus card padding and the remove button.
		expect(hostBox.width).toBeGreaterThan(300);
	},
};

export const PresetTypeFilter: Story = {
	args: { filterType: "presetType", pattern: "" },
};
