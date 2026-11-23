import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";
import {
	type LoadPhase,
	PresetsDialogHeader,
	type PresetViewMode,
} from "./PresetsDialogHeader";

type Args = {
	filter: string;
	// `"loaded"` is the terminal phase `ListDialog` passes once the
	// catalog read finishes — a filtered, settled header never stays
	// on `"idle"` (#455).
	loadPhase: LoadPhase | "loaded";
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
			options: ["idle", "reading", "streaming", "loaded", "error"],
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
		loadPhase: "loaded",
		presetsLength: 12,
		visibleCount: 4,
	},
	play: async ({ canvasElement }) => {
		// #455: a filtered catalog shows the search term and the settled
		// count together — never the "Loading" status bar.
		const input = canvasElement.querySelector("input");
		expect(input?.value).toBe("header");
		const text = canvasElement.textContent ?? "";
		expect(text).toContain("4 items");
		expect(text).toContain("filtered");
		expect(text).not.toContain("Loading");
	},
};

export const ErrorState: Story = {
	args: { loadPhase: "error", loadError: "Failed to read catalog" },
};
