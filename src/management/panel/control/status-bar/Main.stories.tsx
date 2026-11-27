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

/** Narrow frame matching the real 320px workspace panel width. */
const narrowFrameStyle = css({
	height: "120px",
	width: "320px",
	display: "flex",
	flexDirection: "column",
	justifyContent: "flex-end",
	borderRadius: "shell-lg",
	borderWidth: "hairline",
	borderStyle: "dashed",
	borderColor: "border.default",
	overflow: "hidden",
});

/**
 * Issue #752: a status string must actually paint — non-zero box, non-zero
 * opacity, and topmost at its own center (guards against color-on-color
 * or occlusion regressions that `toBeVisible` cannot see).
 */
const expectPainted = (
	el: Element,
	label: string,
	hitScope?: Element | null,
): void => {
	const rect = el.getBoundingClientRect();
	expect(rect.width, `${label} has zero width`).toBeGreaterThan(0);
	expect(rect.height, `${label} has zero height`).toBeGreaterThan(0);
	const style = getComputedStyle(el);
	expect(Number(style.opacity), `${label} is transparent`).toBeGreaterThan(0);
	const scope = hitScope ?? el;
	const hit = document.elementFromPoint(
		rect.left + rect.width / 2,
		rect.top + rect.height / 2,
	);
	expect(
		hit === scope || scope.contains(hit) || hit?.contains(scope),
		`${label} is not the topmost painted element`,
	).toBe(true);
};

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
		frame?: "wide" | "narrow";
	}) =>
	(): JSX.Element => (
		<div
			className={overrides?.frame === "narrow" ? narrowFrameStyle : frameStyle}
		>
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
		const hostText = canvas.getByText(/After Effects · Live/);
		expect(hostText).toBeVisible();
		// Issue #752: the host/mode label must paint, not just exist.
		expectPainted(hostText, "host/mode status text");
		for (const button of canvas.getAllByRole("button")) {
			const name =
				button.getAttribute("aria-label") ?? button.textContent ?? "";
			expect(name.trim().length).toBeGreaterThan(0);
		}
	},
};

/**
 * Issue #752: at the real 320px panel width the host/mode label is the
 * first thing squeezed by the action group — it must keep a visible box
 * (ellipsis-truncated is acceptable, zero-width is not).
 */
export const NarrowPanel: Story = {
	render: renderBar({ canUndo: true, canRedo: true, frame: "narrow" }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const hostText = canvas.getByText(/After Effects · Live/);
		const rect = hostText.getBoundingClientRect();
		expect(
			rect.width,
			`host/mode text collapsed to ${rect.width}px at 320px panel width`,
		).toBeGreaterThan(24);
		expectPainted(hostText, "host/mode status text (narrow)");
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
		// Issue #752: static mode still paints the host label.
		expectPainted(
			canvas.getByText(/^After Effects$/),
			"host status text (static)",
		);
		const toggle = canvas.getByTitle(/Saved layouts/);
		// Issue #680: the saved-layouts count badge reflects snapshots.length.
		const badge = toggle.parentElement?.querySelector("[data-ws-badge]");
		expect(badge?.textContent).toBe("2");
		// Issue #752: the badge must paint — it is absolutely positioned
		// over the button with pointer-events:none, so the hit test is
		// scoped to its anchor wrapper.
		if (badge) {
			expectPainted(badge, "snapshot count badge", badge.parentElement);
			const badgeStyle = getComputedStyle(badge);
			expect(badgeStyle.backgroundColor).not.toBe(badgeStyle.color);
		}
		await userEvent.click(toggle);
		// The popover portals to document.body — query the whole document.
		await expect(
			within(document.body).getByText("Before client review"),
		).toBeVisible();
	},
};
