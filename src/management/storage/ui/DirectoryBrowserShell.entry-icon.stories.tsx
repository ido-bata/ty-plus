import type { Meta, StoryObj } from "@storybook/react";
import {
	presetIconEmoji,
	presetIconImage,
	presetIconText,
} from "@/management/preset/contract";
import type { SiblingListingEntry } from "@/management/preset/sibling-thumbnail";
import { css } from "@/styled-system/css";

import type { DirectoryBrowserEntry } from "./DirectoryBrowser";
import {
	EntryIcon,
	MediaCardContent,
} from "./DirectoryBrowserShell.entry-icon";

const siblings: readonly SiblingListingEntry[] = [
	{ name: "alpha.png", path: "/preset/root/alpha.png", isDirectory: false },
	{ name: "beta.png", path: "/preset/root/beta.png", isDirectory: false },
];

type Args = {
	kind:
		| "folder"
		| "file"
		| "image"
		| "video"
		| "audio"
		| "text-icon"
		| "emoji-icon"
		| "image-icon";
	size: number;
};

const buildEntry = (kind: Args["kind"]): DirectoryBrowserEntry => {
	switch (kind) {
		case "folder":
			return { path: "", name: "presets", isDirectory: true };
		case "file":
			return {
				path: "/preset/root/preset.ffx",
				name: "preset.ffx",
				isDirectory: false,
				fileType: "ae-preset",
			};
		case "image":
			return {
				path: "/preset/root/alpha.png",
				name: "alpha.png",
				isDirectory: false,
				fileType: "image",
				previewUrl:
					"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><rect width='8' height='8' fill='%2380a0ff'/></svg>",
			};
		case "video":
			return {
				path: "/preset/root/clip.mp4",
				name: "clip.mp4",
				isDirectory: false,
				fileType: "video",
			};
		case "audio":
			return {
				path: "/preset/root/clip.wav",
				name: "clip.wav",
				isDirectory: false,
				fileType: "audio",
			};
		case "text-icon":
			return {
				path: "/preset/root/text.ffx",
				name: "text.ffx",
				isDirectory: false,
				fileType: "ae-preset",
				icon: presetIconText("FX"),
			};
		case "emoji-icon":
			return {
				path: "/preset/root/emoji.ffx",
				name: "emoji.ffx",
				isDirectory: false,
				fileType: "ae-preset",
				icon: presetIconEmoji("FX"),
			};
		case "image-icon":
			return {
				path: "/preset/root/img.ffx",
				name: "img.ffx",
				isDirectory: false,
				fileType: "ae-preset",
				icon: presetIconImage(
					"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><circle cx='4' cy='4' r='3' fill='%23ff80c0'/></svg>",
				),
			};
	}
};

const baseArgs: Args = {
	kind: "file",
	size: 48,
};

const renderIcon = (args: Args) => (
	<div
		className={css({
			display: "flex",
			alignItems: "center",
			gap: "3",
			p: "3",
			color: "text.primary",
		})}
	>
		<EntryIcon
			entry={buildEntry(args.kind)}
			size={args.size}
			allEntries={siblings}
		/>
		<span className={css({ fontSize: "sm", color: "text.muted" })}>
			{args.kind}
		</span>
	</div>
);

const meta = {
	title: "DirectoryBrowser/EntryIcon",
	args: baseArgs,
	argTypes: {
		kind: {
			control: { type: "select" },
			options: [
				"folder",
				"file",
				"image",
				"video",
				"audio",
				"text-icon",
				"emoji-icon",
				"image-icon",
			],
		},
		size: { control: { type: "range", min: 16, max: 96, step: 4 } },
	},
	render: renderIcon,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const Folder: Story = {
	args: { kind: "folder" },
};

export const ImagePreview: Story = {
	args: { kind: "image", size: 64 },
};

export const PresetIconText: Story = {
	args: { kind: "text-icon", size: 64 },
};

export const SiblingMatch: Story = {
	render: () => (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				p: "3",
				color: "text.primary",
			})}
		>
			<EntryIcon
				entry={{
					path: "/preset/root/alpha.ffx",
					name: "alpha.ffx",
					isDirectory: false,
					fileType: "ae-preset",
				}}
				size={48}
				allEntries={siblings}
			/>
			<span className={css({ fontSize: "sm", color: "text.muted" })}>
				alpha.ffx (sibling alpha.png exists)
			</span>
		</div>
	),
};

export const MediaCardImage: Story = {
	render: () => (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				p: "3",
				color: "text.primary",
			})}
		>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					borderRadius: "shell-sm",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					bg: "surface.dialog",
				})}
				style={{ width: 56, height: 56 }}
			>
				<MediaCardContent
					entry={{
						path: "/preset/root/alpha.png",
						name: "alpha.png",
						isDirectory: false,
						fileType: "image",
						previewUrl:
							"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><rect width='8' height='8' fill='%23a0e080'/></svg>",
					}}
				/>
			</div>
			<span className={css({ fontSize: "sm", color: "text.muted" })}>
				MediaCardContent (image)
			</span>
		</div>
	),
};
