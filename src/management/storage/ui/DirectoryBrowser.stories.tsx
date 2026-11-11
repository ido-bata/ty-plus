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
import "../../../storybook/decorators/i18n-init-once";

import type { Meta, StoryObj } from "@storybook/react";

import {
	DirectoryBrowser,
	type DirectoryBrowserEntry,
} from "./DirectoryBrowser";

const MOCK_ENTRIES: DirectoryBrowserEntry[] = [
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

const LONG_ENTRIES: DirectoryBrowserEntry[] = [
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
	entries: DirectoryBrowserEntry[];
};

const baseArgs: Args = {
	viewMode: "list",
	activePath: null,
	selectedPath: null,
	selectionMode: "files",
	entries: MOCK_ENTRIES,
};

const renderBrowser = (args: Args) => (
	<DirectoryBrowser
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
	title: "DirectoryBrowser/DirectoryBrowser",
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
};

// 4. Selected-only — checkbox selection without an active path.
export const SelectedOnly: Story = {
	args: {
		viewMode: "list",
		activePath: null,
		selectedPath: "/preset/root/fade-in.ffx",
		selectionMode: "files",
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
