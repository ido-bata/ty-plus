import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { Dialog } from "./Dialog";

/*
 * Whole-dialog story (issue #610): renders the real `dialog-code-preset`
 * surface — `ToolDialog` shell + the code-preset `renderForm` including the
 * production Monaco `CodeEditor`. No editor stub: the editor is the
 * component under test's own region and mounts for real under the
 * Storybook Vite pipeline (`?worker` imports resolve there).
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "52rem",
});

const boundary: Decorator = (Story) => (
	<OnlineServicesBoundary>
		<div className={frameClass}>
			<Story />
		</div>
	</OnlineServicesBoundary>
);

const meta = {
	title: "Preset/Dialog/Code",
	render: () => <Dialog />,
	decorators: [boundary],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "code preset dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe("dialog-code-preset");
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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		expect(canvasElement.textContent).toContain("Code Preset");
		expect(canvasElement.textContent).toContain("Script code (.jsx)");
		// The Monaco editor mounts asynchronously; wait for its DOM.
		await waitFor(() => {
			expect(canvasElement.querySelector(".monaco-editor")).not.toBeNull();
		});
		expectFooterActions(shell);
	},
};

export const ExpressionType: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const segment = Array.from(
			canvasElement.querySelectorAll<HTMLElement>("button"),
		).find((button) => button.textContent?.trim() === "Expression");
		if (!segment) throw new Error("expression segment not found");
		await userEvent.click(segment);
		// The editor region relabels for the expression code type.
		await waitFor(() => {
			expect(canvasElement.textContent).not.toContain("Script code (.jsx)");
		});
		// Issue #753: the untouched defaults follow the type switch — the
		// icon text field and glyph preview move CODE → EXPR instead of
		// staying on the script preset's icon.
		await waitFor(() => {
			const iconText = canvasElement.querySelector<HTMLInputElement>(
				'input[aria-label="Icon text"]',
			);
			expect(iconText?.value).toBe("EXPR");
		});
		expect(canvasElement.textContent).toContain("Save location");
		expectFooterActions(shell);
	},
};
