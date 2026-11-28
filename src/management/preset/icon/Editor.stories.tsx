import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { Preset } from "@/management/preset/contract";
import { presetIconText } from "@/management/preset/contract";
import {
	createPresetIconDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon/editor-state";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph/WorkspaceGlyph";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";
import { IconEditor } from "./Editor";

const basePreset: Preset = {
	id: "preview",
	type: "preset",
	title: "Preview",
	filePath: "ty-plus://preview",
	icon: presetIconText("PR"),
};

type Args = {
	iconType: "text" | "emoji" | "image";
	/**
	 * Container width in rem. The preview tile size must stay constant across
	 * widths — narrow containers reproduce the cramped right column that used
	 * to distort the preview grid.
	 */
	containerWidthRem: number;
};

const baseArgs: Args = {
	iconType: "text",
	containerWidthRem: 28,
};

const decoratorBoxClass = css({
	padding: "2",
});

const previewBoxClass = css({
	height: "full",
	width: "full",
});

/**
 * Issue #587 regression guard: the preview tile is a fixed 6rem square. It
 * must not stretch with the fields column height or shrink/grow with the
 * container width — `NarrowContainer` and `WideContainer` pin both axes.
 */
const expectFixedPreviewTile = (canvasElement: HTMLElement): void => {
	const tile = canvasElement.querySelector<HTMLElement>(
		'[aria-label="Icon preview"]',
	);
	if (!tile) throw new Error("icon preview tile not found");
	assertRendered(tile, { label: "icon preview tile" });
	const box = measureBox(tile);
	const rootFontSize = Number.parseFloat(
		getComputedStyle(document.documentElement).fontSize,
	);
	const rem =
		Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
	expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(box.width - 6 * rem)).toBeLessThanOrEqual(1);
	expect(Math.abs(box.height - 6 * rem)).toBeLessThanOrEqual(1);
};

const meta = {
	title: "Preset/Icon/Editor",
	args: baseArgs,
	argTypes: {
		iconType: {
			control: { type: "select" },
			options: ["text", "emoji", "image"],
		},
		containerWidthRem: {
			control: { type: "range", min: 14, max: 48, step: 2 },
		},
	},
	decorators: [
		(Story, context) => {
			const widthRem =
				(context.args as Args | undefined)?.containerWidthRem ??
				baseArgs.containerWidthRem;
			return (
				<div className={decoratorBoxClass} style={{ width: `${widthRem}rem` }}>
					<Story />
				</div>
			);
		},
	],
	render: (args: Args) => {
		const draft = createPresetIconDraft("PR");
		if (args.iconType === "emoji") draft.emoji = "✨";
		if (args.iconType === "image") draft.imagePath = "https://placehold.co/120";
		draft.type = args.iconType;
		// Issue #793: render the same `FramedPresetGlyph` production callers
		// pass — a bare "Preview" placeholder hid the actual icon tile from
		// review captures and made every preview finding unverifiable.
		return (
			<IconEditor
				draft={draft}
				onChange={() => undefined}
				browseDir="/preset/root"
				preview={
					<FramedPresetGlyph
						preset={{
							id: "icon-preview",
							type: "preset",
							// i18n-exempt: synthetic preset record title for the glyph preview, never rendered as a label
							title: "Preview",
							filePath: "ty-plus://icon-preview",
							icon: presetIconDraftToPresetIcon(draft) ?? {
								type: "text",
								param: { text: "?" },
							},
						}}
						boxClass={previewBoxClass}
					/>
				}
			/>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	// Issue #194: every rendered control (fields, browse button, preview)
	// must sit inside the viewport unclipped.
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		// Issue #778: the bg/text color swatches are identical chips — each
		// must carry a visible field label so users can tell which draft
		// color it edits (aria-label alone was not enough).
		const bg = canvasElement.querySelector<HTMLElement>(
			'[data-icon-swatch-field="background"]',
		);
		const fg = canvasElement.querySelector<HTMLElement>(
			'[data-icon-swatch-field="text"]',
		);
		if (!bg || !fg) throw new Error("labeled color swatch fields not found");
		expect(bg.textContent).toContain("Background");
		expect(fg.textContent).toContain("Text");
		expect(bg.querySelector('input[type="color"]')).not.toBeNull();
		expect(fg.querySelector('input[type="color"]')).not.toBeNull();
	},
};

export const Emoji: Story = {
	args: { iconType: "emoji" },
};

export const Image: Story = {
	args: { iconType: "image" },
};

/**
 * Narrow container: reproduces the cramped right column that used to make the
 * preview tile grow/shrink with field content height.
 */
export const NarrowContainer: Story = {
	args: { containerWidthRem: 16 },
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectFixedPreviewTile(canvasElement);
	},
};

/** Wide container: the preview tile must stay the same size as NarrowContainer. */
export const WideContainer: Story = {
	args: { containerWidthRem: 44 },
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectFixedPreviewTile(canvasElement);
	},
};

export const Unframed: Story = {
	render: () => (
		<IconEditor
			draft={createPresetIconDraft("AB")}
			onChange={() => undefined}
			browseDir="/preset/root"
			framed={false}
		/>
	),
};

export const WithPresetPreview: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
	render: () => {
		const draft = createPresetIconDraft("HD");
		return (
			<IconEditor
				draft={draft}
				onChange={() => undefined}
				browseDir="/preset/root"
				preview={
					<FramedPresetGlyph
						preset={{
							...basePreset,
							icon: presetIconDraftToPresetIcon(draft) ?? {
								type: "text",
								param: { text: "?" },
							},
						}}
						boxClass={previewBoxClass}
					/>
				}
			/>
		);
	},
};
