import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { ImportDialog } from "./Dialog";

/*
 * Whole-dialog story (issue #610): renders the real `dialog-import-preset`
 * surface — `ToolDialog` shell + the import field set (path + strategy).
 * Persistence is only touched on save, so the boundary exists to keep the
 * seeded gateway deterministic.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "36rem",
	width: "44rem",
});

const boundary: Decorator = (Story) => (
	<OnlineServicesBoundary>
		<div className={frameClass}>
			<Story />
		</div>
	</OnlineServicesBoundary>
);

const meta = {
	title: "Preset/Dialog/Import",
	render: () => <ImportDialog />,
	decorators: [boundary],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "import preset dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe("dialog-import-preset");
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
	return shell;
};

const expectFooterActions = (shell: HTMLElement): void => {
	const labels = Array.from(shell.querySelectorAll("button")).map(
		(button) => button.textContent?.trim() ?? "",
	);
	expect(labels).toContain("Cancel");
	expect(labels).toContain("Create");
};

// The path field's placeholder is a Windows-style path; match it in JS —
// a CSS attribute selector would have to escape every backslash.
const findPathInput = (canvasElement: HTMLElement): HTMLInputElement => {
	const input = Array.from(
		canvasElement.querySelectorAll<HTMLInputElement>("input"),
	).find((el) => el.placeholder?.includes("asset"));
	if (!input) throw new Error("import path input not found");
	return input;
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		expect(canvasElement.textContent).toContain("Import Preset");
		expect(findPathInput(canvasElement)).toBeTruthy();
		expectFooterActions(shell);
	},
};

export const PathEntered: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const pathInput = findPathInput(canvasElement);
		await userEvent.click(pathInput);
		await userEvent.keyboard("D:\\assets\\intro.zip");
		expect(pathInput.value).toBe("D:\\assets\\intro.zip");
		expectFooterActions(shell);
	},
};
