import type { Meta, StoryObj } from "@storybook/react";
import type { JSX } from "react";
import type { LayoutRestoreNotice } from "@/management/workspace/layout/restore-plan";
import { css } from "@/styled-system/css";

import { LayoutRestoreBanner } from "./LayoutRestoreBanner";

/**
 * Workspace layout restore banner (Issue #610, production surface from
 * Issue #204). Shows the blocked-restore classification, names the
 * layout file, and offers the retry action.
 */

const corruptNotice: LayoutRestoreNotice = {
	status: "corrupt",
	reason: "json-parse-failed",
	message: "layout is not valid JSON: Unexpected end of JSON input",
	panelId: "panel-1",
	wsIndex: 1,
};

const readFailureNotice: LayoutRestoreNotice = {
	status: "read-failure",
	reason: "read-error",
	message: "EISDIR: illegal operation on a directory, read",
	panelId: "panel-3",
	wsIndex: 3,
};

const frameStyle = css({
	width: "560px",
	borderRadius: "shell-lg",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	overflow: "hidden",
});

const meta = {
	title: "Management/Panel/LayoutRestoreBanner",
	args: {
		notice: corruptNotice,
		onRetry: () => undefined,
	},
	render: (args): JSX.Element => (
		<div className={frameStyle}>
			<LayoutRestoreBanner notice={args.notice} onRetry={args.onRetry} />
		</div>
	),
} satisfies Meta<{ notice: LayoutRestoreNotice; onRetry: () => void }>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Corrupt layout file — JSON parse failure classification. */
export const Corrupt: Story = {};

/** Read failure — the layout file could not be read at all. */
export const ReadFailure: Story = {
	args: { notice: readFailureNotice },
};
