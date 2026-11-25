import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { GroupDialog } from "./Dialog";

/*
 * Whole-dialog story (issue #610): renders the real `dialog-preset-add-folder`
 * surface — `ToolDialog` shell + the group-specific `renderForm` (name,
 * members, icon rules, icon, details). Persistence is only touched on save,
 * so the boundary exists to keep the seeded gateway deterministic; the
 * catalog seed also feeds `detectCandidates` if a story drives it.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "48rem",
});

const catalogJson = (presets: unknown): string =>
	JSON.stringify({ version: 1, presets });

const boundary: Decorator = (Story) => (
	<OnlineServicesBoundary
		persistenceSeed={{
			presetCatalog: catalogJson([
				{
					id: "preset-alpha",
					type: "preset",
					title: "Alpha Glow",
					filePath: "/presets/alpha-glow.json",
				},
			]),
		}}
	>
		<div className={frameClass}>
			<Story />
		</div>
	</OnlineServicesBoundary>
);

const meta = {
	title: "Preset/Dialog/AddFolder",
	render: () => <GroupDialog />,
	decorators: [boundary],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "add-folder dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe(
		"dialog-preset-add-folder",
	);
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
		// Group form sections render synchronously.
		expect(canvasElement.textContent).toContain("Group name");
		expect(canvasElement.textContent).toContain("Icon rules");
		expect(canvasElement.textContent).toContain("Group icon");
		expectFooterActions(shell);
	},
};

export const DetectCandidates: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		const { userEvent } = await import("vitest/browser");
		// Paths are edited through `PathField` rows (the `paths` textarea
		// field is part of `ctx.fields`, which this `renderForm` does not
		// mount). "Add path" appends an empty row.
		const addPath = Array.from(shell.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Add path"),
		);
		if (!addPath) throw new Error("add path button not found");
		await userEvent.click(addPath);
		const pathInput = await waitFor(() => {
			const input = Array.from(
				canvasElement.querySelectorAll<HTMLInputElement>("input"),
			).find((el) => el.placeholder?.includes("folder"));
			if (!input) throw new Error("folder path input not found");
			return input;
		});
		await userEvent.click(pathInput);
		await userEvent.keyboard("/presets");
		const detect = Array.from(shell.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Detect candidates"),
		);
		if (!detect) throw new Error("detect candidates button not found");
		await userEvent.click(detect);
		// The seeded catalog row matches the folder path, so an auto
		// preset-type icon rule renders its `FileEntryList` candidate —
		// the preset title is the observable signal.
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Alpha Glow");
		});
	},
};
