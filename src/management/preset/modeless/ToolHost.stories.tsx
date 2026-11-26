import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { type JSX, useLayoutEffect } from "react";
import { expect, waitFor } from "storybook/test";

import { tyPlusExtensionId } from "@/management/ae/cep/extension-id";
import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { ToolHost } from "./ToolHost";

/*
 * Whole-surface story (issue #610): renders the real modeless preset-tool
 * host — the `dialog-preset-tool-boot` placeholder while it resolves, then
 * `DialogRoot` for the resolved preset-tool surface.
 *
 * Resolution order in production is CEP `getArguments()` → surface bus →
 * the tool-handoff file under the persistence gateway. Storybook has no
 * CEP arguments, so:
 *   - Booting renders the deterministic "Preparing preset dialog…" shell.
 *   - ResolvedToPathDialog installs a minimal `window.CSInterface` whose
 *     `getExtensionID()` returns the physical extension id the handoff is
 *     keyed by, and seeds the `toolHandoff` persistence slot; `ToolHost`'s
 *     own poll consumes it and mounts the real `dialog-preset-add` body.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "48rem",
});

const ADD_DIALOG_EXTENSION_ID = tyPlusExtensionId("dialog-preset-add");
const HANDOFF_SLOT = `toolHandoff:${ADD_DIALOG_EXTENSION_ID}`;

// `writtenAt` is validated against a 120s staleness window at consume time,
// so it must be fresh per story run — not module-load time.
const buildHandoffSeed = (): Record<string, unknown> => ({
	[HANDOFF_SLOT]: {
		targetExtensionId: ADD_DIALOG_EXTENSION_ID,
		writtenAt: Date.now(),
		presetToolSurfaceId: "dialog-preset-add",
	},
});

type FakeCsInterface = new () => {
	getArguments: () => string | null;
	getExtensionID: () => string;
	getHostEnvironment: () => { appName: string };
	getSystemPath: (key: string) => string;
	dispatchEvent: (event: unknown) => boolean;
	evalScript: (script: string, callback?: (result: string) => void) => void;
	requestOpenExtension: (id: string, params: string) => void;
};

const createFakeCsInterface = (): FakeCsInterface =>
	function FakeCSInterface(this: Record<string, unknown>) {
		this.getArguments = () => null;
		this.getExtensionID = () => ADD_DIALOG_EXTENSION_ID;
		this.getHostEnvironment = () => ({ appName: "AEFT" });
		this.getSystemPath = () => "";
		this.dispatchEvent = () => true;
		this.evalScript = (_script: string, callback?: (r: string) => void) =>
			callback?.("null");
		this.requestOpenExtension = () => {};
	} as unknown as FakeCsInterface;

/** Restores `window.CSInterface` when the story unmounts. */
const CepInterfaceRestore = (props: {
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

const withCepInterface =
	(enabled: boolean): Decorator =>
	(Story): JSX.Element => {
		// `readPhysicalExtensionId` reads `window.CSInterface` inside
		// `ToolHost`'s poll, so installing it before render is enough — no
		// render-phase ordering constraint like the authoring dialog's
		// `getArguments` params.
		const w = window as { CSInterface?: unknown };
		const current = w.CSInterface as { name?: string } | undefined;
		const alreadyFake = current?.name === "FakeCSInterface";
		const previous = alreadyFake ? undefined : w.CSInterface;
		if (enabled && !alreadyFake) {
			w.CSInterface = createFakeCsInterface();
		}
		return (
			<CepInterfaceRestore previous={previous}>
				<OnlineServicesBoundary persistenceSeed={buildHandoffSeed()}>
					<div className={frameClass}>
						<Story />
					</div>
				</OnlineServicesBoundary>
			</CepInterfaceRestore>
		);
	};

const meta = {
	title: "Preset/Dialog/ToolHost",
	render: () => <ToolHost />,
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (
	canvasElement: HTMLElement,
	surfaceId: string,
): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: `tool host shell (${surfaceId})` });
	expect(shell.getAttribute("data-surface-id")).toBe(surfaceId);
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

export const Booting: Story = {
	decorators: [withCepInterface(false)],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectShell(canvasElement, "dialog-preset-tool-boot");
		expect(canvasElement.textContent).toContain("Preparing preset dialog");
	},
};

export const ResolvedToPathDialog: Story = {
	decorators: [withCepInterface(true)],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		// ToolHost's poll consumes the seeded handoff and mounts the real
		// `dialog-preset-add` body (PathDialog) through DialogRoot.
		await waitFor(() => {
			expect(
				canvasElement.querySelector(
					'[data-dialog-shell][data-surface-id="dialog-preset-add"]',
				),
			).not.toBeNull();
		});
		const shell = canvasElement.querySelector<HTMLElement>(
			'[data-dialog-shell][data-surface-id="dialog-preset-add"]',
		);
		if (!shell) throw new Error("resolved dialog shell not found");
		assertRendered(shell, { label: "resolved path dialog shell" });
		await waitFor(() => {
			expect(canvasElement.textContent).toContain(
				"Add catalog preset from path",
			);
		});
	},
};
