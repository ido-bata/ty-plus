import type { Meta, StoryObj } from "@storybook/react";
import { cx } from "@ty-plus/ui";
import { Button } from "@ty-plus/ui/controls/Button";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { WorkspaceShell } from "./WorkspaceShell";

/*
 * Modifier demo: the legacy `wsd-root--*` names never had a stylesheet, so
 * they could not produce a visible difference.  The story now passes a real
 * Panda class through `rootModifierClasses` — the contract being tested is
 * "a modifier class reaches the shell root and changes its appearance".
 */
const panelModifierClass = css({ bg: "surface.panel" });

const expectRectInside = (inner: Element, outer: Element): void => {
	const innerRect = inner.getBoundingClientRect();
	const outerRect = outer.getBoundingClientRect();
	expect(innerRect.top).toBeGreaterThanOrEqual(outerRect.top - 1);
	expect(innerRect.bottom).toBeLessThanOrEqual(outerRect.bottom + 1);
	expect(innerRect.left).toBeGreaterThanOrEqual(outerRect.left - 1);
	expect(innerRect.right).toBeLessThanOrEqual(outerRect.right + 1);
};

type Args = {
	title: string;
	meta: string;
	modifier: string;
	withFooter: boolean;
	withAfterBody: boolean;
	bodyRows: number;
};

const baseArgs: Args = {
	title: "Dialog shell",
	meta: "panel-1",
	modifier: "",
	withFooter: false,
	withAfterBody: false,
	bodyRows: 6,
};

const meta = {
	title: "CEP/DialogShell",
	args: baseArgs,
	argTypes: {
		title: { control: "text" },
		meta: { control: "text" },
		modifier: { control: { type: "select" }, options: ["", "panel"] },
		withFooter: { control: "boolean" },
		withAfterBody: { control: "boolean" },
		bodyRows: { control: { type: "number", min: 0, max: 12, step: 1 } },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "96",
				width: "480px",
				flexDirection: "column",
			})}
		>
			<WorkspaceShell
				rootModifierClasses={
					args.modifier === "panel" ? [panelModifierClass] : []
				}
				title={args.title}
				meta={args.meta}
				footer={
					args.withFooter ? (
						<div
							className={css({
								display: "flex",
								// Issue #531: the footer element is itself a flex
								// row, so this wrapper shrink-wraps to its content
								// unless it claims the full width — without it
								// `justifyContent: "flex-end"` has no room to work
								// and the buttons stick to the left edge.
								width: "full",
								justifyContent: "flex-end",
								gap: "2",
							})}
						>
							<Button variant="ghost" fullWidth>
								Cancel
							</Button>
							<Button variant="primary" fullWidth>
								Apply
							</Button>
						</div>
					) : null
				}
				afterBody={
					args.withAfterBody ? (
						<div
							className={cx(
								"wsd-after-body",
								css({
									borderTopWidth: "1px",
									borderTopStyle: "solid",
									borderColor: "border.default",
									px: "3",
									py: "2",
									fontSize: "text-xs",
									color: "text.muted",
								}),
							)}
						>
							After-body strip — status / quick actions
						</div>
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
						CEP DialogShell surface (the actual CEP `Shell` is
						storybook-incompatible due to the file-drop plugin chain; this stub
						mirrors the shell frame).
					</p>
					{Array.from({ length: args.bodyRows }).map((_, i) => (
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
			</WorkspaceShell>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithFooter: Story = {
	args: { withFooter: true },
	/*
	 * Regression guard (#478): the footer must stay pinned below the scroll
	 * region — Cancel/Apply buttons clipped at the scrollport bottom edge
	 * made the labels unreadable in the fixed-height frame.
	 */
	play: async ({ canvasElement }) => {
		const root = canvasElement.querySelector(".wsd-root") as Element | null;
		const footer = canvasElement.querySelector(".wsd-footer") as Element | null;
		expect(root).not.toBeNull();
		expect(footer).not.toBeNull();
		expect((footer as Element).closest(".wsd-main-scroll")).toBeNull();
		expectRectInside(footer as Element, root as Element);
		const buttons = (footer as Element).querySelectorAll("button");
		expect(buttons.length).toBe(2);
		for (const button of buttons) {
			expectRectInside(button, footer as Element);
		}
		// Issue #531: `justifyContent: "flex-end"` must actually reach the
		// footer's inner right edge — the last button's right edge should
		// match the footer content-box right edge (minus its padding).
		const footerEl = footer as HTMLElement;
		const footerRect = footerEl.getBoundingClientRect();
		const footerPaddingRight = Number.parseFloat(
			getComputedStyle(footerEl).paddingRight,
		);
		const lastButton = buttons[buttons.length - 1] as HTMLElement;
		const buttonRect = lastButton.getBoundingClientRect();
		expect(
			Math.abs(footerRect.right - footerPaddingRight - buttonRect.right),
		).toBeLessThanOrEqual(1);
	},
};

export const WithAfterBody: Story = {
	args: { withAfterBody: true, bodyRows: 3 },
	/*
	 * Regression guard (#478): the after-body strip renders inside the
	 * scroll region, so the story keeps the body short enough that the
	 * whole strip is visible at the initial scroll position.
	 */
	play: async ({ canvasElement }) => {
		const scroll = canvasElement.querySelector(
			".wsd-main-scroll",
		) as Element | null;
		const strip = canvasElement.querySelector(
			".wsd-after-body",
		) as Element | null;
		expect(scroll).not.toBeNull();
		expect(strip).not.toBeNull();
		expectRectInside(strip as Element, scroll as Element);
	},
};

export const WithModifier: Story = {
	args: { modifier: "panel" },
};

/**
 * Regression guard: the header must be a single row — title left, meta
 * right — not stacked blocks.  The unstyled `wsd-*` classes used to fail
 * this silently (batch-00-background-1 review).
 */
export const HeaderRow: Story = {
	play: async ({ canvasElement }) => {
		const header = canvasElement.querySelector(".wsd-header");
		expect(header).not.toBeNull();
		expect(getComputedStyle(header as Element).display).toBe("flex");
		const title = canvasElement.querySelector(".wsd-title");
		const meta = canvasElement.querySelector(".wsd-meta");
		expect(title).not.toBeNull();
		expect(meta).not.toBeNull();
		const titleRect = (title as Element).getBoundingClientRect();
		const metaRect = (meta as Element).getBoundingClientRect();
		const titleMid = titleRect.top + titleRect.height / 2;
		const metaMid = metaRect.top + metaRect.height / 2;
		expect(Math.abs(titleMid - metaMid)).toBeLessThan(4);
		expect(metaRect.left).toBeGreaterThanOrEqual(titleRect.right - 1);
	},
};
