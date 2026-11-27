import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useRef } from "react";
import { expect } from "storybook/test";
import { css } from "@/styled-system/css";

import {
	ArchiveDetailsSection,
	type ArchiveDetailsSectionHandle,
} from "./ArchiveDetailsSection";

type Args = {
	description: string;
	descriptionImage: string;
	defaultOpen: boolean;
};

const baseArgs: Args = {
	description: "",
	descriptionImage: "",
	defaultOpen: false,
};

const decoratorBoxClass = css({
	width: "36rem",
	padding: "2",
});

const meta = {
	title: "Preset/CatalogAdd/ArchiveDetailsSection",
	args: baseArgs,
	argTypes: {
		description: { control: "text" },
		descriptionImage: { control: "text" },
		defaultOpen: { control: "boolean" },
	},
	decorators: [
		(Story) => (
			<div className={decoratorBoxClass}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		function Harness(): JSX.Element {
			const ref = useRef<ArchiveDetailsSectionHandle>(null);
			return (
				<ArchiveDetailsSection
					ref={ref}
					description={args.description}
					onDescriptionChange={() => undefined}
					descriptionImage={args.descriptionImage}
					onDescriptionImageChange={() => undefined}
					defaultOpen={args.defaultOpen}
					browseDir="/preset/root"
				/>
			);
		}
		return <Harness />;
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithContent: Story = {
	args: {
		description: "Header animation preset for fade-in transitions.",
		descriptionImage: "https://placehold.co/240x120/png",
		// Issue #542: the accordion starts closed (`defaultOpen ?? false`),
		// so "with-content" rendered identically to Default. Production
		// opens this section in the edit dialog — mirror that here.
		defaultOpen: true,
	},
	play: async ({ canvasElement }) => {
		// The description field must actually be mounted, not hidden
		// behind the collapsed header.
		const field = canvasElement.querySelector("textarea, input[type='text']");
		expect(field).not.toBeNull();
		// Issue #753: the open chevron must actually rotate — the class used
		// `transform: "rotate-180"` (a Panda token where a CSS value was
		// required), which compiled to invalid CSS and never rotated.
		const trigger = canvasElement.querySelector<HTMLElement>(
			"[data-archive-details-trigger]",
		);
		if (!trigger) throw new Error("accordion trigger not found");
		const chevron = trigger.parentElement?.querySelector("svg");
		if (!chevron) throw new Error("accordion chevron not found");
		expect(getComputedStyle(chevron).transform).not.toBe("none");
	},
};
