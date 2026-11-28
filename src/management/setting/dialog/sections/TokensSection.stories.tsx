import type { Meta, StoryObj } from "@storybook/react";
import { fieldLabelClass } from "@ty-plus/ui";
import type { JSX } from "react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { TokensSection } from "./TokensSection";

/**
 * Design tokens section (Issue #610). Renders the real section body —
 * the densest settings surface (color / text / opacity / number token
 * editors grouped by category).
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/TokensSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<TokensSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/*
 * Issue #763: every token editor label must share the `fieldLabelClass`
 * treatment (title case, primary text). `TokenEditor` used to route its
 * label through `Input`'s uppercase muted `label` prop, so "TEXT RED
 * CHANNEL" sat next to "App Background" in the same grid. The first
 * child of each `[data-design-token-key]` wrapper is the label in all
 * three editor kinds (TokenEditor <label>, ColorField/NumberField div).
 */
const expectUniformTokenLabels = (canvasElement: HTMLElement): void => {
	const probe = document.createElement("div");
	probe.className = fieldLabelClass;
	document.body.appendChild(probe);
	const expected = getComputedStyle(probe);
	try {
		// `data-design-token-key` is set both on the TokensSection wrapper
		// and on TokenEditor's own root — keep only the innermost (leaf)
		// editors so each is measured exactly once.
		const all = Array.from(
			canvasElement.querySelectorAll("[data-design-token-key]"),
		);
		const leaves = all.filter(
			(el) => !el.querySelector("[data-design-token-key]"),
		);
		expect(leaves.length).toBeGreaterThan(0);
		for (const leaf of leaves) {
			// TokenEditor renders a real <label>; ColorField/NumberField
			// render a leading div inside their field root.
			const label =
				leaf.querySelector("label") ??
				leaf.firstElementChild?.firstElementChild ??
				null;
			if (!label) throw new Error("token editor label missing");
			const style = getComputedStyle(label);
			expect(style.textTransform).toBe(expected.textTransform);
			expect(style.fontWeight).toBe(expected.fontWeight);
			expect(style.color).toBe(expected.color);
			expect(style.fontSize).toBe(expected.fontSize);
		}
	} finally {
		probe.remove();
	}
};

/** Default token categories with default theme values. */
export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectUniformTokenLabels(canvasElement);
	},
};
