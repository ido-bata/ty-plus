import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useCallback, useState } from "react";
import { css } from "@/styled-system/css";

import { type DroppedFile, FileDropZone } from "./FileDropZone";

/**
 * Demo wrapper that captures the latest drop so stories can show
 * what the host would receive after a real drop. Storybook controls
 * cannot synthesise native HTML5 drag events reliably, so the
 * drag-over visual state is shown via a parallel "DragOver" variant
 * that applies the same hover classes directly.
 */
function FileDropZoneDemo(props: {
	disabled?: boolean;
	className?: string;
}): JSX.Element {
	const { disabled, className } = props;
	const [dropped, setDropped] = useState<DroppedFile[]>([]);

	const handleFilesDropped = useCallback((files: DroppedFile[]) => {
		setDropped(files);
	}, []);

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "3" })}
		>
			<FileDropZone
				onFilesDropped={handleFilesDropped}
				disabled={disabled}
				className={className}
			/>
			{dropped.length > 0 && (
				<dl className={css({ fontSize: "shell-text-sm", color: "text.muted" })}>
					<dt className={css({ fontWeight: "semibold" })}>Last drop</dt>
					<dd>
						<pre
							className={css({
								overflowX: "auto",
								borderRadius: "shell-sm",
								bg: "surface.widget/40",
								p: "2",
								fontSize: "10px",
							})}
						>
							{JSON.stringify(dropped, null, 2)}
						</pre>
					</dd>
				</dl>
			)}
		</div>
	);
}

/**
 * Static representation of the drag-over visual state. The real
 * component only enters this state in response to actual drag
 * events; for documentation purposes we apply the same hover
 * classes directly so the appearance is captured in Storybook.
 */
const dragOverClass = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "2px",
	borderStyle: "solid",
	borderColor: "interactive.focus",
	bg: "surface.widget/60",
	px: "4",
	py: "6",
	color: "text.primary",
	transitionProperty: "colors",
	transitionDuration: "150",
});

function FileDropZoneDragOver(): JSX.Element {
	return (
		<div className={dragOverClass} data-dragover>
			<span
				className={css({
					fontSize: "shell-text-sm",
					userSelect: "none",
				})}
			>
				Drag &amp; drop file here
			</span>
		</div>
	);
}

const NOOP = (_files: DroppedFile[]): void => {};

const meta = {
	title: "Shared/Feedback/FileDropZone",
	component: FileDropZone,
	decorators: [
		(Story) => (
			<div className={css({ width: "80", p: "4" })}>
				<Story />
			</div>
		),
	],
	argTypes: {
		disabled: {
			control: "boolean",
			description: "Disable the drop zone (no-op for drop events).",
		},
		className: {
			control: "text",
			description: "Additional classes appended to the drop zone root.",
		},
	},
	args: {
		onFilesDropped: NOOP,
		disabled: false,
	},
} satisfies Meta<typeof FileDropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default resting state: dashed border, muted copy, upload glyph.
 */
export const Default: Story = {
	render: (args) => <FileDropZoneDemo {...args} />,
};

/**
 * Disabled state: dimmed appearance, cursor signals not-allowed.
 */
export const Disabled: Story = {
	args: {
		disabled: true,
	},
	render: (args) => <FileDropZoneDemo {...args} />,
};

/**
 * Drag-over visual state: solid border, brighter surface, primary
 * text. The component itself drives this from real drag events;
 * this story applies the same classes so the hover appearance is
 * documented without a synthetic event payload.
 */
export const DragOver: Story = {
	render: () => <FileDropZoneDragOver />,
};
