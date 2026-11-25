import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { PathDialog } from "./PathDialog";

/*
 * Whole-dialog story (issue #610): renders the real `dialog-preset-add`
 * surface. Folder roots come from `settings/app.json` (`core.paths`), so
 * each story seeds `OnlineServicesBoundary.persistenceSeed`. Storybook has
 * no `cep_node`, so the embedded file browser deterministically renders its
 * "File browser requires CEP Node" empty state — that is the production
 * fallback, not a stub.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "48rem",
});

const SETTINGS_WITH_ROOTS = JSON.stringify({
	core: {
		paths: {
			presetRoot: "/presets",
			scriptRoot: "/scripts",
			pluginRoot: "/plugins",
		},
	},
});

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
	title: "Preset/Dialog/AddPath",
	render: () => <PathDialog />,
	decorators: [boundary({ app: SETTINGS_WITH_ROOTS })],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "add-preset path dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe("dialog-preset-add");
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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		// Settings load asynchronously; the browser empty state only renders
		// once `pathsReady` flips.
		await waitFor(() => {
			expect(canvasElement.textContent).toContain(
				"File browser requires CEP Node",
			);
		});
		const labels = Array.from(shell.querySelectorAll("button")).map(
			(button) => button.textContent?.trim() ?? "",
		);
		expect(labels).toContain("Cancel");
		expect(labels).toContain("Create");
	},
};

export const NoRootsConfigured: Story = {
	decorators: [boundary({})],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		// Without `core.paths` in settings the tab roots stay empty; the CEP
		// browser check still wins, so the same node-required empty state
		// renders — what differs is that no root path is configured behind it.
		await waitFor(() => {
			expect(canvasElement.textContent).toContain(
				"File browser requires CEP Node",
			);
		});
		const labels = Array.from(shell.querySelectorAll("button")).map(
			(button) => button.textContent?.trim() ?? "",
		);
		expect(labels).toContain("Cancel");
		expect(labels).toContain("Create");
	},
};
