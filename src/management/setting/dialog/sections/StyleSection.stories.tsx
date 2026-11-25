import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { StyleSection } from "./StyleSection";

/**
 * Style / appearance section (Issue #610). Renders the real section body;
 * settings come from the shared `SettingsProviderDecorator` and CEP host
 * info from `CepContextDecorator`.
 */

const frameStyle = css({
	width: "640px",
	padding: "3",
});

const meta = {
	title: "Setting/StyleSection",
	render: (): JSX.Element => (
		<div className={frameStyle}>
			<StyleSection />
		</div>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default theme/accent controls with default settings. */
export const Default: Story = {};
