import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/shared/component/controls/Button";
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
				borderWidth: "1px",
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

export const SingleAction: Story = {
	args: { actionsCount: 1 },
};

export const CancelAndPrimary: Story = {
	args: { actionsCount: 2 },
};

export const SecondaryCancelPrimary: Story = {
	args: { actionsCount: 3 },
};
