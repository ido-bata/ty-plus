import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { FontViewerWidget } from "@/function/widget/utility/font-viewer/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { boxWithin, measureBox } from "@/storybook/quality/layout";
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

const renderWidget = (args: Args) => (
	<div
		className={css({ padding: "3" })}
		style={{ width: args.widthPx, height: args.heightPx }}
	>
		<FontViewerWidget layout={layout} />
	</div>
);

const meta = {
	title: "WidgetUtility/FontViewer",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 240, max: 720 } },
		heightPx: { control: { type: "number", min: 240, max: 720 } },
	},
	render: renderWidget,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #516: the list region holds rows, the empty state and the host
// error — a global `opacity` dim made all of them look disabled.
const expectListRegionOpaque = (canvasElement: HTMLElement): void => {
	const list = canvasElement.querySelector<HTMLElement>(
		"[data-font-viewer-list]",
	);
	if (!list) throw new Error("font list region not found");
	expect(getComputedStyle(list).opacity).toBe("1");
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectListRegionOpaque(canvasElement);
	},
};

/** Narrow panel — the widget collapses the catalog into a scrollable list. */
export const Compact: Story = {
	args: { widthPx: 280, heightPx: 320 },
	render: (args: Args) => {
		// Headless Chromium does not expose `queryLocalFonts`, so the
		// "Load all system fonts…" CTA branch of FontViewerLoadHint would
		// never render here. Stub it for this story so the compact-height
		// contract below exercises the real CTA path (same approach as
		// FontViewer/Banners).
		const w = window as Window & {
			queryLocalFonts?: () => Promise<unknown[]>;
		};
		if (typeof w.queryLocalFonts !== "function") {
			w.queryLocalFonts = async () => [
				{ family: "Inter", fullName: "Inter Regular" },
			];
		}
		return renderWidget(args);
	},
	play: async ({ canvasElement }) => {
		expectListRegionOpaque(canvasElement);
		// Issue #675: at compact sizes the chrome banners must compress
		// instead of squeezing the result region into a clipped sliver.
		const list = canvasElement.querySelector<HTMLElement>(
			"[data-font-viewer-list]",
		);
		if (!list) throw new Error("font list region not found");
		expect(list.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
		// Issue #763: at compact heights the load hint compresses — the
		// "Load all system fonts…" CTA must remain inside the visible
		// banner box (the hint text scrolls, the action does not).
		const cta = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		).find((b) => /Load all system fonts/.test(b.textContent ?? ""));
		if (!cta) throw new Error("load-all-system-fonts CTA not found");
		const banner = cta.parentElement?.parentElement;
		if (!banner) throw new Error("load hint banner not found");
		expect(boxWithin(measureBox(cta), measureBox(banner), 1)).toBe(true);
		// Issue #474: the search placeholder must fit inside the input
		// without clipping mid-word (input placeholders cannot show an
		// ellipsis, so the text itself has to be short enough).
		const input = canvasElement.querySelector<HTMLInputElement>(
			'input[type="search"]',
		);
		if (!input) throw new Error("search input not found");
		const style = getComputedStyle(input);
		const ctx = document.createElement("canvas").getContext("2d");
		if (!ctx) throw new Error("2d context unavailable");
		ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		expect(ctx.measureText(input.placeholder).width).toBeLessThanOrEqual(
			input.clientWidth,
		);
	},
};
