import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import {
	createInitialSurfaceState,
	type SurfaceState,
} from "@/management/workspace/core/state";
import type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";

import { QuickActionsWidget } from "./QuickActionsWidget";

// QuickActionsWidget renders the real production component. Palette rows
// come from `state.presets` (the CEP Node file browser is absent under
// Storybook, so `canUseCepNodeFileBrowser` returns false and the
// root-file / plugin-effect indexes stay empty — the same code path the
// widget takes before the candidates cache boots). The dropdown portals
// to `document.body`, so plays assert against `document`, not the canvas.

type Args = {
	catalog: "sample" | "empty";
};

const layout: Layout = {
	id: "quick-actions-story",
	widgetType: "quick-actions",
	x: 0,
	y: 0,
	width: 6,
	height: 3,
};

const grid: GridSettings = {
	cellSize: 64,
	gap: 4,
	radius: 4,
};

const makePreset = (
	id: string,
	title: string,
	type: Preset["type"],
): Preset => ({
	id,
	type,
	title,
	filePath: `C:/presets/${id}.${type === "script" ? "jsx" : type === "plugin" ? "aex" : "ffx"}`,
	icon: presetIconText(title.slice(0, 2).toUpperCase()),
});

const SAMPLE_PRESETS: Preset[] = [
	makePreset("preset-glow", "Glow preset", "preset"),
	makePreset("script-grade", "Film grade script", "script"),
	makePreset("plugin-blur", "Blur suite", "plugin"),
	makePreset("preset-chroma", "Chroma key", "preset"),
];

const buildState = (catalog: Args["catalog"]): SurfaceState => {
	const base = createInitialSurfaceState({ mode: "live" });
	return {
		...base,
		presets: catalog === "sample" ? SAMPLE_PRESETS : [],
	};
};

const baseArgs: Args = {
	catalog: "sample",
};

const SEARCH_PLACEHOLDER =
	"Search presets, scripts, plugins, effects, and files under roots…";

const findSearchInput = (canvasElement: HTMLElement): HTMLInputElement => {
	const input = canvasElement.querySelector<HTMLInputElement>(
		`input[placeholder="${SEARCH_PLACEHOLDER}"]`,
	);
	if (!input) throw new Error("quick actions search input not found");
	return input;
};

const paletteRows = (): NodeListOf<HTMLElement> =>
	document.body.querySelectorAll<HTMLElement>("[data-palette-index]");

const meta = {
	title: "QuickActions/ActionList",
	args: baseArgs,
	argTypes: {
		catalog: {
			control: { type: "inline-radio" },
			options: ["sample", "empty"],
		},
	},
	render: (args: Args) => (
		<div
			className={css({
				height: "220",
				width: "320",
				display: "flex",
				flexDirection: "column",
			})}
		>
			<QuickActionsWidget
				state={buildState(args.catalog)}
				layout={layout}
				grid={grid}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Closed: Story = {};

// Focusing the search field opens the palette portal with one row per
// catalog preset (root-file and effect indexes are empty without the CEP
// Node file browser).
export const Open: Story = {
	play: async ({ canvasElement }) => {
		const { userEvent } = await import("vitest/browser");
		const input = findSearchInput(canvasElement);
		await userEvent.click(input);
		await waitFor(() => {
			expect(paletteRows().length).toBe(SAMPLE_PRESETS.length);
		});
	},
};

export const EmptyResults: Story = {
	args: { catalog: "empty" },
	play: async ({ canvasElement }) => {
		const { userEvent } = await import("vitest/browser");
		const input = findSearchInput(canvasElement);
		await userEvent.click(input);
		await waitFor(() => {
			expect(
				document.body.textContent?.includes("No matching presets or effects."),
			).toBe(true);
		});
		expect(paletteRows().length).toBe(0);
	},
};

export const WithQuery: Story = {
	play: async ({ canvasElement }) => {
		const { userEvent } = await import("vitest/browser");
		const input = findSearchInput(canvasElement);
		await userEvent.click(input);
		await userEvent.keyboard("glow");
		await waitFor(() => {
			expect(paletteRows().length).toBe(1);
		});
		const row = paletteRows()[0];
		expect(row?.textContent).toContain("Glow preset");
	},
};
