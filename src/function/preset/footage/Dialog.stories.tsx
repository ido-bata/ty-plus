import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";
import { Dialog } from "./Dialog";

/*
 * Composed-surface story (issue #596): renders the real routed
 * `dialog-footage-preset` body — `ToolDialog` shell + fields + details +
 * icon sections — instead of the isolated section stories under
 * `Preset/ToolShell/Dialog/*`. `<dialog open>` is absolutely positioned,
 * so it needs a positioned, fixed-size frame (same contract as
 * `Dialog/Shell/Layout`, issue #514).
 */
const frameClass = css({
	position: "relative",
	height: "42rem",
	width: "44rem",
});

const meta = {
	title: "Preset/Dialog/Footage",
	render: () => (
		<div className={frameClass}>
			<Dialog />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectDialogComposition = (canvasElement: HTMLElement): void => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "footage preset dialog shell" });
	// The shell must fill its frame, not escape to the viewport.
	const frame = shell.parentElement;
	if (!frame) throw new Error("dialog frame not found");
	const shellBox = measureBox(shell);
	const frameBox = measureBox(frame);
	expect(shellBox.x).toBeGreaterThanOrEqual(frameBox.x - 1);
	expect(shellBox.y).toBeGreaterThanOrEqual(frameBox.y - 1);
	expect(shellBox.x + shellBox.width).toBeLessThanOrEqual(
		frameBox.x + frameBox.width + 1,
	);
	expect(shellBox.y + shellBox.height).toBeLessThanOrEqual(
		frameBox.y + frameBox.height + 1,
	);
	// Footer actions: the composed surface must expose Save + Cancel.
	const labels = Array.from(shell.querySelectorAll("button")).map(
		(button) => button.textContent?.trim() ?? "",
	);
	expect(labels).toContain("Create");
	expect(labels).toContain("Cancel");
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectDialogComposition(canvasElement);
	},
};
