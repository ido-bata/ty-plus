import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { BackgroundSection } from "./BackgroundSection";

/**
 * Workspace background section (Issue #610). Renders the real section
 * body; the panel selector and background readout resolve through the
 * `CepContextDecorator` (`openerWorkspacePanelId: "panel-1"`) and the
 * storage fallback path.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/BackgroundSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<BackgroundSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: panel-1 selected, no background configured yet. */
export const Default: Story = {};
