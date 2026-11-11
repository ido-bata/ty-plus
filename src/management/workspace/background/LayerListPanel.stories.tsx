import type { Meta, StoryObj } from "@storybook/react";
import type { Layer } from "@/management/workspace/background/contract";
import { LayerListPanel } from "@/management/workspace/background/LayerListPanel";
import { css } from "@/styled-system/css";

type Args = {
	selectedIndex: number;
	showEmpty: boolean;
};

const noop = (): void => undefined;
const stubT = (key: string, options?: Record<string, unknown>): string => {
	if (
		options &&
		"defaultValue" in options &&
		typeof options.defaultValue === "string"
	) {
		return options.defaultValue as string;
	}
	return key;
};

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
					t={stubT}
				/>
			</div>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const NoSelection: Story = {
	args: { selectedIndex: -1 },
};

export const Empty: Story = {
	args: { showEmpty: true, selectedIndex: -1 },
};
