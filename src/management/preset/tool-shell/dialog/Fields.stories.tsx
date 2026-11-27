import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { css } from "@/styled-system/css";
import { ToolDialogFields } from "./Fields";
import type { PresetToolField } from "./ToolDialog";

const baseFields: PresetToolField[] = [
	{ key: "title", label: "Title", placeholder: "Title", kind: "input" },
	{
		key: "mode",
		label: "Mode",
		kind: "select",
		options: [
			{ value: "fast", label: "Fast" },
			{ value: "slow", label: "Slow" },
		],
	},
	{ key: "enabled", label: "Enabled", kind: "checkbox" },
	{
		key: "notes",
		label: "Notes",
		placeholder: "Optional notes",
		kind: "textarea",
	},
];

type Args = {
	busy: boolean;
};

const baseArgs: Args = {
	busy: false,
};

const decoratorBoxClass = css({
	width: "28rem",
	padding: "2",
});

const meta = {
	title: "Preset/ToolShell/Dialog/Fields",
	args: baseArgs,
	argTypes: {
		busy: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => (
		<ToolDialogFields
			fields={baseFields}
			values={{ title: "Sample", mode: "fast", enabled: "true", notes: "" }}
			busy={args.busy}
			browseSpecs={[]}
			runPathBrowse={() => undefined}
			setValue={() => undefined}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Busy: Story = {
	args: { busy: true },
};

// #552: every field label must share the shell label style — the plain
// input branch used to render `Input`'s built-in label (10px) while the
// other kinds rendered `shellFieldLabelClass` (12px uppercase).
const playLabelsConsistent = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	const canvas = within(canvasElement);
	const titleLabel = canvas.getByText("Title");
	const modeLabel = canvas.getByText("Mode");
	const notesLabel = canvas.getByText("Notes");
	for (const el of [titleLabel, modeLabel, notesLabel]) {
		const style = getComputedStyle(el);
		expect(style.textTransform).toBe("uppercase");
		expect(style.fontSize).toBe(getComputedStyle(modeLabel).fontSize);
	}
};

export const LabelsConsistent: Story = {
	play: playLabelsConsistent,
};

// Issue #753: inter-field spacing must exceed the label→control spacing
// inside a field — fields used to render as bare siblings and collapsed
// to ~0px wherever no parent flex gap wrapped them.
const playFieldRhythm = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement;
}): Promise<void> => {
	const canvas = within(canvasElement);
	const titleLabel = canvas.getByText("Title");
	const modeLabel = canvas.getByText("Mode");
	const titleInput = canvasElement.querySelector<HTMLInputElement>(
		"input[aria-label='Title']",
	);
	if (!titleInput) throw new Error("title input not found");
	const labelControlGap =
		titleInput.getBoundingClientRect().top -
		titleLabel.getBoundingClientRect().bottom;
	const fieldGap =
		modeLabel.getBoundingClientRect().top -
		titleInput.getBoundingClientRect().bottom;
	expect(fieldGap).toBeGreaterThan(labelControlGap);
};

export const FieldRhythm: Story = {
	play: playFieldRhythm,
};
