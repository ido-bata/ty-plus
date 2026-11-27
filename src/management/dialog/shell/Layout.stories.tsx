import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@ty-plus/ui";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";
import { DialogFooterActions } from "./Footer";
import { Shell } from "./Layout";

/*
 * Modifier demo (issue #450): the legacy `wsd-root--*` names never had a
 * stylesheet, so they could not produce a visible difference. The story now
 * passes a real Panda class through `rootClassName` — the contract being
 * tested is "a modifier class reaches the shell root and changes its
 * appearance".
 */
const modifierDemoClass = css({ bg: "surface.panel" });

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
								borderWidth: "hairline",
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
		const actions = canvasElement.querySelector("[data-dialog-footer-actions]");
		expect(actions).not.toBeNull();
		const footer = canvasElement.querySelector("[data-dialog-footer]");
		const lastButton = actions?.querySelector("button:last-child");
		expect(footer).not.toBeNull();
		expect(lastButton).not.toBeNull();
		if (!footer || !lastButton || !actions) return;
		// Issue #674: the footer band owns the canonical inline inset, so the
		// last action sits one `padding-inline` inside the footer edge — the
		// same inset `Content` applies to the body.
		const footerStyle = getComputedStyle(footer);
		const content = canvasElement.querySelector("[data-dialog-content]");
		if (content) {
			const contentStyle = getComputedStyle(content);
			expect(footerStyle.paddingLeft).toBe(contentStyle.paddingLeft);
			expect(footerStyle.paddingRight).toBe(contentStyle.paddingRight);
		}
		const insetRight = Number.parseFloat(footerStyle.paddingRight);
		expect(
			Math.abs(
				footer.getBoundingClientRect().right -
					insetRight -
					lastButton.getBoundingClientRect().right,
			),
		).toBeLessThanOrEqual(1);
		// Issue #732: the action group is compact — bounded equal columns
		// anchored right, never stretched to the full footer width.
		const actionsRect = actions.getBoundingClientRect();
		const footerRect = footer.getBoundingClientRect();
		expect(actionsRect.width).toBeLessThan(footerRect.width * 0.9);
		const buttons = Array.from(actions.querySelectorAll("button"));
		expect(buttons.length).toBeGreaterThan(0);
		const widths = buttons.map((b) => b.getBoundingClientRect().width);
		const firstWidth = widths[0] ?? 0;
		for (const w of widths) {
			expect(Math.abs(w - firstWidth)).toBeLessThanOrEqual(1);
		}
	},
};

export const WithMeta: Story = {
	args: { meta: "panel-3 · 4 layers" },
};

export const WithModifier: Story = {
	args: { modifier: modifierDemoClass },
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
		// Issue #674: footer horizontal inset must match the content inset.
		const content = canvasElement.querySelector(
			"[data-dialog-content]",
		) as HTMLElement | null;
		if (!content) throw new Error("Dialog content not rendered");
		const contentStyle = getComputedStyle(content);
		if (footerStyle.paddingLeft !== contentStyle.paddingLeft) {
			throw new Error(
				`Dialog footer padding-left "${footerStyle.paddingLeft}" does not match content "${contentStyle.paddingLeft}"`,
			);
		}
		if (footerStyle.paddingRight !== contentStyle.paddingRight) {
			throw new Error(
				`Dialog footer padding-right "${footerStyle.paddingRight}" does not match content "${contentStyle.paddingRight}"`,
			);
		}
		expectCanvasLayout(canvasElement);
	},
};
