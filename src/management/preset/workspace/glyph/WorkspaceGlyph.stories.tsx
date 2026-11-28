import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import {
	presetIconCanvas,
	presetIconEmoji,
	presetIconImage,
	presetIconText,
} from "@/management/preset/contract";
import { expectFirstImageLoaded } from "@/storybook/await-image";
import { css } from "@/styled-system/css";
import { FramedPresetGlyph, WorkspacePresetGlyph } from "./WorkspaceGlyph";

const makePreset = (id: string, icon: Preset["icon"]): Preset => ({
	id,
	type: "preset",
	title: id,
	filePath: `ty-plus://${id}`,
	icon,
});

const baseArgs = {
	preset: makePreset("alpha", presetIconText("AB")),
};

const decoratorBoxClass = css({
	height: "32",
	width: "32",
	// Glyph frames measure themselves via ResizeObserver (#700); no
	// `container-type` is needed — and none exists on the CEF 99 host.
});

const meta = {
	title: "Preset/Workspace/Glyph",
	component: WorkspacePresetGlyph,
	args: baseArgs,
	argTypes: {
		preset: { control: false },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof baseArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Emoji: Story = {
	args: { preset: makePreset("emoji", presetIconEmoji("✨")) },
};

export const LongText: Story = {
	args: { preset: makePreset("long", presetIconText("Header")) },
	play: async ({ canvasElement }) => {
		// Issue #457: every rendered glyph line must stay inside the
		// 32px frame — previously `cqi` units resolved against the
		// viewport (no container) and the "Header" lines overflowed
		// top/bottom/right.
		const frame = canvasElement.querySelector<HTMLElement>(
			"[data-ws-preset-text-fit]",
		);
		if (!frame) throw new Error("text glyph not found");
		const frameRect = frame.getBoundingClientRect();
		const lines = frame.querySelectorAll<HTMLElement>("span > span");
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			const rect = line.getBoundingClientRect();
			expect(rect.top).toBeGreaterThanOrEqual(frameRect.top - 0.5);
			expect(rect.bottom).toBeLessThanOrEqual(frameRect.bottom + 0.5);
			expect(rect.left).toBeGreaterThanOrEqual(frameRect.left - 0.5);
			expect(rect.right).toBeLessThanOrEqual(frameRect.right + 0.5);
		}
	},
};

// Issue #673: kind badges are single words — they must render on ONE
// `nowrap` line inside the frame. The container-query font shrinks to
// fit instead of wrapping mid-word ("PLUGIN" → "PLU"/"GIN").
export const KindBadge: Story = {
	args: { preset: makePreset("badge", presetIconText("PLUGIN")) },
	// Issue #794: the bare glyph is chromeless by contract (the tile frame
	// supplies chrome in product), so a raw capture read "PLUGIN" as
	// floating text. Render it inside the framed glyph box — the same
	// chrome `PresetGlyphById surface="framed"` uses — to show the badge
	// in its intended container.
	render: (args) => (
		<FramedPresetGlyph
			preset={args.preset}
			boxClass={css({ height: "32", width: "32" })}
		/>
	),
	play: async ({ canvasElement }) => {
		const frame = canvasElement.querySelector<HTMLElement>(
			"[data-ws-preset-text-fit]",
		);
		if (!frame) throw new Error("text glyph not found");
		const lines = Array.from(
			frame.querySelectorAll<HTMLElement>(":scope > span > span"),
		);
		expect(lines).toHaveLength(1);
		const line = lines[0];
		expect(getComputedStyle(line).whiteSpace).toBe("nowrap");
		expect(line.textContent).toBe("PLUGIN");
		expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth + 1);
	},
};

export const Canvas: Story = {
	args: {
		preset: makePreset(
			"curve",
			presetIconCanvas({ cubic: [0.42, 0, 0.58, 1] }),
		),
	},
};

export const ImagePath: Story = {
	args: {
		preset: makePreset("img", presetIconImage("https://placehold.co/120")),
	},
	play: async ({ canvasElement }) => {
		await expectFirstImageLoaded(canvasElement);
	},
};

export const Missing: Story = {
	render: () => (
		<div className={decoratorBoxClass}>
			<WorkspacePresetGlyph
				preset={makePreset("missing", presetIconText("?"))}
			/>
		</div>
	),
};
