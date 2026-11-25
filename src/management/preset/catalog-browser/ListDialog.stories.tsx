import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { PresetsDialog } from "./ListDialog";

/*
 * Whole-dialog story (issue #610): renders the real `dialog-presets`
 * surface — `DialogShell` + `CatalogBrowserShell` + header + list/icon
 * body. The catalog rows come from `presets/presets.json` through the
 * persistence gateway, so each story seeds
 * `OnlineServicesBoundary.persistenceSeed` instead of mocking modules.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "46rem",
});

const CATALOG_PRESETS = [
	{
		id: "preset-alpha",
		type: "preset",
		title: "Alpha Glow",
		filePath: "/presets/alpha-glow.json",
	},
	{
		id: "preset-beta",
		type: "script",
		title: "Beta Shake",
		filePath: "/scripts/beta-shake.jsx",
	},
	{
		id: "preset-gamma",
		type: "footage",
		title: "Gamma Plate",
		filePath: "/footage/gamma-plate.mov",
	},
	{
		id: "preset-delta",
		type: "plugin",
		title: "Delta Keyer",
		filePath: "/plugins/delta-keyer.ffx",
	},
];

const catalogJson = (presets: unknown): string =>
	JSON.stringify({ version: 1, presets });

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

const boundary =
	(seed: Record<string, unknown>): Decorator =>
	(Story) => (
		<OnlineServicesBoundary persistenceSeed={seed}>
			<div className={frameClass}>
				<Story />
			</div>
		</OnlineServicesBoundary>
	);

const meta = {
	title: "Preset/Dialog/PresetsList",
	render: () => <PresetsDialog />,
	decorators: [
		boundary({
			presetCatalog: catalogJson(CATALOG_PRESETS),
			groupCatalog: GROUPS,
		}),
	],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "presets list dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe("dialog-presets");
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
	return shell;
};

const waitForRows = async (canvasElement: HTMLElement): Promise<void> => {
	await waitFor(() => {
		expect(
			canvasElement.querySelectorAll("[data-preset-id]").length,
		).toBeGreaterThan(0);
	});
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		await waitForRows(canvasElement);
		// Group header from the seeded group catalog + ungrouped rows.
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Favourites");
		});
		expect(shell.textContent).toContain("Delta Keyer");
		// Gateway never booted → the cloud-offline notice is expected copy.
		expect(shell.textContent).toContain("Cloud offline");
	},
};

export const EmptyCatalog: Story = {
	decorators: [
		boundary({
			presetCatalog: catalogJson([]),
			groupCatalog: { version: 1, groups: [] },
		}),
	],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		await waitFor(() => {
			expect(canvasElement.textContent).toContain(
				"No presets saved locally yet",
			);
		});
		expect(shell.textContent).toContain("Add presets");
	},
};

export const LoadError: Story = {
	decorators: [
		boundary({
			// Corrupt catalog text: the strict parser rejects it, which is the
			// load-failure path (distinct from an empty catalog).
			presetCatalog: "{ not json",
			groupCatalog: { version: 1, groups: [] },
		}),
	],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		await waitFor(() => {
			expect(canvasElement.textContent).toContain(
				"Failed to load the local catalog",
			);
		});
		expect(canvasElement.querySelector("[role='alert']")).not.toBeNull();
		expect(shell.textContent).not.toContain("No presets saved locally yet");
	},
};

export const IconsView: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		await waitForRows(canvasElement);
		const { userEvent } = await import("vitest/browser");
		const toggle = canvasElement.querySelector<HTMLButtonElement>(
			'button[aria-label="Icon view"]',
		);
		if (!toggle) throw new Error("icon view toggle not found");
		await userEvent.click(toggle);
		await waitFor(() => {
			expect(
				canvasElement.querySelector("[data-preset-icon-view-port]"),
			).not.toBeNull();
		});
		// The seeded group renders as an icon tile with its member count.
		expect(canvasElement.textContent).toContain("Favourites");
		expect(shell.textContent).toContain("Delta Keyer");
	},
};
