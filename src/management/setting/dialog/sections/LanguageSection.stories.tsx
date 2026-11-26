import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { LanguageSection } from "./LanguageSection";

/**
 * Language section (Issue #610). Renders the real section body; the
 * locale selector reflects `settings.ui.language` from the shared
 * `SettingsProviderDecorator`.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/LanguageSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<LanguageSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default locale selector. */
export const Default: Story = {};
