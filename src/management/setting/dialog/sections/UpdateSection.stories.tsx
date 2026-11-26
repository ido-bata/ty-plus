import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { UpdateSection } from "./UpdateSection";

/**
 * Update channel section (Issue #610). Renders the real section body.
 * On mount it runs `checkForUpdate` against the GitHub Releases feed —
 * offline or rate-limited environments render the honest "unavailable"
 * state, which is itself a valid visual state.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/UpdateSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<UpdateSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: stable channel with the update-check result area. */
export const Default: Story = {};
