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
import {
	assertMatchesWidth,
	expectContainerWidthTracking,
} from "@/storybook/quality/fit";
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

// Keep in sync with `quickActions.palettePlaceholder` (en locale) — the
// placeholder was shortened in #769 so it no longer clips mid-word in the
// 320px widget frame.
const SEARCH_PLACEHOLDER = "Search presets, effects, and files…";

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
		// The dropdown anchors to the search field, so its top edge sits a
		// few pixels below the input — not at the widget's bottom edge
		// (Issue #668 regression).
		const dropdown = paletteRows()[0]?.closest(
			'[role="presentation"]',
		)?.parentElement;
		expect(dropdown).not.toBeNull();
		const inputBottom = input.getBoundingClientRect().bottom;
		const dropdownTop = dropdown?.getBoundingClientRect().top ?? 0;
		expect(dropdownTop).toBeGreaterThanOrEqual(inputBottom);
		expect(dropdownTop - inputBottom).toBeLessThan(24);
	},
};

// Issue #721: the palette-search wrapper must keep tracking the widget's
// width. PR #668's `flexShrink: 0` (no grow, no explicit width) collapsed
// the wrapper to content width on CEP/CEF, so the search input rendered
// fixed-size instead of following the widget. Assert the full-width
// contract (Panda emits readable atomic classes) and that the wrapper
// width tracks a container resize. `flexGrow` must stay 0 — growing the
// wrapper vertically would re-break the #668 palette anchoring.
export const SearchFieldTracksWidgetWidth: Story = {
	play: async ({ canvasElement }) => {
		const input = findSearchInput(canvasElement);
		const widgetRoot = canvasElement.querySelector<HTMLElement>(
			"[data-widget-quick-actions]",
		);
		if (!widgetRoot) throw new Error("quick actions widget root not found");
		// input → SearchField root → palette-search anchor wrapper.
		const wrapper = input.parentElement?.parentElement;
		if (!wrapper) throw new Error("palette search wrapper not found");
		const frame = widgetRoot.parentElement;
		if (!(frame instanceof HTMLElement)) {
			throw new Error("widget frame not found");
		}
		// Issue #726: the shared rendered-fit contract owns the
		// width-equality and resize-tracking halves of this check.
		assertMatchesWidth(wrapper, widgetRoot);
		expect(wrapper.className.split(/\s+/)).toContain("w_full");
		expect(Number.parseFloat(getComputedStyle(wrapper).flexGrow)).toBe(0);
		// The wrapper tracks the widget, which itself fills the frame —
		// preserve whatever ratio the resting layout establishes.
		await expectContainerWidthTracking(frame, wrapper, {
			resizeTo: "180px",
			tolerance: 2,
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

// Issue #166: palette rows select on hover (`onMouseEnter` → `onSelect`)
// — the selected row repaints to `interactive.hover`. The post-play
// hovered row is what the capture pipeline screenshots. The dropdown
// portals to `document.body`, so assertions run against `document`.
export const RowHoverSelects: Story = {
	play: async ({ canvasElement }) => {
		const { userEvent } = await import("vitest/browser");
		const input = findSearchInput(canvasElement);
		await userEvent.click(input);
		await waitFor(() => {
			expect(paletteRows().length).toBe(SAMPLE_PRESETS.length);
		});
		// Row 0 is the default active index, so hover the last row — its
		// resting surface must differ from the selected `interactive.hover`.
		const rows = paletteRows();
		const row = rows[rows.length - 1];
		const hitArea = row?.querySelector("button");
		if (!row || !hitArea) throw new Error("palette row not found");
		const resting = getComputedStyle(row).backgroundColor;
		await userEvent.hover(hitArea);
		await waitFor(() => {
			expect(getComputedStyle(row).backgroundColor).not.toBe(resting);
		});
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
