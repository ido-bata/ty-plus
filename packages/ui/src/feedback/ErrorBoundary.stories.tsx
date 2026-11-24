import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { expect } from "storybook/test";

import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

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
		// Issue #517: the fallback card must actually be styled — dead
		// utility classes used to leave it as bare text on the canvas.
		const card = canvasElement.querySelector<HTMLElement>(
			"[data-error-fallback]",
		);
		if (!card) throw new Error("fallback card not found");
		const style = getComputedStyle(card);
		expect(style.borderWidth).not.toBe("0px");
		expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
		expect(style.backgroundColor).not.toBe("transparent");
		expectCanvasLayout(canvasElement);
	},
	render: (args) => (
		<ErrorBoundary
			{...args}
			fallback={
				// Issue #517: Tailwind-style utility literals produce no CSS
				// in the Panda-only bundle — the card rendered unstyled.
				<div
					data-error-fallback
					className={css({
						borderRadius: "shell-sm",
						borderWidth: "hairline",
						borderStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.widget",
						padding: "3",
					})}
				>
					<p className={css({ color: "text.primary" })}>
						Something went wrong.
					</p>
					<p
						className={css({
							fontSize: "shell-text-sm",
							color: "text.muted",
						})}
					>
						The owner of this boundary provides this message.
					</p>
				</div>
			}
		>
			<AlwaysThrows />
		</ErrorBoundary>
	),
};
