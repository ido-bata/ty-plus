import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import { css } from "@/styled-system/css";
import { GroupContainerCatalogTile } from "./ContainerCatalogTile";

// Mirrors `synthesizeGroupPresetForTile`: the badge count comes from
// `data.presetIds`, and `isGroupCatalogPreset` requires `data.groupId`.
// The old `{ members: [...] }` fixture matched neither, so every story
// rendered the same "0" badge.
const makeGroupPreset = (id: string, members: number): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon: presetIconText(id.slice(0, 2).toUpperCase() || "GP"),
	data: {
		groupId: id,
		presetIds: Array.from({ length: members }, (_, i) => `m${i}`),
	},
});

type Args = {
	id: string;
	members: number;
};

const baseArgs: Args = {
	id: "group-1",
	members: 5,
};

const decoratorBoxClass = css({
	height: "8rem",
	width: "8rem",
	backgroundColor: "surface.panel",
});

const meta = {
	title: "Preset/Group/ContainerCatalogTile",
	args: baseArgs,
	argTypes: {
		id: { control: "text" },
		members: { control: { type: "range", min: 0, max: 120, step: 1 } },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<GroupContainerCatalogTile
			preset={makeGroupPreset(args.id, args.members)}
			label={args.id}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #767: the member-count badge must center its count vertically —
// the bare `minHeight` pill used to pin the digits against the top edge.
const playBadgeCentered: Story["play"] = async ({ canvasElement }) => {
	const badge = canvasElement.querySelector<HTMLElement>(
		"[data-member-count-badge]",
	);
	if (!badge) throw new Error("member count badge not found");
	const range = document.createRange();
	range.selectNodeContents(badge);
	const textBox = range.getBoundingClientRect();
	const badgeBox = badge.getBoundingClientRect();
	const textCenter = (textBox.top + textBox.bottom) / 2;
	const badgeCenter = (badgeBox.top + badgeBox.bottom) / 2;
	expect(Math.abs(textCenter - badgeCenter)).toBeLessThanOrEqual(1);
};

export const Default: Story = { play: playBadgeCentered };

export const Many: Story = {
	args: { members: 25 },
	play: playBadgeCentered,
};

export const Overflow: Story = {
	args: { members: 150 },
	play: playBadgeCentered,
};

export const Empty: Story = {
	args: { members: 0 },
	play: playBadgeCentered,
};
