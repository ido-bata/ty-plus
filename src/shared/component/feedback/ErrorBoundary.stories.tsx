import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { expect } from "storybook/test";

import { expectCanvasLayout } from "@/storybook/quality/layout";

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
export const Default: Story = {
	// Issue #194: initial-state layout contract.
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};

/**
 * An always-throwing child triggers the owner-provided fallback UI.
 */
export const Fallback: Story = {
	// Issue #194: error-state coverage — the fallback must render inside
	// the viewport without horizontal page overflow.
	play: async ({ canvasElement }) => {
		expect(canvasElement.textContent).toContain("Something went wrong.");
		expectCanvasLayout(canvasElement);
	},
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
