import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { WorkspaceGridPreview } from "./WorkspaceGridPreview";

const frameStyle = css({
	display: "flex",
	width: "360px",
	flexDirection: "column",
	gap: "3",
	padding: "3",
});

const captionStyle = css({
	margin: "0",
	fontSize: "text-2xs",
	color: "text.muted",
});

const meta = {
	title: "Setting/WorkspaceGridPreview",
	component: WorkspaceGridPreview,
	render: () => (
		<div className={frameStyle}>
			<WorkspaceGridPreview />
			<p className={captionStyle}>
				Workspace grid preview — reads the cell size / gap / radius design
				tokens and renders an 8-cell layout that mirrors the in-app surface.
			</p>
		</div>
	),
} satisfies Meta<typeof WorkspaceGridPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
