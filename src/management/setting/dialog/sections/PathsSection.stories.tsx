import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { PathsSection } from "./PathsSection";

/**
 * Paths section (Issue #610). Renders the real section body; path rows
 * come from `SettingsProviderDecorator` defaults and disk refresh is a
 * no-op outside CEP.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/PathsSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<PathsSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default preset / workspace path rows. */
export const Default: Story = {};
