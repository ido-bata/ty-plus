import type { Meta, StoryObj } from "@storybook/react";
import type { JSX, ReactNode } from "react";
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
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "border.default",
			bg: "surface.widget",
		})}
		title="tile preview"
	>
		{children}
	</div>
);

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
	const tiles = useGridCatalogTileBody();
	const cell = tiles({
		preset: undefined,
		label: args.label,
		tileId: args.tileId,
	});
	return (
		<GridCatalogTileBodyProvider render={render}>
			<TilePreview>{cell}</TilePreview>
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

export const CustomRenderer: Story = {};

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
