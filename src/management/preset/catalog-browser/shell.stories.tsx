import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { CatalogBrowserShell } from "./shell";

/**
 * Shared scroll shell for the preset list dialog and the workspace
 * directory-browser widget (Issue #610). `scrollMode`/`domPrefix` select
 * between the two production layouts: `all` scrolls header + body together
 * (preset list), `list-only` pins the header and scrolls only the list
 * (directory browser).
 */

const headerRow = (
	<div
		className={css({
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			paddingBlock: "2",
			color: "text.primary",
			fontSize: "shell-text-sm",
		})}
	>
		<span>Catalog header</span>
		<span className={css({ color: "text.muted" })}>12 items</span>
	</div>
);

const rows = (
	<div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
		{Array.from({ length: 8 }, (_, i) => (
			<div
				key={i}
				className={css({
					borderRadius: "shell-sm",
					backgroundColor: "surface.widget",
					padding: "2",
					fontSize: "shell-text-sm",
					color: "text.primary",
				})}
			>
				Catalog row {i + 1}
			</div>
		))}
	</div>
);

type Args = {
	domPrefix: "preset-list" | "directory-browser";
	scrollMode: "all" | "list-only";
};

const meta = {
	title: "Preset/CatalogBrowser/Shell",
	args: {
		domPrefix: "preset-list",
		scrollMode: "all",
	},
	argTypes: {
		domPrefix: {
			control: { type: "inline-radio" },
			options: ["preset-list", "directory-browser"],
		},
		scrollMode: {
			control: { type: "inline-radio" },
			options: ["all", "list-only"],
		},
	},
	decorators: [
		(Story) => (
			<div
				className={css({
					display: "flex",
					height: "64",
					width: "80",
					backgroundColor: "surface.dialog",
				})}
			>
				<Story />
			</div>
		),
	],
	render: (args) => (
		<CatalogBrowserShell
			domPrefix={args.domPrefix}
			scrollMode={args.scrollMode}
			headerRow={headerRow}
		>
			{rows}
		</CatalogBrowserShell>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Preset list dialog layout — header and rows share one scroll area. */
export const PresetList: Story = {};

/** Directory-browser layout — fixed header, list-only scroll. */
export const DirectoryBrowser: Story = {
	args: { domPrefix: "directory-browser", scrollMode: "list-only" },
};
