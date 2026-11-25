import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { TokensSection } from "./TokensSection";

/**
 * Design tokens section (Issue #610). Renders the real section body —
 * the densest settings surface (color / text / opacity / number token
 * editors grouped by category).
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/TokensSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<TokensSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default token categories with default theme values. */
export const Default: Story = {};
