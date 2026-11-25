import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { TipsSection } from "./TipsSection";

/**
 * Tips / tutorial reset section (Issue #610). Renders the real section
 * body; the reset action only runs on click.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/TipsSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<TipsSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default tips copy with the tutorial-state reset action. */
export const Default: Story = {};
