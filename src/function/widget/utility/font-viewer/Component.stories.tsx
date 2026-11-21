import type { Meta, StoryObj } from "@storybook/react";

import { FontViewerWidget } from "@/function/widget/utility/font-viewer/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { css } from "@/styled-system/css";

/**
 * Story for the shipped font-viewer widget.
 *
 * The `FontViewer/Banners`, `FontViewer/SampleRow` and `FontViewer/StatusLine`
 * stories render the extracted pieces. They are rendered *by* the shipped
 * widget now, so this story shows the composed widget the panel actually
 * mounts.
 *
 * LIMITATION: the widget reads the After Effects font list through the CEP
 * host bundle, which is not available in the browser runtime Storybook runs
 * in. The AE host therefore reports an error and the widget falls back to the
 * browser font sources (`document.fonts`), plus the "Load all system fonts…"
 * CTA when the Chromium build exposes `queryLocalFonts`.
 */
const layout: Layout = {
	id: "font-viewer-storybook-1",
	widgetType: "font-viewer",
	x: 0,
	y: 0,
	width: 6,
	height: 4,
};

type Args = {
	widthPx: number;
	heightPx: number;
};

const baseArgs: Args = {
	widthPx: 480,
	heightPx: 420,
};

const meta = {
	title: "WidgetUtility/FontViewer",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 240, max: 720 } },
		heightPx: { control: { type: "number", min: 240, max: 720 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{ width: args.widthPx, height: args.heightPx }}
		>
			<FontViewerWidget layout={layout} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

/** Narrow panel — the widget collapses the catalog into a scrollable list. */
export const Compact: Story = {
	args: { widthPx: 280, heightPx: 320 },
};
