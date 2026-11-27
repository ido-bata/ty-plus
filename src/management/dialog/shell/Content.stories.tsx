import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { Content } from "./Content";

type Args = {
	showText: boolean;
	padding: boolean;
};

const baseArgs: Args = {
	showText: true,
	// Real dialogs pad their body (DialogBody / sheet classes own the block
	// inset); the canonical capture should show that representative state
	// rather than raw flush content (issue #735).
	padding: true,
};

const meta = {
	title: "Dialog/Shell/Content",
	args: baseArgs,
	argTypes: {
		showText: { control: "boolean" },
		padding: { control: "boolean" },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "72",
				width: "80",
				flexDirection: "column",
				borderRadius: "shell-sm",
				borderWidth: "hairline",
				borderStyle: "solid",
				borderColor: "border.default",
				bg: "surface.dialog",
			})}
		>
			<Content>
				<div className={args.padding ? css({ p: "3" }) : ""}>
					{args.showText ? (
						<p
							className={css({
								margin: "0",
								fontSize: "text-xs",
								color: "text.muted",
							})}
						>
							Dialog body content. The Content wrapper fills the available
							vertical space and handles scroll behavior.
						</p>
					) : null}
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
							gap: "2",
							pt: "2",
						})}
					>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "hairline",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "hairline",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "hairline",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
						<div
							className={css({
								height: "10",
								borderRadius: "shell-sm",
								borderWidth: "hairline",
								borderStyle: "solid",
								borderColor: "border.default",
								bg: "surface.widget",
							})}
						/>
					</div>
				</div>
			</Content>
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Minimal: Story = {
	args: { showText: false },
};

export const Scrollable: Story = {
	args: { padding: true },
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "72",
				width: "80",
				flexDirection: "column",
				borderRadius: "shell-sm",
				borderWidth: "hairline",
				borderStyle: "solid",
				borderColor: "border.default",
				bg: "surface.dialog",
			})}
		>
			<Content>
				{/*
				 * The row list lives in its own flex column so `Content`'s `gap`
				 * does not inject 12px between a divider and the next row's text
				 * (issue #735: asymmetric divider spacing). The last row drops its
				 * bottom border so the list does not hang a stray divider on the
				 * frame edge.
				 */}
				<div className={css({ display: "flex", flexDirection: "column" })}>
					{Array.from({ length: 16 }).map((_, i) => (
						<div
							key={`row-${i}`}
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "2",
								borderBottomWidth: "hairline",
								borderBottomStyle: "solid",
								borderColor: "border.default",
								py: "2",
								fontSize: "text-xs",
								color: "text.primary",
								_last: { borderBottomWidth: 0 },
							})}
						>
							<span
								className={css({
									fontFamily: "mono",
									opacity: 0.6,
								})}
							>
								{String(i + 1).padStart(2, "0")}
							</span>
							<span>Row {i + 1}</span>
						</div>
					))}
				</div>
				{args.showText ? (
					<p
						className={css({
							margin: "0",
							p: "3",
							fontSize: "text-xs",
							color: "text.muted",
						})}
					>
						Long content scrolls inside the Content frame.
					</p>
				) : null}
			</Content>
		</div>
	),
	play: async ({ canvasElement }) => {
		const content = canvasElement.querySelector<HTMLElement>(
			"[data-dialog-content]",
		);
		expect(content).not.toBeNull();
		if (!content) return;

		// The frame must actually overflow so the scrollbar contract is
		// exercised.
		expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);

		// Issue #735: the scrollbar thumb must be visible at rest — a fully
		// transparent thumb gives zero overflow affordance. `scrollbar-color`
		// computes to "<thumb> <track>"; assert the thumb alpha is non-zero.
		const scrollbarColor = getComputedStyle(content).scrollbarColor;
		const thumbMatch = scrollbarColor.match(/rgba?\([^)]*,\s*([\d.]+)\)/);
		expect(thumbMatch).not.toBeNull();
		expect(Number.parseFloat(thumbMatch?.[1] ?? "0")).toBeGreaterThan(0);

		// Divider symmetry: the last row drops its bottom border so the list
		// does not hang a stray divider on the frame edge.
		const rowDivs = [...content.querySelectorAll<HTMLElement>("div")];
		const lastRow = rowDivs
			.slice()
			.reverse()
			.find((el) => el.textContent === "16Row 16");
		expect(lastRow).not.toBeUndefined();
		if (lastRow) {
			expect(getComputedStyle(lastRow).borderBottomWidth).toBe("0px");
		}
	},
};
