import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@ty-plus/ui";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import { DialogFooterActions, Footer } from "./Footer";

const meta = {
	title: "Dialog/Shell/Footer",
	args: {
		actionsCount: 1,
	},
	argTypes: {
		actionsCount: {
			control: { type: "inline-radio" },
			options: [1, 2, 3],
		},
	},
	render: (args: { actionsCount: number }) => (
		<div
			className={css({
				width: "80",
				borderRadius: "shell-sm",
				borderWidth: "hairline",
				borderStyle: "solid",
				borderColor: "border.default",
				bg: "surface.dialog",
			})}
		>
			<Footer>
				<span className={css({ fontSize: "text-xs", color: "text.muted" })}>
					Status line / meta
				</span>
				{args.actionsCount === 1 ? (
					<DialogFooterActions>
						<Button variant="primary" fullWidth>
							Apply
						</Button>
					</DialogFooterActions>
				) : null}
				{args.actionsCount === 2 ? (
					<DialogFooterActions>
						<Button variant="ghost" fullWidth>
							Cancel
						</Button>
						<Button variant="primary" fullWidth>
							Apply
						</Button>
					</DialogFooterActions>
				) : null}
				{args.actionsCount === 3 ? (
					<DialogFooterActions>
						<Button variant="default" fullWidth>
							Reset
						</Button>
						<Button variant="ghost" fullWidth>
							Cancel
						</Button>
						<Button variant="primary" fullWidth>
							Apply
						</Button>
					</DialogFooterActions>
				) : null}
			</Footer>
		</div>
	),
} satisfies Meta<{ actionsCount: number }>;

export default meta;
type Story = StoryObj<{ actionsCount: number }>;

/*
 * Issue #735 regression guards. The footer contract is:
 *
 *   - the footer band owns the canonical inline inset (no flush edges);
 *   - the status label keeps a single line — the actions grid must not
 *     claim `width: 100%` and starve it;
 *   - action buttons size to their labels (equal-width columns) and anchor
 *     right — a lone action must never stretch across the dialog.
 */
const expectFooterContract = (
	canvasElement: HTMLElement,
	{ singleAction }: { singleAction: boolean },
): void => {
	const footer = canvasElement.querySelector<HTMLElement>(
		"[data-dialog-footer]",
	);
	const actions = canvasElement.querySelector<HTMLElement>(
		"[data-dialog-footer-actions]",
	);
	const status = footer?.querySelector<HTMLElement>("span");
	const buttons = actions
		? [...actions.querySelectorAll<HTMLElement>("button")]
		: [];
	expect(footer).not.toBeNull();
	expect(actions).not.toBeNull();
	expect(status).not.toBeNull();
	expect(buttons.length).toBeGreaterThan(0);
	if (!footer || !actions || !status || buttons.length === 0) return;

	// Inline padding: the footer band insets its content from the dialog
	// edge (canonical `--ty-shell-pad-inline`, 8px).
	const footerStyle = getComputedStyle(footer);
	const inlinePadding = Number.parseFloat(footerStyle.paddingLeft);
	expect(inlinePadding).toBeGreaterThan(0);
	expect(footerStyle.paddingLeft).toBe(footerStyle.paddingRight);

	// Status label stays on one line: its height must not exceed ~1.6x the
	// computed line-height (two lines would be ~2x).
	const statusStyle = getComputedStyle(status);
	const lineHeight = Number.parseFloat(statusStyle.lineHeight);
	const statusHeight = status.getBoundingClientRect().height;
	if (Number.isFinite(lineHeight) && lineHeight > 0) {
		expect(statusHeight).toBeLessThanOrEqual(lineHeight * 1.6);
	}

	const footerWidth = footer.getBoundingClientRect().width;
	const actionsWidth = actions.getBoundingClientRect().width;
	const actionsRight = actions.getBoundingClientRect().right;
	const footerRight = footer.getBoundingClientRect().right;

	// Right anchoring: the actions grid ends one inline-padding inside the
	// footer edge.
	expect(
		Math.abs(
			footerRight - Number.parseFloat(footerStyle.paddingRight) - actionsRight,
		),
	).toBeLessThanOrEqual(1);

	if (singleAction) {
		// A lone action sizes to its label — never a dialog-wide bar.
		expect(actionsWidth).toBeLessThan(footerWidth * 0.5);
	} else {
		// Equal-width columns: every action button renders at the same width.
		const widths = buttons.map((b) => b.getBoundingClientRect().width);
		for (const w of widths) {
			expect(Math.abs(w - widths[0])).toBeLessThanOrEqual(1);
		}
	}
};

export const SingleAction: Story = {
	args: { actionsCount: 1 },
	play: async ({ canvasElement }) => {
		expectFooterContract(canvasElement, { singleAction: true });
	},
};

export const CancelAndPrimary: Story = {
	args: { actionsCount: 2 },
	play: async ({ canvasElement }) => {
		expectFooterContract(canvasElement, { singleAction: false });
	},
};

export const SecondaryCancelPrimary: Story = {
	args: { actionsCount: 3 },
	play: async ({ canvasElement }) => {
		expectFooterContract(canvasElement, { singleAction: false });
	},
};
