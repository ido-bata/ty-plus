import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useState } from "react";
import { css } from "@/styled-system/css";

import { AddWidgetPickerOverlay } from "./picker-overlay";

/**
 * Storybook harness for the in-panel widget picker overlay (Issue #610).
 *
 * `AddWidgetPickerOverlay` is the fallback used when the CEP modeless
 * surface is unavailable (e.g. Vite dev): it renders a backdrop +
 * `<dialog>` over the workspace and completes by dispatching
 * `ty-plus-append-widget` on `eventRoot`. The harness supplies a plain
 * `eventRoot` div; activation would only emit a DOM event, which no
 * listener consumes here.
 */

function OverlayHarness(): JSX.Element {
	const [eventRoot, setEventRoot] = useState<HTMLDivElement | null>(null);
	return (
		<div
			ref={setEventRoot}
			className={css({
				position: "relative",
				height: "480px",
				width: "720px",
				overflow: "hidden",
				borderRadius: "shell-lg",
				borderWidth: "hairline",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.panel",
			})}
		>
			{eventRoot ? (
				<AddWidgetPickerOverlay
					eventRoot={eventRoot}
					panelId="panel-1"
					onClose={() => undefined}
				/>
			) : null}
		</div>
	);
}

const meta = {
	title: "Management/Widget/AddWidgetPickerOverlay",
	parameters: {
		layout: "fullscreen",
	},
	render: (): JSX.Element => <OverlayHarness />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: backdrop dim + catalog dialog targeting `panel-1`. */
export const Default: Story = {};
