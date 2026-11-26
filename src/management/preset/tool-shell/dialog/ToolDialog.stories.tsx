import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect, userEvent } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { Dialog } from "./ToolDialog";

/*
 * Whole-dialog story (issue #610): renders the real generic preset-tool
 * shell (`dialog-preset-tool-generic` style surface) with the fields /
 * form / icon / details sections the concrete tool dialogs compose.
 *
 * This is the same `Dialog` component that backs `dialog-preset-add`,
 * `dialog-import-preset`, `dialog-preset-create`, `dialog-code-preset`,
 * etc. — here driven purely through props, which is how production call
 * sites (e.g. `PresetImportDialog`) mount it.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "44rem",
});

const meta = {
	title: "Preset/Dialog/Tool",
	render: () => (
		<Dialog
			surfaceId="dialog-preset-create"
			title="Create Preset"
			type="script"
			description="Create a local preset from reusable metadata."
			defaultName="Local Preset"
			iconText="PRESET"
			fields={[
				{
					key: "filePath",
					label: "File path",
					placeholder: "C:\\path\\preset.jsx",
				},
				{
					key: "strategy",
					label: "Strategy",
					kind: "select",
					options: [
						{ value: "copy", label: "Copy" },
						{ value: "link", label: "Link" },
					],
					defaultValue: "copy",
				},
			]}
			pathBrowse={[{ fieldKey: "filePath", mode: "file" }]}
		/>
	),
	decorators: [
		(Story): JSX.Element => (
			<OnlineServicesBoundary>
				<div className={frameClass}>
					<Story />
				</div>
			</OnlineServicesBoundary>
		),
	],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "tool dialog shell" });
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
	const footer = shell.querySelector("footer");
	if (!footer) throw new Error("dialog footer not found");
	const labels = Array.from(footer.querySelectorAll("button")).map((button) =>
		button.textContent?.trim(),
	);
	expect(labels).toContain("Cancel");
	expect(labels).toContain("Create");
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		expect(canvasElement.textContent).toContain("Create Preset");
		expect(canvasElement.textContent).toContain("File path");
		expect(canvasElement.textContent).toContain("Strategy");
		expectFooterActions(shell);
	},
};

export const FieldInteraction: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		const nameInput = Array.from(
			canvasElement.querySelectorAll<HTMLInputElement>("input"),
		).find((input) => input.value === "Local Preset");
		if (!nameInput) throw new Error("preset name input not found");
		await userEvent.clear(nameInput);
		await userEvent.type(nameInput, "Renamed Preset");
		// The name lives in the input's value, not textContent.
		expect(nameInput.value).toBe("Renamed Preset");
		expectFooterActions(shell);
	},
};
