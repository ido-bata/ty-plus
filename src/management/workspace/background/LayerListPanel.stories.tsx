import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Layer } from "@/management/workspace/background/contract";
import { LayerListPanel } from "@/management/workspace/background/LayerListPanel";
import { storyT } from "@/storybook/i18n-story-t";
import { css } from "@/styled-system/css";

type Args = {
	selectedIndex: number;
	showEmpty: boolean;
};

const noop = (): void => undefined;

const baseLayers: Layer[] = [
	{
		id: "layer-color",
		type: "color",
		enabled: true,
		opacity: 100,
		color: "#1e1e1e",
	},
	{
		id: "layer-pattern",
		type: "pattern",
		enabled: true,
		opacity: 80,
		patternType: "dots",
		patternColor: "#888888",
		patternBgColor: "transparent",
		patternSize: 6,
	},
	{
		id: "layer-image",
		type: "image",
		enabled: false,
		opacity: 50,
		imagePath: "/sample/preset/image.png",
		imageFit: "cover",
		imageRepeat: "no-repeat",
	},
];

const baseArgs: Args = {
	selectedIndex: 0,
	showEmpty: false,
};

const meta = {
	title: "Background/LayerListPanel",
	args: baseArgs,
	argTypes: {
		selectedIndex: { control: { type: "number", min: -1, max: 2 } },
		showEmpty: { control: "boolean" },
	},
	render: (args: Args) => {
		const layers = args.showEmpty ? [] : baseLayers;
		const selectedId = args.showEmpty
			? null
			: (layers[args.selectedIndex]?.id ?? null);
		return (
			<div
				className={css({
					display: "flex",
					height: "72",
					width: "72",
					flexDirection: "column",
					p: "2",
				})}
			>
				<LayerListPanel
					layers={layers}
					selectedLayerId={selectedId}
					onSelectLayer={noop}
					onToggleLayer={noop}
					onAddLayer={noop}
					onMoveLayer={noop}
					onRemoveLayer={noop}
					t={storyT("dialogs")}
				/>
			</div>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #536: the bottom action bar is a 3-column grid — each IconButton
// must stretch to its column like the add buttons above, not stay a small
// square pinned to the column's left edge.
const expectActionButtonsFillColumns = (canvasElement: HTMLElement): void => {
	const bar = canvasElement.querySelector<HTMLElement>(
		"[data-background-layer-actions]",
	);
	if (!bar) throw new Error("layer action bar not found");
	const barRect = bar.getBoundingClientRect();
	const buttons = Array.from(bar.querySelectorAll("button"));
	expect(buttons.length).toBe(3);
	// 3 columns + gap "1" x2; insets come from the computed padding so the
	// helper survives padding-tier changes (issue #768 aligned the action
	// bar's horizontal inset with the add bar's).
	const barStyle = getComputedStyle(bar);
	const inset =
		Number.parseFloat(barStyle.paddingLeft) +
		Number.parseFloat(barStyle.paddingRight);
	const columnWidth = (barRect.width - inset - 8) / 3;
	for (const button of buttons) {
		const rect = button.getBoundingClientRect();
		expect(Math.abs(rect.width - columnWidth)).toBeLessThanOrEqual(2);
	}
	const last = buttons[buttons.length - 1]?.getBoundingClientRect();
	const padRight = Number.parseFloat(getComputedStyle(bar).paddingRight);
	expect(
		Math.abs(barRect.right - padRight - (last?.right ?? 0)),
	).toBeLessThanOrEqual(2);
};

// Issue #768: reorder buttons disable at the list boundaries — the top
// layer's "move up" and the bottom layer's "move down" must render in the
// disabled state instead of looking actionable.
const expectBoundaryDisabled = (
	canvasElement: HTMLElement,
	expected: { up: boolean; down: boolean; remove: boolean },
): void => {
	const bar = canvasElement.querySelector<HTMLElement>(
		"[data-background-layer-actions]",
	);
	if (!bar) throw new Error("layer action bar not found");
	const buttons = Array.from(bar.querySelectorAll("button"));
	expect(buttons[0]?.disabled).toBe(expected.up);
	expect(buttons[1]?.disabled).toBe(expected.down);
	expect(buttons[2]?.disabled).toBe(expected.remove);
};

export const Default: Story = {
	// selectedIndex 0 = top layer: move up is a boundary no-op.
	play: async ({ canvasElement }) => {
		expectActionButtonsFillColumns(canvasElement);
		expectBoundaryDisabled(canvasElement, {
			up: true,
			down: false,
			remove: false,
		});
	},
};

export const NoSelection: Story = {
	args: { selectedIndex: -1 },
	play: async ({ canvasElement }) => {
		expectActionButtonsFillColumns(canvasElement);
		expectBoundaryDisabled(canvasElement, {
			up: true,
			down: true,
			remove: true,
		});
	},
};

export const Empty: Story = {
	args: { showEmpty: true, selectedIndex: -1 },
	play: async ({ canvasElement }) => {
		expectActionButtonsFillColumns(canvasElement);
		expectBoundaryDisabled(canvasElement, {
			up: true,
			down: true,
			remove: true,
		});
	},
};
