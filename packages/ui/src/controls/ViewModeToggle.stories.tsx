import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { borderTopColor, resolveBorderToken } from "@/storybook/quality/border";
import { assertContrast } from "@/storybook/quality/color";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { type ViewMode, ViewModeToggle } from "./ViewModeToggle";

type Args = {
	viewMode: ViewMode;
};

const baseArgs: Args = {
	viewMode: "icons",
};

const decoratorBoxClass = css({ padding: "2" });

/*
 * Issue #798: the toggle's whole purpose is switching the content below
 * it, but the bare stories rendered only the control — the icon-view and
 * list-view captures were pixel-near-identical and read as an empty
 * canvas. Each story now shows a small mock panel in the mode it names
 * so the capture demonstrates the state it claims.
 */
const storyRowClass = css({
	display: "flex",
	gap: "3",
	alignItems: "flex-start",
});
const mockPanelClass = css({
	width: "56",
	flexShrink: 0,
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	backgroundColor: "surface.panel",
	padding: "2",
});
const mockGridClass = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, 1fr)",
	gap: "1.5",
});
const mockTileClass = css({
	aspectRatio: "1 / 1",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
});
const mockListClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1.5",
});
const mockRowClass = css({
	display: "flex",
	alignItems: "center",
	gap: "1.5",
});
const mockGlyphClass = css({
	width: "4",
	height: "4",
	flexShrink: 0,
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
});
const mockLineClass = css({
	height: "1.5",
	borderRadius: "full",
	backgroundColor: "border.subtle",
});

const meta = {
	title: "Shared/Controls/ViewModeToggle",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<div className={storyRowClass}>
			<ViewModeToggle
				viewMode={args.viewMode}
				onViewModeChange={() => undefined}
				onEnterIconView={() => undefined}
			/>
			<div className={mockPanelClass} aria-hidden="true">
				{args.viewMode === "icons" ? (
					<div className={mockGridClass}>
						{Array.from({ length: 6 }, (_, index) => (
							<div key={index} className={mockTileClass} />
						))}
					</div>
				) : (
					<div className={mockListClass}>
						{Array.from({ length: 4 }, (_, index) => (
							<div key={index} className={mockRowClass}>
								<div className={mockGlyphClass} />
								<div
									className={css({
										flex: 1,
										minWidth: 0,
										display: "flex",
										flexDirection: "column",
										gap: "1",
									})}
								>
									<div className={mockLineClass} style={{ width: "70%" }} />
									<div className={mockLineClass} style={{ width: "45%" }} />
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

// Issue #194: selected-state contract — `aria-pressed` must reflect
// `viewMode` on both buttons and the toggle must satisfy the layout
// contract.
const playViewMode =
	(expected: "list" | "icons") =>
	async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
		expectCanvasLayout(canvasElement);
		const fieldset = canvasElement.querySelector("fieldset");
		const buttons = Array.from(canvasElement.querySelectorAll("button"));
		expect(buttons).toHaveLength(2);
		const [listButton, iconButton] = buttons;
		expect(listButton.getAttribute("aria-pressed")).toBe(
			expected === "list" ? "true" : "false",
		);
		expect(iconButton.getAttribute("aria-pressed")).toBe(
			expected === "icons" ? "true" : "false",
		);

		// Issue #454: no whole-control opacity dim, the selected button
		// must read as a distinct surface, and both icon states must keep
		// at least 3:1 contrast against their effective background.
		if (!fieldset) throw new Error("view mode toggle fieldset not found");
		expect(getComputedStyle(fieldset).opacity).toBe("1");
		// Issue #769: the fieldset shrink-wraps its two segments — it must
		// never stretch to the full container width and leave a
		// hairline-bordered dead region.
		const fieldsetWidth = fieldset.getBoundingClientRect().width;
		expect(fieldsetWidth).toBeLessThan(canvasElement.clientWidth * 0.5);
		// Issue #722: the fieldset is passive segmented chrome — its resting
		// border uses `border.subtle`, not the brighter `border.control`.
		expect(borderTopColor(fieldset)).toBe(resolveBorderToken("subtle"));
		expect(borderTopColor(fieldset)).not.toBe(resolveBorderToken("control"));
		const activeButton = expected === "list" ? listButton : iconButton;
		const inactiveButton = expected === "list" ? iconButton : listButton;
		const activeBg = getComputedStyle(activeButton).backgroundColor;
		const inactiveBg = getComputedStyle(inactiveButton).backgroundColor;
		expect(activeBg).not.toBe(inactiveBg);
		assertContrast(activeButton, activeButton, { backdrop: fieldset });
		assertContrast(inactiveButton, fieldset);
	};

export const IconView: Story = {
	args: { viewMode: "icons" },
	play: playViewMode("icons"),
};

export const ListView: Story = {
	args: { viewMode: "list" },
	play: playViewMode("list"),
};
