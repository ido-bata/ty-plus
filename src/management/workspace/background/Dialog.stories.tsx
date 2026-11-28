import type { Decorator, Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { expect, waitFor } from "storybook/test";

import { OnlineServicesBoundary } from "@/storybook/online-services";
import {
	assertRendered,
	expectCanvasLayout,
	measureBox,
} from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { WorkspaceBackgroundDialog } from "./Dialog";

/*
 * Whole-dialog story (issue #610): renders the real workspace background
 * panel dialog (`dialog-background-panel`) — layer list + layer editor +
 * live preview + footer actions.
 *
 * Layer state is loaded from the `workspaceBg` persistence key
 * (`workspaces/background/background-{panel}.json`) through
 * `readJsonText`, so stories seed raw JSON text per panel id.
 *
 * `<dialog open>` is absolutely positioned, so it needs a positioned,
 * fixed-size frame (same contract as `Preset/Dialog/Footage`, #514).
 */
const frameClass = css({
	position: "relative",
	height: "44rem",
	width: "52rem",
});

const LAYERS_JSON = JSON.stringify({
	layers: [
		{
			id: "layer-color-1",
			type: "color",
			enabled: true,
			// Issue #761: layer opacity contract is 0-100 (layer-factory
			// default 100, LayerEditor clamps 0-100, style.ts divides by
			// 100). `opacity: 1` rendered as 1% and blanked the preview.
			opacity: 100,
			color: "#1e1e2e",
		},
		{
			id: "layer-pattern-1",
			type: "pattern",
			enabled: true,
			opacity: 60,
			patternType: "dots",
		},
	],
});

const withSeed =
	(seed: Record<string, string>): Decorator =>
	(Story): JSX.Element => (
		<OnlineServicesBoundary persistenceSeed={seed}>
			<div className={frameClass}>
				<Story />
			</div>
		</OnlineServicesBoundary>
	);

const meta = {
	title: "Workspace/Dialog/Background",
	render: () => <WorkspaceBackgroundDialog panelId={1} />,
} satisfies Meta;

export default meta;
type Story = StoryObj;

const expectShell = (canvasElement: HTMLElement): HTMLElement => {
	const shell = canvasElement.querySelector<HTMLElement>("[data-dialog-shell]");
	if (!shell) throw new Error("dialog shell not found");
	assertRendered(shell, { label: "background dialog shell" });
	expect(shell.getAttribute("data-surface-id")).toBe("dialog-background-panel");
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

export const Empty: Story = {
	decorators: [withSeed({})],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const shell = expectShell(canvasElement);
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Background layer - Panel 1");
		});
		const footer = shell.querySelector("footer");
		if (!footer) throw new Error("dialog footer not found");
		const labels = Array.from(footer.querySelectorAll("button")).map((button) =>
			button.textContent?.trim(),
		);
		expect(labels).toContain("Clear all");
		expect(labels).toContain("Cancel");
		expect(labels).toContain("Save");
		// Issue #768: the footer contract (dialog/shell/Footer.tsx) allows
		// leading icons on destructive actions only — none of these
		// non-destructive buttons may render one.
		for (const button of footer.querySelectorAll("button")) {
			expect(button.querySelector("svg")).toBeNull();
		}
		// Issue #754: the default layer colour (#1e1e1e) is the first preset
		// swatch — its selection ring must be perceptible (ink-40), not the
		// near-invisible ink-12 that read as "no selection". Preset swatches
		// carry `title={color}`; the layer-list chip must not match. The
		// editor mounts after the async persistence read, so poll for it.
		await waitFor(() => {
			const swatch = canvasElement.querySelector<HTMLButtonElement>(
				'button[title="#1e1e1e"]',
			);
			if (!swatch) throw new Error("selected colour swatch not found");
			const ring = getComputedStyle(swatch).boxShadow;
			expect(ring).not.toBe("none");
			const alphaMatch = ring.match(/rgba?\([^)]*,\s*([\d.]+)\)/);
			expect(alphaMatch ? Number.parseFloat(alphaMatch[1]) : 0).toBeGreaterThan(
				0.3,
			);
		});
	},
};

export const WithLayers: Story = {
	decorators: [withSeed({ "workspaceBg:1": LAYERS_JSON })],
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		expectShell(canvasElement);
		// The seeded color + pattern layers render in the layer list once
		// the async persistence read resolves — the pattern layer's type
		// label ("Dots") is the observable signal.
		await waitFor(() => {
			expect(canvasElement.textContent).toContain("Dots");
		});
		expect(canvasElement.textContent).toContain("Color");
		// Issue #754: the seeded pattern layer carries no `patternColor`, so
		// the preview must still paint the dots gradient — the old
		// `var(--color-ws-transparent-rgb-*)` fallback invalidated the whole
		// `background-image` and the box rendered solid.
		const preview = Array.from(
			canvasElement.querySelectorAll<HTMLElement>("div"),
		).find((el) => el.style.backgroundImage.includes("radial-gradient"));
		if (!preview) throw new Error("background preview gradient not found");
		expect(preview.style.backgroundImage).not.toContain("ws-transparent-rgb");
		// Issue #761: layer opacity is a 0-100 contract — the seeded color
		// layer (opacity 100) must bake alpha 1 and the pattern layer
		// (opacity 60) alpha 0.6 into the rendered gradients. A 0-1 fixture
		// produced ~1%/0.6% alphas and a blank preview.
		// Note: the DOM serializes alpha-1 `rgba()` as `rgb()`, and
		// comma-separated channels gain spaces.
		expect(preview.style.backgroundImage).toContain("rgb(30, 30, 46)");
		expect(preview.style.backgroundImage).toContain("rgba(56, 56, 56, 0.6)");
		expect(preview.style.backgroundImage).not.toContain("0.01");
	},
};
