import type { Meta, StoryObj } from "@storybook/react";
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

type Args = {
	title: string;
	meta: string;
	modifier: string;
	withFooter: boolean;
	withAfterBody: boolean;
};

const baseArgs: Args = {
	title: "Dialog shell",
	meta: "panel-1",
	modifier: "",
	withFooter: false,
	withAfterBody: false,
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
							className={css({
								borderTopWidth: "1px",
								borderTopStyle: "solid",
								borderColor: "border.default",
								px: "3",
								py: "2",
								fontSize: "text-xs",
								color: "text.muted",
							})}
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
			</WorkspaceShell>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithFooter: Story = {
	args: { withFooter: true },
};

export const WithAfterBody: Story = {
	args: { withAfterBody: true },
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
