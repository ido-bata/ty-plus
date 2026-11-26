import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { WorkspaceBackupSection } from "./WorkspaceBackupSection";

/**
 * Workspace backup section (Issue #610). Renders the real section body;
 * export/import only touch storage on click, so the initial render is
 * the empty bundle textarea + action buttons.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/WorkspaceBackupSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<WorkspaceBackupSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: empty bundle textarea with export/import actions. */
export const Default: Story = {};
