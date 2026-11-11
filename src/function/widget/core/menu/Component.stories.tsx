import type { Meta, StoryObj } from "@storybook/react";

import { Group, MenuWidget } from "@/function/widget/core/menu/Component";
import type { Layout } from "@/management/workspace/layout/grid-document";
import type { SurfaceState } from "@/management/workspace/state";
import { createInitialSurfaceState } from "@/management/workspace/state";
import { css } from "@/styled-system/css";

type Args = {
	layoutLocked: boolean;
	panelId: string;
	presetSelectedCount: number;
};

const buildState = (args: Args): SurfaceState => {
	const base = createInitialSurfaceState({
		mode: "live",
		panelId: args.panelId,
	});
	return {
		...base,
		layoutLocked: args.layoutLocked,
		presetSelectedIds:
			args.presetSelectedCount > 0
				? Array.from(
						{ length: args.presetSelectedCount },
						(_, i) => `preset-${i + 1}`,
					)
				: [],
		selectedSurfaceIndices: args.presetSelectedCount > 0 ? [0, 1, 2] : [],
	};
};

const buildLayout = (): Layout => ({
	id: "menu-storybook-1",
	widgetType: "menu",
	x: 0,
	y: 0,
	width: 1,
	height: 1,
});

const baseArgs: Args = {
	layoutLocked: false,
	panelId: "panel-1",
	presetSelectedCount: 0,
};

const meta = {
	title: "WidgetCore/Menu",
	args: baseArgs,
	argTypes: {
		layoutLocked: { control: "boolean" },
		panelId: {
			control: { type: "inline-radio" },
			options: ["panel-1", "panel-2", "panel-3"],
		},
		presetSelectedCount: { control: { type: "number", min: 0, max: 5 } },
	},
	render: (args: Args) => (
		<div
			className={css({
				display: "flex",
				height: "40",
				width: "40",
				alignItems: "center",
				justifyContent: "center",
				padding: "3",
			})}
		>
			<MenuWidget state={buildState(args)} layout={buildLayout()} />
		</div>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const LayoutLocked: Story = {
	args: { layoutLocked: true },
};

export const MultiSelection: Story = {
	args: { presetSelectedCount: 3 },
};

/**
 * Issue #149 — TopLevel regression. Two top-level `<Group>`s (both
 * `nested={false}` by default) rendered stacked so the flush-left
 * alignment is observable in Storybook. visual checkpoint:
 *
 *   - both groups render body with `data-menu-group-nested="false"`
 *   - neither body carries a paddingLeft rule (the regression target)
 *   - leftmost edges align with the surrounding role="menu" container
 *
 * Renders `<Group>` directly (rather than via `<MenuWidget>`) so this
 * regression is decoupled from `surface-state` plumbing.  Labels are
 * literal to keep the story independent of i18n sync-init timing.
 */
export const TopLevel: StoryObj<Args> = {
	render: () => (
		<div
			role="menu"
			className={css({
				padding: "3",
				display: "flex",
				flexDirection: "column",
				gap: "2",
				minWidth: "20",
			})}
		>
			<Group
				title="Top-level group A"
				items={[
					{ action: "t-a-1", label: "Top-level item A-1" },
					{ action: "t-a-2", label: "Top-level item A-2" },
				]}
				openerWorkspacePanelId="panel-1"
				open
			/>
			<Group
				title="Top-level group B (Layout analog)"
				items={[
					{ action: "t-b-1", label: "Top-level item B-1" },
					{ action: "t-b-2", label: "Top-level item B-2" },
				]}
				openerWorkspacePanelId="panel-1"
				open
			/>
		</div>
	),
};

/**
 * Issue #149 — Nested regression. An outer top-level `<Group>` containing
 * a `<Group nested={true}>` so the existing submenu indent
 * (`paddingLeft: var(--ty-space-2)`) is observable in Storybook.
 *
 * Visual checkpoint:
 *
 *   - the inner `<Group>` body carries `data-menu-group-nested="true"`
 *     and the nestedSubmenuClass with paddingLeft applied
 *   - the outer `<Group>` body remains flush-left
 *   - the indent is the only visible difference between the two
 */
export const Nested: StoryObj<Args> = {
	render: () => (
		<div
			role="menu"
			className={css({
				padding: "3",
				display: "flex",
				flexDirection: "column",
				gap: "2",
				minWidth: "20",
			})}
		>
			<Group title="Outer group" openerWorkspacePanelId="panel-1" open>
				<Group
					title="Nested submenu (Move-to-panel analog)"
					items={[
						{ action: "n-1", label: "Nested item A" },
						{ action: "n-2", label: "Nested item B" },
						{ action: "n-3", label: "Nested item C" },
					]}
					openerWorkspacePanelId="panel-1"
					open
					nested
				/>
			</Group>
		</div>
	),
};
