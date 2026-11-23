import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { SiblingListingEntry } from "@/management/preset/sibling-thumbnail";
import { FileEntryCard } from "./FileEntryCard";
import type { FileEntry } from "./FileEntryList";

const siblings: readonly SiblingListingEntry[] = [
	{ name: "alpha.png", path: "/preset/root/alpha.png", isDirectory: false },
];

type Args = {
	isSelected: boolean;
	showCheckbox: boolean;
	kind: "file" | "folder" | "image";
};

const buildEntry = (kind: Args["kind"]): FileEntry => {
	switch (kind) {
		case "file":
			return {
				path: "/preset/root/preset.ffx",
				name: "preset.ffx",
				isDirectory: false,
				fileType: "ae-preset",
			};
		case "folder":
			return {
				path: "/preset/root/nested",
				name: "nested",
				isDirectory: true,
			};
		case "image":
			return {
				path: "/preset/root/alpha.png",
				name: "alpha.png",
				isDirectory: false,
				fileType: "image",
				previewUrl:
					"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><rect width='8' height='8' fill='%2380a0ff'/></svg>",
			};
	}
};

const baseArgs: Args = {
	isSelected: false,
	showCheckbox: true,
	kind: "file",
};

const renderCard = (args: Args) => (
	<FileEntryCard
		entry={buildEntry(args.kind)}
		isSelected={args.isSelected}
		showCheckbox={args.showCheckbox}
		allEntries={siblings}
		aspect="square"
		onClick={() => undefined}
		onDoubleClick={() => undefined}
		onToggle={() => undefined}
	/>
);

const meta = {
	title: "Storage/FileEntry/FileEntryCard",
	args: baseArgs,
	argTypes: {
		isSelected: { control: "boolean" },
		showCheckbox: { control: "boolean" },
		kind: {
			control: { type: "select" },
			options: ["file", "folder", "image"],
		},
	},
	decorators: [
		(Story) => (
			<div style={{ width: 112 }}>
				<Story />
			</div>
		),
	],
	render: renderCard,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Selected: Story = {
	args: { isSelected: true },
};

export const Folder: Story = {
	args: { kind: "folder" },
};

export const ImageWithPreview: Story = {
	args: { kind: "image" },
};

export const NoCheckbox: Story = {
	args: { showCheckbox: false },
};

// Issue #146: hover must lift an unselected card to interactive.hover.
// Assert the computed background actually changes on hover — a static
// screenshot cannot distinguish "hover style missing" from "hover style
// identical to resting state".
export const HoverUnselected: Story = {
	play: async ({ canvasElement }) => {
		const card = canvasElement.querySelector<HTMLElement>(
			"[data-card-selected]",
		);
		if (!card) throw new Error("icon card not found");
		// `storybook/test`'s userEvent does not move the real pointer in the
		// vitest browser project, so CSS :hover never engages. Drive real
		// input through vitest browser's userEvent instead (dynamic import
		// keeps Storybook dev/build from evaluating the browser-only module).
		const { userEvent } = await import("vitest/browser");
		// The pointer may already sit over the centered card from a previous
		// story — park it on a corner spacer so the resting style is real.
		const spacer = document.createElement("div");
		spacer.style.cssText = "position:fixed;top:0;left:0;width:8px;height:8px;";
		document.body.appendChild(spacer);
		await userEvent.hover(spacer);
		await new Promise((resolve) => setTimeout(resolve, 300));
		const resting = getComputedStyle(card).backgroundColor;
		await userEvent.hover(card);
		await expect(card.matches(":hover")).toBe(true);
		// The card transitions colors — wait for the transition to settle
		// before comparing computed backgrounds.
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(card).backgroundColor).not.toBe(resting);
		// Do NOT unhover: the snapshot pipeline captures after play()
		// resolves, so ending parked on the card is what puts the hover
		// state into the screenshot (Issue #439).  Cross-story pointer
		// leaks are handled by the capture setup's pointer parking.
		spacer.remove();
	},
};

// Issue #146: a selected card must keep its selection surface on hover —
// the hover affordance is overridden so selected vs hovered-unselected
// stay visually distinct (see cardSelectedClass comment).
export const HoverSelected: Story = {
	args: { isSelected: true },
	play: async ({ canvasElement }) => {
		const card = canvasElement.querySelector<HTMLElement>(
			"[data-card-selected]",
		);
		if (!card) throw new Error("icon card not found");
		const { userEvent } = await import("vitest/browser");
		const spacer = document.createElement("div");
		spacer.style.cssText = "position:fixed;top:0;left:0;width:8px;height:8px;";
		document.body.appendChild(spacer);
		await userEvent.hover(spacer);
		await new Promise((resolve) => setTimeout(resolve, 300));
		const resting = getComputedStyle(card).backgroundColor;
		await userEvent.hover(card);
		await expect(card.matches(":hover")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		await expect(getComputedStyle(card).backgroundColor).toBe(resting);
		// Same as HoverUnselected: stay hovered so the capture reflects the
		// state this story exists to document (Issue #439).
		spacer.remove();
	},
};
