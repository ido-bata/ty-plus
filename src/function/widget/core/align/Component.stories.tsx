import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import { Align } from "@/function/widget/core/align/Component";
import type { SurfaceState } from "@/management/workspace/state";
import { createInitialSurfaceState } from "@/management/workspace/state";
import { css } from "@/styled-system/css";

type Args = {
	widthPx: number;
	heightPx: number;
	selectionCount: number;
};

const buildState = (args: Args): SurfaceState => {
	const base = createInitialSurfaceState({ mode: "live" });
	// selectionCount is only used by the host call; the local widget state
	// initializes to 0 and refreshes via `host("getSelectionCount")`, which
	// in Storybook returns the noop caller's empty object. We can't
	// override that from here without mocking the runtime context.
	void args.selectionCount;
	return base;
};

const baseArgs: Args = {
	widthPx: 240,
	heightPx: 240,
	selectionCount: 0,
};

const meta = {
	title: "WidgetCore/Align",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 120, max: 480 } },
		heightPx: { control: { type: "number", min: 120, max: 480 } },
		selectionCount: { control: { type: "number", min: 0, max: 16 } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{ width: args.widthPx, height: args.heightPx }}
		>
			<Align
				state={buildState(args)}
				widthPx={args.widthPx}
				widgetInstanceId="align-storybook-1"
			/>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Compact: Story = {
	args: { widthPx: 160, heightPx: 160 },
};

// Issue #146: interaction-state capture. Every align/distribute action
// button is disabled while `selectionCount` is 0 (the Storybook widget
// runtime returns no selection), so the enabled target-selector row is
// the only place hover and click states can be exercised. Hovering an
// inactive target must lift its background; the post-play state is what
// the screenshot pipeline captures.
// The target-selector row only renders once the widget's ResizeObserver
// has reported a height large enough for `showTarget` — `size.h` starts
// at 0, so the row is absent during the first frames. Poll for it
// instead of asserting synchronously (CI timing differs from local).
const waitForAlignButton = async (
	canvasElement: HTMLElement,
	selector: string,
): Promise<HTMLElement> => {
	let button: HTMLElement | null = null;
	await waitFor(() => {
		button = canvasElement.querySelector<HTMLElement>(selector);
		expect(button).not.toBeNull();
	});
	if (!button) throw new Error(`align button not found: ${selector}`);
	return button;
};

export const HoverTarget: Story = {
	play: async ({ canvasElement }) => {
		const button = await waitForAlignButton(
			canvasElement,
			"[data-ws-action='align-target-key-object']",
		);
		// `storybook/test`'s userEvent does not move the real pointer in
		// the vitest browser project; drive real input via vitest/browser
		// (dynamic import keeps Storybook dev/build from evaluating the
		// browser-only module).
		const { userEvent } = await import("vitest/browser");
		const resting = getComputedStyle(button).backgroundColor;
		await userEvent.hover(button);
		await expect(button.matches(":hover")).toBe(true);
		// The button transitions colors — wait for it to settle before
		// comparing computed styles.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(button).backgroundColor).not.toBe(resting);
	},
};

// Clicking the time target switches `target` to "time", which reveals
// the Time alignment section — a visible post-click state change that
// the capture pipeline screenshots automatically.
export const SelectTimeTarget: Story = {
	play: async ({ canvasElement }) => {
		const button = await waitForAlignButton(
			canvasElement,
			"[data-ws-action='align-target-time']",
		);
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(button);
		await expect(
			canvasElement.querySelector("[data-ws-action='align-start']"),
		).not.toBeNull();
	},
};
