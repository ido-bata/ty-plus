import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { expect } from "storybook/test";
import { expectCanvasLayout } from "@/storybook/quality/layout";
import { CollapsibleGroupHeader } from "./CollapsibleGroupHeader";

type Args = {
	title: string;
	count: number;
	defaultOpen: boolean;
	children: ReactNode;
	onToggle: ((isOpen: boolean) => void) | undefined;
};

// Issue #529: the sample body must agree with the count badge — a fixed
// "3 presets" line contradicted ZeroCount (badge 0) and ManyItems
// (badge 248). Production feeds the real preset list as children, so the
// fixture derives its text from the same count arg.
const SampleChild = ({ count }: { count: number }): ReactNode => (
	<div
		style={{
			padding: "4px 8px",
			fontSize: 11,
			color: "#a0a0a0",
		}}
	>
		{count} presets in this group
	</div>
);

const meta = {
	title: "DirectoryBrowser/CollapsibleGroupHeader",
	component: CollapsibleGroupHeader,
	args: {
		title: "Glow Effects",
		count: 12,
		defaultOpen: true,
		children: <SampleChild count={12} />,
		onToggle: undefined,
	},
	decorators: [
		(Story) => (
			<div style={{ minWidth: 280, padding: 8, background: "#252525" }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

// Issue #194: group header states (open/closed/zero-count) must keep the
// toggle control inside the layout contract — empty groups are an
// explicit product state, not a missing render.
const playGroupLayout = async ({
	canvasElement,
	args,
}: {
	canvasElement: HTMLElement;
	args: Args;
}): Promise<void> => {
	expectCanvasLayout(canvasElement, {
		requireRenderedSelector: "button",
	});
	// Issue #475: the group must not dim its whole subtree — a global
	// `opacity` on the container used to drop header/count/body contrast
	// to ~2:1. The surface/border tokens carry the grouping instead.
	const group = canvasElement.querySelector<HTMLElement>(
		"[data-directory-browser-group]",
	);
	if (!group) throw new Error("group container not found");
	expect(getComputedStyle(group).opacity).toBe("1");
	// Issue #529: when the panel is open, the sample body must agree with
	// the count badge — the fixture derives both from the same arg.
	if (args.defaultOpen !== false) {
		expect(group.textContent).toContain(`${args.count} presets`);
	}
};

export const Default: Story = {
	play: playGroupLayout,
};

export const Closed: Story = {
	args: { defaultOpen: false },
	play: playGroupLayout,
};

export const ManyItems: Story = {
	args: {
		count: 248,
		title: "Motion presets",
		children: <SampleChild count={248} />,
	},
	play: playGroupLayout,
};

export const ZeroCount: Story = {
	args: {
		count: 0,
		title: "Empty group",
		children: <SampleChild count={0} />,
	},
	play: playGroupLayout,
};

export const WithToggleHandler: Story = {
	args: { onToggle: () => undefined, title: "Transitions" },
};

// Issue #166: the header is a real toggle — a click must flip
// `aria-expanded`, rotate the chevron, and unmount the panel. The
// post-play collapsed state is what the capture pipeline screenshots.
export const ToggleOnClick: Story = {
	args: { onToggle: () => undefined, title: "Transitions" },
	play: async ({ canvasElement }) => {
		const button = canvasElement.querySelector("button");
		if (!button) throw new Error("group toggle button not found");
		const group = canvasElement.querySelector<HTMLElement>(
			"[data-directory-browser-group]",
		);
		if (!group) throw new Error("group container not found");
		await expect(button.getAttribute("aria-expanded")).toBe("true");
		await expect(group.textContent).toContain("presets in this group");
		const { userEvent } = await import("vitest/browser");
		await userEvent.click(button);
		await expect(button.getAttribute("aria-expanded")).toBe("false");
		await expect(group.textContent).not.toContain("presets in this group");
	},
};
