import type { Meta, StoryObj } from "@storybook/react";

import type { DirectoryBrowserEntry } from "./DirectoryBrowser";
import { DirectoryBrowserOnboardingView } from "./DirectoryBrowserOnboarding";

type Args = {
	loading: boolean;
	goUpAvailable: boolean;
	entryCount: number;
};

const makeEntries = (count: number): DirectoryBrowserEntry[] =>
	Array.from({ length: count }).map((_, i) => ({
		path: `/preset/onboarding/${i.toString().padStart(2, "0")}.ffx`,
		name: `${i.toString().padStart(2, "0")}.ffx`,
		isDirectory: i % 5 === 0,
	}));

const baseArgs: Args = {
	loading: false,
	goUpAvailable: true,
	entryCount: 6,
};

const renderOnboarding = (args: Args) => (
	<DirectoryBrowserOnboardingView
		entries={makeEntries(args.entryCount)}
		loading={args.loading}
		goUpAvailable={args.goUpAvailable}
		onGoUp={() => undefined}
		onEntryClick={() => undefined}
		isFileSelected={() => false}
		onToggleFileSelected={() => undefined}
		selectedSummary="0 files selected"
		emptyLabel="No files yet"
		loadingLabel="Loading presets..."
		upLabel="Up"
	/>
);

const meta = {
	title: "DirectoryBrowser/DirectoryBrowserOnboarding",
	args: baseArgs,
	argTypes: {
		loading: { control: "boolean" },
		goUpAvailable: { control: "boolean" },
		entryCount: { control: { type: "range", min: 0, max: 12, step: 1 } },
	},
	decorators: [
		(Story) => (
			<div style={{ width: 320 }}>
				<Story />
			</div>
		),
	],
	render: renderOnboarding,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Loading: Story = {
	args: { loading: true, entryCount: 0 },
};

export const Empty: Story = {
	args: { entryCount: 0 },
};

export const NoUp: Story = {
	args: { goUpAvailable: false },
};
