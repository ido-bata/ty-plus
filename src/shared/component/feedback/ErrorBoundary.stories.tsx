import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

import { ErrorBoundary } from "./ErrorBoundary";

function AlwaysThrows(): ReactNode {
	throw new Error("Intentional preview error for the fallback story.");
}

const meta = {
	title: "Shared/Feedback/ErrorBoundary",
	component: ErrorBoundary,
	argTypes: {
		children: { control: "text" },
		fallback: { control: false },
		resetKeys: { control: false },
		onError: { control: false },
		onReset: { control: false },
	},
	args: {
		children: "Content rendered without errors.",
		fallback: "Something went wrong.",
	},
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Healthy children pass through untouched.
 */
export const Default: Story = {};

/**
 * An always-throwing child triggers the owner-provided fallback UI.
 */
export const Fallback: Story = {
	render: (args) => (
		<ErrorBoundary
			{...args}
			fallback={
				<div className="rounded-shell-sm border border-border-default bg-surface-widget p-3">
					<p className="text-text-primary">Something went wrong.</p>
					<p className="text-(length:--ty-shell-text-size-sm) text-text-muted">
						The owner of this boundary provides this message.
					</p>
				</div>
			}
		>
			<AlwaysThrows />
		</ErrorBoundary>
	),
};
