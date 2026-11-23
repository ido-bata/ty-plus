import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@ty-plus/ui/controls/Button";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { Shell } from "./Layout";
import { DialogFooterActions } from "./Footer";

type Args = {
	title: string;
	meta: string;
	modifier: string;
	footer: boolean;
};

const baseArgs: Args = {
	title: "Workspace",
	meta: "panel-1",
	modifier: "",
	footer: false,
};

const meta = {
	title: "Dialog/Shell/Layout",
	args: baseArgs,
	argTypes: {
		title: { control: "text" },
		meta: { control: "text" },
		modifier: { control: "text" },
		footer: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "96",
				width: "480px",
				flexDirection: "column",
				// `<dialog open>` is absolutely positioned; without a
				// positioned ancestor it resolves against the viewport and
				// escapes this fixed-size frame (issue #514).
				position: "relative",
			})}
		>
			<Shell
				surfaceId="storybook-shell-1"
				title={args.title}
				headerMeta={args.meta}
				rootClassName={args.modifier}
				footer={
					args.footer ? (
						<DialogFooterActions>
							<Button variant="ghost" fullWidth>
								Cancel
							</Button>
							<Button variant="primary" fullWidth>
								Apply
							</Button>
						</DialogFooterActions>
					) : null
				}
			>
				<div className={css({ display: "grid", gap: "2", p: "3" })}>
					<p
						className={css({
							margin: "0",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						Shell wraps header + scroll body. Content here scrolls inside the
						dialog content area.
					</p>
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={`row-${i}`}
							className={css({
								borderRadius: "shell-sm",
								borderWidth: "1px",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
								px: "3",
								py: "2",
								fontSize: "text-xs",
								color: "text.primary",
							})}
						>
							Section {i + 1}
						</div>
					))}
				</div>
			</Shell>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/*
 * Issue #514: `<dialog open>` is absolutely positioned, so it must stay
 * inside the story's fixed-size frame — a regression that drops the
 * frame's `position: relative` lets the shell escape to the viewport.
 */
const expectShellInsideFrame = (canvasElement: HTMLElement): void => {
	const shell = canvasElement.querySelector("[data-dialog-shell]");
	expect(shell).not.toBeNull();
	const frame = shell?.parentElement;
	expect(frame).not.toBeNull();
	if (!shell || !frame) return;
	const shellRect = shell.getBoundingClientRect();
	const frameRect = frame.getBoundingClientRect();
	expect(shellRect.top).toBeGreaterThanOrEqual(frameRect.top - 1);
	expect(shellRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 1);
	expect(shellRect.left).toBeGreaterThanOrEqual(frameRect.left - 1);
	expect(shellRect.right).toBeLessThanOrEqual(frameRect.right + 1);
};

export const Default: Story = {
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
	},
};

export const WithFooter: Story = {
	args: { footer: true },
	play: async ({ canvasElement }) => {
		expectShellInsideFrame(canvasElement);
		// Issue #514: the footer must use the canonical
		// `DialogFooterActions` grid — an ad-hoc flex row cannot reproduce
		// the equal-width, right-anchored production layout.
		const actions = canvasElement.querySelector(
			"[data-dialog-footer-actions]",
		);
		expect(actions).not.toBeNull();
		const footer = canvasElement.querySelector("[data-dialog-footer]");
		const lastButton = actions?.querySelector("button:last-child");
		expect(footer).not.toBeNull();
		expect(lastButton).not.toBeNull();
		if (!footer || !lastButton) return;
		expect(
			Math.abs(
				lastButton.getBoundingClientRect().right -
					footer.getBoundingClientRect().right,
			),
		).toBeLessThanOrEqual(1);
	},
};

export const WithMeta: Story = {
	args: { meta: "panel-3 · 4 layers" },
};

export const WithModifier: Story = {
	args: { modifier: "wsd-root--shell-flush" },
};

/**
 * Regression guard for #127: lock the computed style of the dialog shell root
 * so a future Tailwind regression that drops layout cannot land silently.
 * Reads computed CSS — not class strings — so a Panda-only production build
 * with the same shape but different generated class names still passes.
 */
export const ComputedStyleShell: Story = {
	args: { ...baseArgs },
	play: async ({ canvasElement }) => {
		// Issue #194: dialog shell controls must satisfy the layout
		// contract — inside the viewport, unclipped by the shell's own
		// overflow:hidden.
		expectCanvasLayout(canvasElement);
		const root = canvasElement.querySelector(
			"[data-surface-id='storybook-shell-1']",
		) as HTMLElement | null;
		if (!root) throw new Error("Dialog shell root not rendered");
		const rootStyle = getComputedStyle(root);
		if (rootStyle.display !== "flex") {
			throw new Error(
				`Dialog shell display expected "flex", got "${rootStyle.display}"`,
			);
		}
		if (rootStyle.flexDirection !== "column") {
			throw new Error(
				`Dialog shell flex-direction expected "column", got "${rootStyle.flexDirection}"`,
			);
		}
		if (rootStyle.overflow !== "hidden") {
			throw new Error(
				`Dialog shell overflow expected "hidden", got "${rootStyle.overflow}"`,
			);
		}
		if (rootStyle.boxSizing !== "border-box") {
			throw new Error(
				`Dialog shell box-sizing expected "border-box", got "${rootStyle.boxSizing}"`,
			);
		}
		const content = canvasElement.querySelector(
			"[data-dialog-content]",
		) as HTMLElement | null;
		if (!content) throw new Error("Dialog content not rendered");
		const contentStyle = getComputedStyle(content);
		if (contentStyle.flex !== "1 1 0%") {
			throw new Error(
				`Dialog content flex expected "1 1 0%", got "${contentStyle.flex}"`,
			);
		}
		if (contentStyle.overflowX !== "hidden") {
			throw new Error(
				`Dialog content overflow-x expected "hidden", got "${contentStyle.overflowX}"`,
			);
		}
		expectCanvasLayout(canvasElement);
	},
};

export const ComputedStyleShellWithFooter: Story = {
	args: { ...baseArgs, footer: true },
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const footer = canvasElement.querySelector(
			"[data-dialog-footer]",
		) as HTMLElement | null;
		if (!footer) throw new Error("Dialog footer not rendered");
		const footerStyle = getComputedStyle(footer);
		if (footerStyle.display !== "flex") {
			throw new Error(
				`Dialog footer display expected "flex", got "${footerStyle.display}"`,
			);
		}
		if (footerStyle.alignItems !== "center") {
			throw new Error(
				`Dialog footer align-items expected "center", got "${footerStyle.alignItems}"`,
			);
		}
		if (footerStyle.justifyContent !== "space-between") {
			throw new Error(
				`Dialog footer justify-content expected "space-between", got "${footerStyle.justifyContent}"`,
			);
		}
		expectCanvasLayout(canvasElement);
	},
};
