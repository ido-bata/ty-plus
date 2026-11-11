import type { Meta, StoryObj } from "@storybook/react";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/shared/component/icons/Icon";
import { PathField } from "./PathField";

const meta = {
	title: "Shared/Fields/PathField",
	component: PathField,
	argTypes: {
		value: { control: "text" },
		placeholder: { control: "text" },
		uiSize: { control: "select", options: ["sm", "md", "lg"] },
		size: { control: "select", options: ["sm", "md", "lg"] },
		browseAriaLabel: { control: "text" },
		disabled: { control: "boolean" },
		readOnly: { control: "boolean" },
		onChange: { action: "changed" },
		onBrowse: { action: "browse" },
	},
	args: {
		value: "/Users/example/Documents/project/file.aep",
		placeholder: "Select a path…",
		uiSize: "md",
		browseAriaLabel: "Browse for file",
		onChange: () => {},
		onBrowse: () => {},
	},
} satisfies Meta<typeof PathField>;

export default meta;
type Story = StoryObj<typeof meta>;

const BrowseIcon = <Icon icon={FolderOpen} size={12} aria-hidden />;

export const Default: Story = {
	args: {
		browseSlot: BrowseIcon,
	},
};

export const WithoutBrowse: Story = {
	args: {
		browseSlot: BrowseIcon,
		onBrowse: undefined,
	},
};

export const Disabled: Story = {
	args: {
		browseSlot: BrowseIcon,
		disabled: true,
	},
};

export const Interactive: Story = {
	render: () => {
		const [value, setValue] = useState(
			"/Users/example/Documents/very/deep/nested/folder/structure/file.aep",
		);
		return (
			<div style={{ width: 360 }}>
				<PathField
					value={value}
					onChange={setValue}
					onBrowse={() => {
						/* mocked */
					}}
					browseSlot={BrowseIcon}
					browseAriaLabel="Browse for project file"
				/>
			</div>
		);
	},
	args: {
		browseSlot: BrowseIcon,
	},
};
