import type { Meta, StoryObj } from "@storybook/react";
import { css } from "@/styled-system/css";

import { MediaFrame } from "./MediaFrame";

/**
 * Shared media frame (Issue #610): border + radius + clipping owned by the
 * component; the caller supplies the content. Used for screenshots and
 * figures on dialog surfaces.
 */

const meta = {
	title: "Shared/Layout/MediaFrame",
	component: MediaFrame,
	decorators: [
		(Story) => (
			<div
				className={css({
					display: "flex",
					padding: "4",
					backgroundColor: "surface.dialog",
				})}
			>
				<Story />
			</div>
		),
	],
	render: () => (
		<MediaFrame
			style={{ width: 260, height: 140 }}
			className={css({ display: "flex" })}
		>
			<div
				className={css({
					display: "flex",
					height: "full",
					width: "full",
					alignItems: "center",
					justifyContent: "center",
					color: "text.muted",
					fontSize: "shell-text-sm",
				})}
			>
				media content
			</div>
		</MediaFrame>
	),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default frame on a dialog surface. */
export const Default: Story = {};
