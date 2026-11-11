import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useRef } from "react";
import { css } from "@/styled-system/css";

import {
	ArchiveDetailsSection,
	type ArchiveDetailsSectionHandle,
} from "./ArchiveDetailsSection";

type Args = {
	description: string;
	descriptionImage: string;
};

const baseArgs: Args = {
	description: "",
	descriptionImage: "",
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
	},
};
