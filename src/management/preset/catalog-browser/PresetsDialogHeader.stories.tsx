import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";
import { PresetsDialogHeader } from "./PresetsDialogHeader";
import type { LoadPhase, PresetViewMode } from "./use-presets-catalog";

type Args = {
	filter: string;
	loadPhase: LoadPhase;
	loadError: string | null;
	streamTotal: number;
	presetsLength: number;
	visibleCount: number;
	viewMode: PresetViewMode;
};

const baseArgs: Args = {
	filter: "",
	loadPhase: "idle",
	loadError: null,
	streamTotal: 0,
	presetsLength: 12,
	visibleCount: 12,
	viewMode: "icons",
};

const decoratorBoxClass = css({
	width: "40rem",
	padding: "2",
});

const meta = {
	title: "Preset/CatalogBrowser/PresetsDialogHeader",
	args: baseArgs,
	argTypes: {
		filter: { control: "text" },
		loadPhase: {
			control: { type: "select" },
			options: ["idle", "reading", "streaming", "error"],
		},
		loadError: { control: "text" },
		streamTotal: { control: { type: "range", min: 0, max: 100, step: 1 } },
		presetsLength: { control: { type: "range", min: 0, max: 100, step: 1 } },
		visibleCount: { control: { type: "range", min: 0, max: 100, step: 1 } },
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<PresetsDialogHeader
			filter={args.filter}
			onFilterChange={() => undefined}
			onReload={() => undefined}
			loadPhase={args.loadPhase}
			loadError={args.loadError}
			streamTotal={args.streamTotal}
			presetsLength={args.presetsLength}
			visibleCount={args.visibleCount}
			viewMode={args.viewMode}
			onViewModeChange={() => undefined}
			onEnterIconView={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Loading: Story = {
	args: { loadPhase: "reading" },
};

export const Streaming: Story = {
	args: {
		loadPhase: "streaming",
		streamTotal: 50,
		presetsLength: 20,
		visibleCount: 20,
	},
};

export const Filtered: Story = {
	args: {
		filter: "header",
		presetsLength: 12,
		visibleCount: 4,
	},
};

export const ErrorState: Story = {
	args: { loadPhase: "error", loadError: "Failed to read catalog" },
};
