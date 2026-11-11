import type { Meta, StoryObj } from "@storybook/react";

import { FontViewerStatusLine } from "./FontViewerStatusLine";
import type { FontLoadVia } from "./use-font-catalog";

type Args = {
	loading: boolean;
	familyCount: number;
	filteredFaceCount: number;
	total: number;
	via: FontLoadVia | null;
};

const baseArgs: Args = {
	loading: false,
	familyCount: 48,
	filteredFaceCount: 120,
	total: 412,
	via: "after-effects",
};

const meta = {
	title: "FontViewer/StatusLine",
	component: FontViewerStatusLine,
	args: baseArgs,
	argTypes: {
		loading: { control: "boolean" },
		familyCount: { control: { type: "number", min: 0, max: 500 } },
		filteredFaceCount: { control: { type: "number", min: 0, max: 2000 } },
		total: { control: { type: "number", min: 0, max: 2000 } },
		via: {
			control: { type: "select" },
			options: [null, "after-effects", "queryLocalFonts", "documentFonts"],
		},
	},
	decorators: [
		(Story) => (
			<div style={{ width: 320, padding: 12 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Loading: Story = {
	args: { loading: true },
};

export const Empty: Story = {
	args: { familyCount: 0, filteredFaceCount: 0, total: 0, via: null },
};

export const LocalApi: Story = {
	args: { via: "queryLocalFonts" },
};
