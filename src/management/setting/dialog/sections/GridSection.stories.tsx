import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { GridSection } from "./GridSection";

/**
 * Grid settings section (Issue #610). Renders the real section body;
 * settings come from the shared `SettingsProviderDecorator`.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/GridSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<GridSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default grid size / overlay toggles. */
export const Default: Story = {};
