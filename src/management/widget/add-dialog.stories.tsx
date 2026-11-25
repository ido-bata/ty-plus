import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

import { AddWidgetDialog } from "./add-dialog";

/**
 * Storybook harness for the CEP modeless "Add widget" dialog
 * (`data-surface-id="dialog-widget-selector"`, Issue #610).
 *
 * The global `CepContextDecorator` supplies `openerWorkspacePanelId:
 * "panel-1"`, so the footer target readout resolves deterministically.
 * The dialog shell is a `<dialog open>` that fills its parent — the
 * frame below gives it the canonical dialog size.
 *
 * Clicking "Add" would persist through the storage layer; stories only
 * exercise the visual states, so no interaction is required.
 */

const frameStyle = css({
	display: "flex",
	height: "560px",
	width: "720px",
	overflow: "hidden",
	borderRadius: "shell-lg",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
});

const renderDialog = (): JSX.Element => (
	<div className={frameStyle}>
		<AddWidgetDialog />
	</div>
);

const meta = {
	title: "Management/Widget/AddWidgetDialog",
	parameters: {
		layout: "fullscreen",
	},
	render: renderDialog,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: catalog in icon view with the first widget auto-selected. */
export const Default: Story = {};
