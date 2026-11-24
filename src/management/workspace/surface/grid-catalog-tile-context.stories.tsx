import type { Meta, StoryObj } from "@storybook/react";
import type { JSX, ReactNode } from "react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import {
	GridCatalogTileBodyProvider,
	useGridCatalogTileBody,
} from "./grid-catalog-tile-context";

type Args = {
	label: string;
	tileId: string;
};

const baseArgs: Args = {
	label: "FX preset",
	tileId: "tile-1",
};

const TilePreview = ({ children }: { children: ReactNode }): JSX.Element => (
	<div
		className={css({
			display: "flex",
			height: "24",
			width: "24",
			alignItems: "center",
			justifyContent: "center",
			borderRadius: "shell-sm",
			borderWidth: "hairline",
			borderStyle: "solid",
			borderColor: "border.default",
			bg: "surface.widget",
		})}
		title="tile preview"
	>
		{children}
	</div>
);

// Issue #530: the hook must run inside `GridCatalogTileBodyProvider` —
// calling `useGridCatalogTileBody()` in the story render function (the
// provider's parent) resolves the fallback renderer, so the first tile
// silently bypassed the custom renderer it was meant to demonstrate.
const ProviderTile = ({
	label,
	tileId,
}: {
	label: string;
	tileId: string;
}): JSX.Element => {
	const render = useGridCatalogTileBody();
	return (
		<TilePreview>{render({ preset: undefined, label, tileId })}</TilePreview>
	);
};

const renderProvider = (args: Args) => {
	const render = ({
		label,
		tileId,
	}: {
		label: string;
		tileId: string;
	}): JSX.Element => (
		<div
			className={css({
				display: "flex",
				height: "full",
				width: "full",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1",
				px: "1",
				textAlign: "center",
				fontSize: "text-2xs",
				color: "text.primary",
			})}
		>
			<span className={css({ fontWeight: "semibold" })}>{label}</span>
			<span className={css({ color: "text.muted" })}>id: {tileId}</span>
		</div>
	);
	return (
		<GridCatalogTileBodyProvider render={render}>
			<ProviderTile label={args.label} tileId={args.tileId} />
			<TilePreview>
				{render({ label: args.label, tileId: args.tileId })}
			</TilePreview>
			<TilePreview>
				{render({ label: "Second preset", tileId: "tile-2" })}
			</TilePreview>
		</GridCatalogTileBodyProvider>
	);
};

const meta = {
	title: "Workspace/GridCatalogTileContext",
	args: baseArgs,
	argTypes: {
		label: { control: "text" },
		tileId: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div
				className={css({
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: "3",
					p: "4",
				})}
			>
				<Story />
			</div>
		),
	],
	render: renderProvider,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const CustomRenderer: Story = {
	// Issue #530: all three tiles must go through the provider-supplied
	// renderer — the first one used to be produced by the fallback because
	// the hook ran above the provider and never showed `id: tile-1`.
	play: async ({ canvasElement }) => {
		const labels = Array.from(
			canvasElement.querySelectorAll("[title='tile preview']"),
		);
		expect(labels).toHaveLength(3);
		for (const tile of labels) {
			expect(tile.textContent).toContain("id: ");
		}
		expect(labels[0]?.textContent).toContain("id: tile-1");
		expect(labels[2]?.textContent).toContain("id: tile-2");
	},
};

export const FallbackRenderer: Story = {
	render: () => {
		const render = useGridCatalogTileBody();
		const cell = render({
			preset: undefined,
			label: "Default fallback",
			tileId: "tile-fb",
		});
		return (
			<div
				className={css({
					display: "flex",
					flexWrap: "wrap",
					alignItems: "center",
					gap: "3",
					p: "4",
					color: "text.primary",
				})}
			>
				<TilePreview>{cell}</TilePreview>
				<span className={css({ fontSize: "sm", color: "text.muted" })}>
					Renders without a provider override; uses the built-in fallback.
				</span>
			</div>
		);
	},
};
