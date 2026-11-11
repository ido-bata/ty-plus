import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { LoadingSpinner } from "./LoadingSpinner";

const meta = {
	title: "Shared/Feedback/LoadingSpinner",
	component: LoadingSpinner,
	argTypes: {
		label: {
			control: "text",
			description: "Accessible label exposed via aria-label and sr-only text.",
		},
		size: {
			control: { type: "inline-radio" },
			options: ["sm", "md", "lg"],
			description: "Spinner diameter token.",
		},
		className: {
			control: "text",
			description: "Additional classes appended to the root element.",
		},
	},
	args: {
		label: "Loading",
		size: "md",
		className: undefined,
	},
} satisfies Meta<typeof LoadingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default medium spinner with the "Loading" accessible label.
 */
export const Default: Story = {};

/**
 * All three sizes side-by-side for visual comparison.
 */
export const Sizes: Story = {
	render: (args) => (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "4",
				color: "text.primary",
			})}
		>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<LoadingSpinner {...args} size="sm" label="Loading small" />
				<span className={css({ fontSize: "shell-text-sm" })}>sm</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<LoadingSpinner {...args} size="md" label="Loading medium" />
				<span className={css({ fontSize: "shell-text-sm" })}>md</span>
			</div>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1",
				})}
			>
				<LoadingSpinner {...args} size="lg" label="Loading large" />
				<span className={css({ fontSize: "shell-text-sm" })}>lg</span>
			</div>
		</div>
	),
};

/**
 * Custom accessible label rendered both on aria-label and the
 * sr-only span for screen-reader users.
 */
export const CustomLabel: Story = {
	args: {
		label: "Fetching thumbnails",
	},
};
