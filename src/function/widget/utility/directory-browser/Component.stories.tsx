import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import { DirectoryBrowserWidget } from "@/function/widget/utility/directory-browser/Component";
import type { Preset } from "@/management/preset/contract";
import type { SurfaceState } from "@/management/workspace/core/state";
import { createInitialSurfaceState } from "@/management/workspace/core/state";
import { css } from "@/styled-system/css";

/**
 * Story for the shipped directory-browser widget.
 *
 * The other stories in this folder render the *extracted* pieces (header,
 * toolbar, filter panel, preset row / tile). This one renders the widget that
 * actually ships — the one `directoryBrowserWidgetDescriptor` mounts — so the
 * composed UI (header + body) is visible in Storybook.
 *
 * LIMITATION: the widget reads the filesystem through the CEP node file
 * browser (`canUseCepNodeFileBrowser`), which is not available in the browser
 * runtime Storybook runs in. The widget therefore renders its header, toolbar,
 * and the "no items" empty state; the listing itself only appears inside the
 * After Effects panel. Everything that is pure UI (search field, path field,
 * browse-mode select, view-mode toggle, filter panel, catalog groups) is
 * interactive in this story.
 */
type Args = {
	widthPx: number;
	heightPx: number;
	withPresets: boolean;
};

const presetFixtures: readonly Preset[] = [
	{
		id: "preset-glow",
		title: "Glow Pulse",
		filePath: "/preset/root/glow.ffx",
		type: "preset",
	},
	{
		id: "script-bounce",
		title: "Bounce Animator",
		filePath: "/preset/root/bounce.jsx",
		type: "script",
	},
	{
		id: "preset-fade",
		title: "Fade to Black",
		filePath: "/preset/root/fade.ffx",
		type: "preset",
	},
];

const buildState = (args: Args): SurfaceState => {
	const base = createInitialSurfaceState({ mode: "live" });
	if (!args.withPresets) {
		return base;
	}
	return { ...base, presets: [...presetFixtures] };
};

const baseArgs: Args = {
	widthPx: 420,
	heightPx: 480,
	withPresets: false,
};

const meta = {
	title: "WidgetUtility/DirectoryBrowser",
	args: baseArgs,
	argTypes: {
		widthPx: { control: { type: "number", min: 280, max: 720 } },
		heightPx: { control: { type: "number", min: 240, max: 720 } },
		withPresets: { control: { type: "boolean" } },
	},
	render: (args: Args) => (
		<div
			className={css({ padding: "3" })}
			style={{ width: args.widthPx, height: args.heightPx }}
		>
			<DirectoryBrowserWidget state={buildState(args)} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

/**
 * Same widget with catalog presets in the surface state. The preset list is
 * still gated on a current directory (the CEP file browser provides it), so
 * this story mainly shows the header chrome in the state the panel uses.
 */
export const WithPresets: Story = {
	args: { withPresets: true },
};

/**
 * Issue #508: the expanded filter panel is fully interactive, so it must
 * not be dimmed — `opacity` on the wrapper makes every control look
 * disabled and breaks contrast.
 */
export const FiltersExpanded: Story = {
	play: async ({ canvasElement }) => {
		let toggle: HTMLElement | null = null;
		await waitFor(() => {
			toggle = canvasElement.querySelector<HTMLElement>(
				'button[aria-label="Filters"]',
			);
			expect(toggle).not.toBeNull();
		});
		if (!toggle) throw new Error("filters toggle not found");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(toggle);
		await waitFor(() => {
			expect(
				canvasElement.querySelector("[data-directory-browser-filters]"),
			).not.toBeNull();
		});
		const panel = canvasElement.querySelector<HTMLElement>(
			"[data-directory-browser-filters]",
		);
		if (!panel) throw new Error("filter panel not found");
		expect(getComputedStyle(panel).opacity).toBe("1");
		const chip = panel.querySelector<HTMLButtonElement>("button");
		expect(chip).not.toBeNull();
		expect(chip?.disabled).toBe(false);
	},
};
