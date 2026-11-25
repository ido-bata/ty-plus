import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { type JSX, useLayoutEffect } from "react";
import { expect } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { GenericPresetCreateDialog } from "./Dialog";

/*
 * Whole-dialog story (issue #610): renders the real `dialog-preset-create`
 * surface — `ToolDialog` shell + the generic/easing `renderForm`.
 *
 * Launch params normally arrive via `getArguments()` / the tool-handoff
 * file. Storybook has neither, so:
 *   - Default renders with no params (generic template).
 *   - EasingTemplate installs a minimal `window.CSInterface` whose
 *     `getArguments()` returns the same JSON payload the CEP host would
 *     deliver, which `readCepOpenParams` picks up unchanged.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "46rem",
});

const SETTINGS_WITH_SCRIPT_ROOT = JSON.stringify({
	core: { paths: { scriptRoot: "/scripts" } },
});

const EASING_ARGS = JSON.stringify({
	presetTemplate: "easing",
	presetType: "script",
	defaultName: "Smooth Ease",
	data: {
		easing: { version: 1, cubic: [0.25, 0.1, 0.25, 1] },
	},
});

type FakeCsInterface = new () => {
	getArguments: () => string;
	getExtensionID: () => string;
	getHostEnvironment: () => { appName: string };
	getSystemPath: (key: string) => string;
	dispatchEvent: (event: unknown) => boolean;
	evalScript: (script: string, callback?: (result: string) => void) => void;
	requestOpenExtension: (id: string, params: string) => void;
};

const createFakeCsInterface = (argsJson: string): FakeCsInterface =>
	function FakeCSInterface(this: Record<string, unknown>) {
		this.getArguments = () => argsJson;
		this.getExtensionID = () => "ty-plus.storybook";
		this.getHostEnvironment = () => ({ appName: "AEFT" });
		this.getSystemPath = () => "";
		this.dispatchEvent = () => true;
		this.evalScript = (_script: string, callback?: (r: string) => void) =>
			callback?.("null");
		this.requestOpenExtension = () => {};
	} as unknown as FakeCsInterface;

/** Restores `window.CSInterface` when the story unmounts. */
const CepArgumentsRestore = (props: {
	previous: unknown;
	children: JSX.Element;
}): JSX.Element => {
	const { previous, children } = props;
	useLayoutEffect(
		() => () => {
			(window as { CSInterface?: unknown }).CSInterface = previous;
		},
		[previous],
	);
	return children;
};

const withCepArguments =
	(argsJson: string): Decorator =>
	(Story): JSX.Element => {
		// `readCepOpenParams` runs during the dialog's render, so the fake
		// host must be installed before `<Story />` renders — a layout
		// effect would be too late.
		const w = window as { CSInterface?: unknown };
		// Re-renders of this decorator must not capture our own fake as the
		// "previous" value, or the unmount restore would leak it.
		const current = w.CSInterface as { name?: string } | undefined;
		const previous =
			current?.name === "FakeCSInterface" ? undefined : w.CSInterface;
		w.CSInterface = createFakeCsInterface(argsJson);
		return (
			<CepArgumentsRestore previous={previous}>
				<OnlineServicesBoundary
					persistenceSeed={{ app: SETTINGS_WITH_SCRIPT_ROOT }}
				>
					<div className={frameClass}>
						<Story />
					</div>
				</OnlineServicesBoundary>
			</CepArgumentsRestore>
		);
	};

const meta = {
	title: "Preset/Dialog/Create",
	render: () => <GenericPresetCreateDialog />,
	decorators: [withCepArguments("{}")],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "preset create dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe("dialog-preset-create");
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
		// Generic template: preset name + icon + details, no curve field.
		expect(canvasElement.textContent).toContain("Preset name");
		expect(canvasElement.textContent).toContain("Icon");
		expect(canvasElement.textContent).not.toContain("Curve");
		expectFooterActions(shell);
	},
};

export const EasingTemplate: Story = {
	decorators: [withCepArguments(EASING_ARGS)],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		// `readCepOpenParams` resolves the injected arguments, so the easing
		// template renders its curve field and settings-derived save path.
		expect(canvasElement.textContent).toContain("Curve");
		expect(canvasElement.textContent).toContain("Save path");
		// Sanitized file name derived from the injected defaultName.
		expect(canvasElement.textContent).toContain("Smooth_Ease.jsx");
		const nameInput = Array.from(
			canvasElement.querySelectorAll<HTMLInputElement>("input"),
		).find((input) => input.value === "Smooth Ease");
		expect(nameInput).toBeTruthy();
		expectFooterActions(shell);
	},
};
