import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { assertContrast } from "@/storybook/quality/color";
import { measureBox } from "@/storybook/quality/layout";

import { FontViewerStatusLine } from "./FontViewerStatusLine";
import type { FontLoadVia } from "./use-font-catalog";

type Args = {
	loading: boolean;
	familyCount: number;
	filteredFaceCount: number;
	total: number;
	via: FontLoadVia | null;
};

const baseArgs: Args = {
	loading: false,
	familyCount: 48,
	filteredFaceCount: 120,
	total: 412,
	via: "after-effects",
};

const meta = {
	title: "FontViewer/StatusLine",
	component: FontViewerStatusLine,
	args: baseArgs,
	argTypes: {
		loading: { control: "boolean" },
		familyCount: { control: { type: "number", min: 0, max: 500 } },
		filteredFaceCount: { control: { type: "number", min: 0, max: 2000 } },
		total: { control: { type: "number", min: 0, max: 2000 } },
		via: {
			control: { type: "select" },
			options: [null, "after-effects", "queryLocalFonts", "documentFonts"],
		},
	},
	decorators: [
		(Story) => (
			<div style={{ width: 320, padding: 12 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

const expectOpaqueStatusLine = async (
	canvasElement: HTMLElement,
): Promise<void> => {
	const span = canvasElement.querySelector("span");
	expect(span).not.toBeNull();
	let node: Element | null = span;
	while (node) {
		expect(getComputedStyle(node).opacity).toBe("1");
		node = node.parentElement;
	}
};

// The status line is `text.muted` at 10px — legibility was questioned in
// visual review, so pin the WCAG ratio against the panel surface the
// widget actually sits on.
const expectStatusLineContrast = (canvasElement: HTMLElement): void => {
	const spans = canvasElement.querySelectorAll("span");
	expect(spans.length).toBeGreaterThan(0);
	for (const span of spans) {
		assertContrast(span, document.body, {
			minRatio: 4.5,
			label: "font viewer status line",
		});
	}
};

/*
 * Issue #797: the stats text and the provenance label must share one row —
 * previously the longer stats line pushed the `via` label onto a second
 * row, dropping the divider and making the status block a line taller
 * than the loading variant.
 */
const expectSingleStatusRow = (canvasElement: HTMLElement): void => {
	const spans = Array.from(canvasElement.querySelectorAll("span"));
	// `via: null` renders only the stats span — the single-row contract
	// only applies when the provenance label is present.
	if (spans.length < 2) return;
	const tops = spans.map((span) => measureBox(span).y);
	for (const top of tops) {
		expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(1);
	}
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
		expectStatusLineContrast(canvasElement);
		expectSingleStatusRow(canvasElement);
	},
};

export const Loading: Story = {
	args: { loading: true },
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
		expectStatusLineContrast(canvasElement);
		expectSingleStatusRow(canvasElement);
	},
};

export const Empty: Story = {
	args: { familyCount: 0, filteredFaceCount: 0, total: 0, via: null },
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
		expectStatusLineContrast(canvasElement);
		expectSingleStatusRow(canvasElement);
	},
};

export const LocalApi: Story = {
	args: { via: "queryLocalFonts" },
	play: async ({ canvasElement }) => {
		await expectOpaqueStatusLine(canvasElement);
		expectStatusLineContrast(canvasElement);
		expectSingleStatusRow(canvasElement);
	},
};
