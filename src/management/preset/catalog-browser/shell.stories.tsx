import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
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
export const PresetList: Story = {
	play: async ({ canvasElement }) => {
		// Issue #767: the preset-list shell must keep a horizontal inset —
		// the header and rows previously rendered flush against the dialog
		// edges (the directory-browser shell already padded both axes).
		const body = canvasElement.querySelector<HTMLElement>(
			"[data-preset-list-body]",
		);
		if (!body) throw new Error("preset-list body not found");
		const bodyBox = body.getBoundingClientRect();
		const header = Array.from(body.querySelectorAll("span")).find(
			(el) => el.textContent === "Catalog header",
		);
		const counter = Array.from(body.querySelectorAll("span")).find(
			(el) => el.textContent === "12 items",
		);
		if (!header || !counter) throw new Error("shell header rows not found");
		const headerBox = header.getBoundingClientRect();
		const counterBox = counter.getBoundingClientRect();
		expect(headerBox.x - bodyBox.x).toBeGreaterThanOrEqual(4);
		expect(bodyBox.right - counterBox.right).toBeGreaterThanOrEqual(4);
	},
};

/** Directory-browser layout — fixed header, list-only scroll. */
export const DirectoryBrowser: Story = {
	args: { domPrefix: "directory-browser", scrollMode: "list-only" },
};
