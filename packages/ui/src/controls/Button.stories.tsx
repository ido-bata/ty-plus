import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import {
	assertBorderToken,
	borderTopColor,
	resolveBorderToken,
} from "@/storybook/quality/border";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { css } from "@/styled-system/css";

import { Button } from "./Button";

const meta = {
	title: "Shared/Controls/Button",
	component: Button,
	argTypes: {
		variant: {
			control: { type: "select" },
			options: [
				"bare",
				"primary",
				"default",
				"secondary",
				"outline",
				"ghost",
				"danger",
			],
		},
		uiSize: {
			control: { type: "select" },
			options: ["sm", "md", "lg"],
		},
		fullWidth: { control: "boolean" },
		disabled: { control: "boolean" },
		children: { control: "text" },
		start: { control: false },
		end: { control: false },
	},
	args: {
		variant: "default",
		uiSize: "md",
		fullWidth: false,
		disabled: false,
		children: "Click me",
	},
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	// Issue #194: initial-state layout contract — every rendered control
	// must sit inside the viewport and not be clipped by hidden-overflow
	// ancestors. Capture success alone is not a visual pass.
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};

export const Disabled: Story = {
	args: { disabled: true },
};

/*
 * Issue #763: a disabled `primary` button must not keep the accent fill —
 * review captures showed the settings "Open GitHub issue" / "Open panel
 * editor" CTAs reading as active steel-blue buttons. The resting fill
 * must match the muted `surface.widget` tier every other disabled
 * control uses, probed through the same Panda token (not a literal).
 */
export const DisabledPrimary: Story = {
	args: { variant: "primary", disabled: true },
	render: (args) => (
		<div className={css({ display: "flex", gap: "2" })}>
			<Button {...args}>Disabled primary</Button>
			<Button {...args} disabled={false}>
				Enabled primary
			</Button>
		</div>
	),
	play: async ({ canvasElement }) => {
		const buttons = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		);
		const disabledBtn = buttons.find((b) => b.disabled);
		const enabledBtn = buttons.find((b) => !b.disabled);
		if (!disabledBtn || !enabledBtn) {
			throw new Error("disabled/enabled primary buttons not found");
		}
		const probe = document.createElement("div");
		probe.className = css({ backgroundColor: "surface.widget" });
		document.body.appendChild(probe);
		try {
			expect(getComputedStyle(disabledBtn).backgroundColor).toBe(
				getComputedStyle(probe).backgroundColor,
			);
		} finally {
			probe.remove();
		}
		// And it must differ from the enabled accent fill.
		expect(getComputedStyle(disabledBtn).backgroundColor).not.toBe(
			getComputedStyle(enabledBtn).backgroundColor,
		);
		// Issue #798: the disabled primary must keep the disabled-control
		// chrome — a hairline `border.subtle` frame like every other
		// disabled variant — not render as chromeless text.
		expect(getComputedStyle(disabledBtn).borderTopWidth).not.toBe("0px");
		expect(borderTopColor(disabledBtn)).toBe(resolveBorderToken("subtle"));
	},
};

// Issue #146: hover-state capture — a real-pointer hover must lift the
// button to `interactive.hover`; the post-play state is screenshotted.
export const Hovered: Story = {
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		const button = canvasElement.querySelector("button");
		if (!button) throw new Error("button not found");
		const { userEvent } = await import("vitest/browser");
		const resting = getComputedStyle(button).backgroundColor;
		await userEvent.hover(button);
		await expect(button.matches(":hover")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(button).backgroundColor).not.toBe(resting);
		expectCanvasLayout(canvasElement);
	},
};

// Issue #194: keyboard focus must reach the button and the layout
// contract must still hold while focused.
export const Focused: Story = {
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector("button");
		if (!button) throw new Error("button not found");
		button.focus();
		await expect(document.activeElement).toBe(button);
		await expect(button.matches(":focus")).toBe(true);
		expectCanvasLayout(canvasElement);
	},
};

// Issue #194: long-string coverage — an over-long label must not push
// page-level horizontal overflow or escape the viewport.
export const LongLabel: Story = {
	args: {
		children:
			"Apply this preset to the selected layers with an extremely long descriptive label that keeps going",
	},
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
	},
};

export const AllVariants: Story = {
	render: (args) => (
		<div className={css({ display: "flex", flexWrap: "wrap", gap: "2" })}>
			<Button {...args} variant="primary">
				Primary
			</Button>
			<Button {...args} variant="default">
				Default
			</Button>
			<Button {...args} variant="secondary">
				Secondary
			</Button>
			<Button {...args} variant="outline">
				Outline
			</Button>
			<Button {...args} variant="ghost">
				Ghost
			</Button>
			<Button {...args} variant="danger">
				Danger
			</Button>
		</div>
	),
	play: async ({ canvasElement }) => {
		expectCanvasLayout(canvasElement);
		// Issue #722: bordered non-primary variants rest on the
		// non-assertive `border.subtle` tier — ghost included.
		// Issue #761: `outline` is the exception — its whole purpose is a
		// visible frame on a transparent surface, so it rests on
		// `border.control` (the old `border.strong` #0e0e0e was darker than
		// the dark canvas and rendered the frame invisible).
		const byText = (label: string): HTMLButtonElement => {
			const el = Array.from(
				canvasElement.querySelectorAll<HTMLButtonElement>("button"),
			).find((b) => b.textContent === label);
			if (!el) throw new Error(`button "${label}" not found`);
			return el;
		};
		for (const label of ["Default", "Secondary", "Ghost", "Danger"]) {
			const el = byText(label);
			assertBorderToken(el, "subtle");
			expect(borderTopColor(el)).not.toBe(resolveBorderToken("control"));
		}
		const outline = byText("Outline");
		assertBorderToken(outline, "control");
	},
};

export const AllSizes: Story = {
	render: (args) => (
		<div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
			<Button {...args} uiSize="sm">
				Small
			</Button>
			<Button {...args} uiSize="md">
				Medium
			</Button>
			<Button {...args} uiSize="lg">
				Large
			</Button>
		</div>
	),
	// Issue #798: the size story must vary ONLY the size tier — a review
	// capture read the large button as a different variant. Pin the
	// shared variant chrome (fill + border) across all three.
	play: async ({ canvasElement }) => {
		const buttons = Array.from(
			canvasElement.querySelectorAll<HTMLButtonElement>("button"),
		);
		expect(buttons).toHaveLength(3);
		const [first, ...rest] = buttons;
		for (const el of rest) {
			expect(getComputedStyle(el).backgroundColor).toBe(
				getComputedStyle(first).backgroundColor,
			);
			expect(borderTopColor(el)).toBe(borderTopColor(first));
		}
	},
};
