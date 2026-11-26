import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { FeedbackSection } from "./FeedbackSection";

/**
 * Feedback section (Issue #610). Renders the real section body —
 * category/subject/preset/description form that composes a GitHub issue
 * URL on submit.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/FeedbackSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<FeedbackSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default empty feedback form. */
export const Default: Story = {};
