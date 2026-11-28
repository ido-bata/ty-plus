import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { PresetEditDialog } from "./Dialog";

/*
 * Whole-dialog story (issue #610): renders the real `dialog-preset-edit`
 * surface. `PresetEditDialog` takes `presetId` as a prop and resolves the
 * record through `getPreset` → `presets/presets.json`, so each story seeds
 * `OnlineServicesBoundary.persistenceSeed` (preset catalog text +
 * `groups.json` object) instead of mocking modules.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "46rem",
});

const PRESETS = [
	{
		id: "preset-alpha",
		type: "preset",
		title: "Alpha Glow",
		filePath: "/presets/alpha-glow.json",
		description: "Soft glow for titles.",
	},
	{
		id: "preset-beta",
		type: "script",
		title: "Beta Shake",
		filePath: "/scripts/beta-shake.jsx",
	},
];

const GROUPS = {
	version: 1,
	groups: [
		{
			id: "group-favourites",
			title: "Favourites",
			presetIds: ["preset-alpha", "preset-beta"],
		},
	],
};

const catalogJson = (presets: unknown): string =>
	JSON.stringify({ version: 1, presets });

const boundary =
	(seed: Record<string, unknown>): Decorator =>
	(Story) => (
		<OnlineServicesBoundary persistenceSeed={seed}>
			<div className={frameClass}>
				<Story />
			</div>
		</OnlineServicesBoundary>
	);

const defaultSeed = {
	presetCatalog: catalogJson(PRESETS),
	groupCatalog: GROUPS,
};

const meta = {
	title: "Preset/Dialog/Edit",
	render: () => <PresetEditDialog presetId="preset-alpha" />,
	decorators: [boundary(defaultSeed)],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "preset edit dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe("dialog-preset-edit");
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
	const row = shell.querySelector<HTMLElement>("[data-dialog-footer-actions]");
	if (!row) throw new Error("dialog footer actions not found");
	const buttons = Array.from(row.querySelectorAll("button"));
	// Canonical slot order: [Secondary/Destructive] [Cancel] [Primary].
	expect(buttons.map((button) => button.textContent?.trim() ?? "")).toEqual([
		"Delete",
		"Cancel",
		"Save",
	]);
	const byLabel = (label: string) =>
		buttons.find((button) => button.textContent?.trim() === label);
	// Icon policy: only the destructive action carries a leading icon;
	// the primary confirm renders text only.
	expect(byLabel("Save")?.querySelector("svg")).toBeNull();
	expect(byLabel("Delete")?.querySelector("svg")).not.toBeNull();
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		// The seeded preset row loads into the form.
		await waitFor(() => {
			const input = canvasElement.querySelector<HTMLInputElement>(
				"input[value='Alpha Glow']",
			);
			expect(input).not.toBeNull();
		});
		expectFooterActions(shell);
	},
};

export const GroupPreset: Story = {
	render: () => <PresetEditDialog presetId="group-favourites" />,
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		// A group id resolves through groups.json and renders the member list.
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Member presets (2)");
		});
		// Group containers get their own dialog title, not the generic
		// "Preset"/"Edit Preset" type label.
		expect(canvasElement.textContent).toContain("Group Preset");
		expect(canvasElement.textContent).toContain("Alpha Glow");
		expect(canvasElement.textContent).toContain("Beta Shake");
		expectFooterActions(shell);
	},
};

export const NotFound: Story = {
	render: () => <PresetEditDialog presetId="preset-missing" />,
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Preset not found");
		});
		// A load failure leaves nothing to mutate: the footer collapses to
		// Cancel only — disabled Delete/Save buttons would be dead chrome.
		const buttons = Array.from(shell.querySelectorAll("button"));
		const labels = buttons.map((button) => button.textContent?.trim());
		expect(labels).toContain("Cancel");
		expect(labels).not.toContain("Save");
		expect(labels).not.toContain("Delete");
		const cancel = buttons.find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		expect(cancel?.disabled).toBe(false);
	},
};
