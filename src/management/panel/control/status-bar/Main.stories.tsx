import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect, userEvent, within } from "storybook/test";
import { createInitialSurfaceState } from "@/management/workspace/core/state";
import type { Snapshot } from "@/management/workspace/undo/history";
import { css } from "@/styled-system/css";

import { StatusBar } from "./Main";

/**
 * Workspace status bar (Issue #610).
 *
 * `StatusBar` takes its `SurfaceState` as a plain prop — stories build
 * one with `createInitialSurfaceState`, the same factory the workspace
 * hooks use. The snapshots popover is a real `AnchoredPopover` (also
 * covered by `packages/ui/src/interaction/AnchoredPopover.stories.tsx`);
 * the `SnapshotsOpen` story clicks the layers button to open it.
 */

const frameStyle = css({
	height: "120px",
	width: "100%",
	display: "flex",
	flexDirection: "column",
	justifyContent: "flex-end",
	borderRadius: "shell-lg",
	borderWidth: "hairline",
	borderStyle: "dashed",
	borderColor: "border.default",
	overflow: "hidden",
});

const liveState = createInitialSurfaceState({ mode: "live" });

const snapshots: Snapshot[] = [
	{
		id: "snap-1",
		label: "Before client review",
		createdAt: "2026-01-10T09:00:00.000Z",
		panels: {},
	},
	{
		id: "snap-2",
		label: "Grid v2 baseline",
		createdAt: "2026-01-12T15:30:00.000Z",
		panels: {},
	},
];

const renderBar =
	(overrides?: {
		canUndo?: boolean;
		canRedo?: boolean;
		snapshots?: Snapshot[];
		state?: typeof liveState;
	}) =>
	(): JSX.Element => (
		<div className={frameStyle}>
			<StatusBar
				state={overrides?.state ?? liveState}
				canUndo={overrides?.canUndo ?? false}
				canRedo={overrides?.canRedo ?? false}
				snapshots={overrides?.snapshots ?? []}
			/>
		</div>
	);

const meta = {
	title: "Management/Panel/StatusBar",
	render: renderBar(),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Live mode, undo/redo available, no saved layouts. */
export const Live: Story = {
	render: renderBar({ canUndo: true, canRedo: true }),
	play: async ({ canvasElement }) => {
		// Issue #680: host/mode status text is always visible (previously it
		// was opacity-0 unless a console message was fresh), and every
		// icon-only button exposes an accessible name.
		const canvas = within(canvasElement);
		expect(canvas.getByText(/After Effects · Live/)).toBeVisible();
		for (const button of canvas.getAllByRole("button")) {
			const name =
				button.getAttribute("aria-label") ?? button.textContent ?? "";
			expect(name.trim().length).toBeGreaterThan(0);
		}
	},
};

/** Static mode with two saved layouts; play opens the snapshots popover. */
export const SnapshotsOpen: Story = {
	render: renderBar({
		canUndo: true,
		snapshots,
		state: createInitialSurfaceState({ mode: "static" }),
	}),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const toggle = canvas.getByTitle(/Saved layouts/);
		// Issue #680: the saved-layouts count badge reflects snapshots.length.
		const badge = toggle.parentElement?.querySelector("[data-ws-badge]");
		expect(badge?.textContent).toBe("2");
		await userEvent.click(toggle);
		// The popover portals to document.body — query the whole document.
		await expect(
			within(document.body).getByText("Before client review"),
		).toBeVisible();
	},
};
