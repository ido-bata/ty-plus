import type { Meta, StoryObj } from "@storybook/react";

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

import { PresetInfoWidget } from "./preset";

// PresetInfoWidget renders the real production component. Its state →
// preset resolution goes through `catalogRefsForSurfaceIds` +
// `resolvePresetsForInfoByCatalogIds`, which read `state.presets`,
// `state.presetSelectedIds`, and `state.presetHoverId` — all driven by the
// `SurfaceState` fixture below. The `@/management/preset` barrel chain
// (WorkspacePresetGlyph → editor/textmate) is satisfied by the
// `ty-plus:inline-oniguruma-wasm` plugin that `.storybook/main.ts`
// re-adds to the preview build.

type Args = {
	mode: "empty" | "single" | "multi";
};

const layout: Layout = {
	id: "info-preset-story",
	widgetType: "info",
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

const makePreset = (id: string, title: string): Preset => ({
	id,
	type: "preset",
	title,
	filePath: `C:/presets/${id}.ffx`,
	description: `${title} description for the info widget story.`,
	icon: presetIconText(title.slice(0, 2).toUpperCase()),
});

const PRESETS: Preset[] = [
	makePreset("preset-glow", "Glow preset"),
	makePreset("preset-chroma", "Chroma key"),
	makePreset("preset-vignette", "Vignette"),
];

const buildState = (mode: Args["mode"]): SurfaceState => {
	const base = createInitialSurfaceState({ mode: "live" });
	if (mode === "empty") {
		return {
			...base,
			presets: PRESETS,
			presetSelectedIds: [],
			presetHoverId: null,
		};
	}
	if (mode === "multi") {
		return {
			...base,
			presets: PRESETS,
			presetSelectedIds: PRESETS.map((p) => p.id),
			presetHoverId: null,
		};
	}
	return {
		...base,
		presets: PRESETS,
		presetSelectedIds: [PRESETS[0].id],
		presetHoverId: null,
	};
};

const baseArgs: Args = {
	mode: "single",
};

const meta = {
	title: "Info/PresetInfo",
	args: baseArgs,
	argTypes: {
		mode: {
			control: { type: "inline-radio" },
			options: ["empty", "single", "multi"],
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
			<PresetInfoWidget
				state={buildState(args.mode)}
				layout={layout}
				grid={grid}
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Empty: Story = {
	args: { mode: "empty" },
};

// Bug-trigger state (Issue #87): non-empty selection. Before the fix,
// mounting PresetInfoWidget with a non-empty `presetSelectedIds` (or a
// non-null `presetHoverId`) caused the inline `useEffect` dep to fail
// Object.is on every render and triggered React error #185. After the
// fix (`useMemo` on `items`), this state mounts in a single commit.
// See `preset-render-loop.test.ts` for the static check and
// `preset.test.tsx` for the behavioral regression; this story renders the
// real widget so the state is exercised visually too.
export const BugTriggerSingle: Story = {
	name: "Bug-trigger state (single, Issue #87)",
	args: { mode: "single" },
};

export const HealthyEmpty: Story = {
	name: "Healthy state (empty, Issue #87)",
	args: { mode: "empty" },
};

export const Multi: Story = {
	args: { mode: "multi" },
};
