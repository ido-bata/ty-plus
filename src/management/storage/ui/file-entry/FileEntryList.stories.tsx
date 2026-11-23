/**
 * Storybook regression for Issue #144 — directory browser typography
 * unification and selection-bold retirement.
 *
 * Six cases (per the issue body):
 *   1. List view baseline
 *   2. Icons view baseline
 *   3. Active-only (activePath set, isSelected false)
 *   4. Selected-only (isSelected true, activePath null)
 *   5. Active + Selected (both states true)
 *   6. Long file names — truncation behaviour under selection toggle
 *
 * Visual regression (pixel-accurate) is left to the human reviewer
 * because Storybook 10 headless has known limitations — see memory
 * notes `ty-plus-storybook-headless-manual-render.md` and
 * `ty-plus-storybook-vitest-addon-a-b-result.md`.  The story file
 * exists statically so the cases are reachable via Storybook UI and
 * the official Vitest addon (when the chromium runtime is available).
 *
 * i18n sync init at module-load is required so first-paint translations
 * are correct — see `ty-plus-storybook-i18n-sync-init.md`.  The
 * `I18nDecorator` (mounted by the preview) runs upgrades only;
 * the actual init must happen at this file's module top level.
 */
import "../../../../storybook/decorators/i18n-init-once";

import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";

import { type FileEntry, FileEntryList } from "./FileEntryList";

const MOCK_ENTRIES: FileEntry[] = [
	{ path: "/preset/root/animation", name: "animation", isDirectory: true },
	{ path: "/preset/root/transitions", name: "transitions", isDirectory: true },
	{ path: "/preset/root/fade-in.ffx", name: "fade-in.ffx", isDirectory: false },
	{
		path: "/preset/root/slide-left.ffx",
		name: "slide-left.ffx",
		isDirectory: false,
	},
	{
		path: "/preset/root/scale-up.ffx",
		name: "scale-up.ffx",
		isDirectory: false,
	},
];

const LONG_ENTRIES: FileEntry[] = [
	{
		path: "/preset/root/foo-bar-baz-qux-quux-corge-grault-garply-waldo-fred.txt",
		name: "foo-bar-baz-qux-quux-corge-grault-garply-waldo-fred.txt",
		isDirectory: false,
	},
	{ path: "/preset/root/animation", name: "animation", isDirectory: true },
	{ path: "/preset/root/transitions", name: "transitions", isDirectory: true },
	{ path: "/preset/root/fade-in.ffx", name: "fade-in.ffx", isDirectory: false },
];

type Args = {
	viewMode: "list" | "icons";
	activePath: string | null;
	selectedPath: string | null;
	selectionMode: "files" | "folders" | "both";
	entries: FileEntry[];
};

const baseArgs: Args = {
	viewMode: "list",
	activePath: null,
	selectedPath: null,
	selectionMode: "files",
	entries: MOCK_ENTRIES,
};

const renderBrowser = (args: Args) => (
	<FileEntryList
		entries={args.entries}
		loading={false}
		canGoUp={true}
		onGoUp={() => undefined}
		onEntryClick={() => undefined}
		onEntryActivate={() => undefined}
		selectionMode={args.selectionMode}
		isSelected={(path) => path === args.selectedPath}
		onToggleSelected={() => undefined}
		selectedSummary={
			args.selectedPath ? "1 file selected" : { files: 0, folders: 0 }
		}
		showSelectedSummary={true}
		viewMode={args.viewMode}
		onViewModeChange={() => undefined}
		scale={1}
		aspect="square"
		activePath={args.activePath}
		emptyLabel="No files found"
		loadingLabel="Loading..."
		upLabel=".."
	/>
);

const meta = {
	title: "Storage/FileEntry/FileEntryList",
	args: baseArgs,
	argTypes: {
		viewMode: {
			control: { type: "inline-radio" },
			options: ["list", "icons"],
		},
		activePath: { control: "text" },
		selectedPath: { control: "text" },
		selectionMode: {
			control: { type: "inline-radio" },
			options: ["files", "folders", "both"],
		},
	},
	decorators: [
		(Story) => (
			<div style={{ width: 360, height: 280 }}>
				<Story />
			</div>
		),
	],
	render: renderBrowser,
} satisfies Meta<Args>;


// Row state fills once compiled to an invalid color-mix() call and were
// dropped by the browser, leaving active/selected rows identical to plain
// rows (#470). Assert the computed fill actually differs.
const expectStateFillDiffers = (canvasElement: HTMLElement): void => {
	const stateRows = canvasElement.querySelectorAll<HTMLElement>(
		'[data-row-state="active"], [data-row-state="selected"], [data-row-state="active+selected"]',
	);
	const plainRows = canvasElement.querySelectorAll<HTMLElement>(
		'[data-row-state="none"]',
	);
	expect(stateRows.length).toBeGreaterThan(0);
	expect(plainRows.length).toBeGreaterThan(0);
	const stateBg = getComputedStyle(
		stateRows[0].querySelector("[data-row-active],[data-row-selected]") ??
			stateRows[0],
	).backgroundColor;
	const plainBg = getComputedStyle(
		plainRows[0].querySelector("[data-row-active],[data-row-selected]") ??
			plainRows[0],
	).backgroundColor;
	expect(stateBg).not.toBe(plainBg);
	expect(stateBg).not.toBe("rgba(0, 0, 0, 0)");
	expect(stateBg).not.toBe("transparent");
};

export default meta;
type Story = StoryObj<Args>;

// 1. List view baseline — both states off.
export const ListView: Story = {
	args: { viewMode: "list" },
};

// 2. Icons view baseline — both states off.
export const IconsView: Story = {
	args: { viewMode: "icons" },
};

// 3. Active-only — on-disk "current" path is highlighted, no checkbox selection.
export const ActiveOnly: Story = {
	args: {
		viewMode: "list",
		activePath: "/preset/root/fade-in.ffx",
		selectedPath: null,
	},
	play: ({ canvasElement }) => {
		expectStateFillDiffers(canvasElement);
	},
};

// 4. Selected-only — checkbox selection without an active path.
export const SelectedOnly: Story = {
	args: {
		viewMode: "list",
		activePath: null,
		selectedPath: "/preset/root/fade-in.ffx",
		selectionMode: "files",
	},
	play: ({ canvasElement }) => {
		expectStateFillDiffers(canvasElement);
	},
};

// 5. Active + Selected — both states present.  The row must carry
//    BOTH visual cues simultaneously (left accent for selection AND
//    active tint background), but the row's text typography must be
//    identical to the all-off baseline.
export const ActiveAndSelected: Story = {
	args: {
		viewMode: "list",
		activePath: "/preset/root/fade-in.ffx",
		selectedPath: "/preset/root/fade-in.ffx",
		selectionMode: "files",
	},
	play: ({ canvasElement }) => {
		expectStateFillDiffers(canvasElement);
	},
};

// 6. Long file names — truncation invariance under selection toggle.
//    Renders entries with a deliberately oversized file name next to
//    short ones, and toggles selection on the long-named row.
export const LongFileNames: Story = {
	args: {
		viewMode: "list",
		entries: LONG_ENTRIES,
		activePath: null,
		selectedPath:
			"/preset/root/foo-bar-baz-qux-quux-corge-grault-garply-waldo-fred.txt",
		selectionMode: "files",
	},
};
