import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { FeedbackSection } from "./FeedbackSection";

/**
 * Feedback section (Issue #610). Renders the real section body —
 * category/subject/preset/description form that composes a GitHub issue
 * URL on submit.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/FeedbackSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<FeedbackSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default empty feedback form. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		// Issue #791 (jobs6): the paired Category select and Preset ID input
		// share one row as two span-3 fields — equal widths, same row, and
		// adjacent cells separated only by the grid gap.
		const select = canvasElement.querySelector<HTMLElement>(
			"button[aria-haspopup='listbox']",
		);
		const presetInput = canvasElement.querySelector<HTMLInputElement>("input");
		expect(select).not.toBeNull();
		expect(presetInput).not.toBeNull();
		if (!select || !presetInput) return;
		const selectRect = select.getBoundingClientRect();
		const inputRect = presetInput.getBoundingClientRect();
		expect(Math.abs(selectRect.width - inputRect.width)).toBeLessThanOrEqual(1);
		expect(Math.abs(selectRect.top - inputRect.top)).toBeLessThanOrEqual(1);
		// Adjacent columns: the Preset ID box starts just after the Category
		// box plus the grid gap — no ragged overlap or dead band.
		const gutter = inputRect.left - selectRect.right;
		expect(gutter).toBeGreaterThan(0);
		expect(gutter).toBeLessThan(32);
	},
};
