import type { Meta, StoryObj } from "@storybook/react";
import { type JSX, useEffect, useState } from "react";
import {
	buildPresetCandidates,
	buildSelectedFolderPaths,
	type CompletionInput,
} from "./completion-input";

type Args = {
	hasSelectedPreset: boolean;
	hasSelectedScript: boolean;
	hasSelectedPlugin: boolean;
	hasSelectedFolder: boolean;
	canScanFolders: boolean;
	locale: string;
};

type ResultView = {
	folderPaths: string[];
	candidates: { type: string; filePath: string }[];
};

type ListDirectoryFn = (
	dirPath: string,
) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;

const noopListDirectory: ListDirectoryFn = async () => [];

function buildInput(args: Args): CompletionInput {
	const selectedFiles = {
		presets: args.hasSelectedPreset
			? new Set(["C:/Ae/Presets/MyPreset.ffx"])
			: new Set<string>(),
		scripts: args.hasSelectedScript
			? new Set(["C:/Ae/Scripts/MyScript.jsx"])
			: new Set<string>(),
		plugins: args.hasSelectedPlugin
			? new Set(["C:/Ae/Plug-ins/MyPlugin.plugin"])
			: new Set<string>(),
	};
	const selectedFolders = {
		presets: args.hasSelectedFolder
			? new Set(["C:/Ae/Presets/Folder"])
			: new Set<string>(),
		scripts: new Set<string>(),
		plugins: new Set<string>(),
	};
	return {
		locale: args.locale,
		supportRoot: "C:/Ae",
		subfolders: {
			presetRoot: "C:/Ae/Presets",
			scriptRoot: "C:/Ae/Scripts",
			pluginRoot: "C:/Ae/Plug-ins",
		},
		selectedFiles,
		selectedFolders,
		canScanFolders: args.canScanFolders,
	};
}

function CompletionInputProbe({
	input,
	listDirectory,
}: {
	input: CompletionInput;
	listDirectory: ListDirectoryFn;
}): JSX.Element {
	const [result, setResult] = useState<ResultView>({
		folderPaths: [],
		candidates: [],
	});
	useEffect(() => {
		const folderPaths = [...buildSelectedFolderPaths(input.selectedFolders)];
		let cancelled = false;
		void buildPresetCandidates(input, listDirectory).then((candidates) => {
			if (cancelled) return;
			setResult({
				folderPaths,
				candidates: candidates.map((c) => ({
					type: c.type,
					filePath: c.filePath,
				})),
			});
		});
		return () => {
			cancelled = true;
		};
	}, [input, listDirectory]);
	return (
		<div
			style={{
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: 12,
				color: "#e6e6e6",
				padding: 12,
				minWidth: 360,
				border: "1px solid #3a3a3a",
				borderRadius: 4,
				background: "#1f1f1f",
				display: "grid",
				gap: 12,
			}}
		>
			<section>
				<h3
					style={{
						margin: 0,
						marginBottom: 4,
						fontSize: 11,
						textTransform: "uppercase",
						letterSpacing: "0.04em",
						color: "#a0a0a0",
					}}
				>
					buildSelectedFolderPaths
				</h3>
				<pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
					{JSON.stringify(result.folderPaths, null, 2)}
				</pre>
			</section>
			<section>
				<h3
					style={{
						margin: 0,
						marginBottom: 4,
						fontSize: 11,
						textTransform: "uppercase",
						letterSpacing: "0.04em",
						color: "#a0a0a0",
					}}
				>
					buildPresetCandidates
				</h3>
				<pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
					{JSON.stringify(result.candidates, null, 2)}
				</pre>
			</section>
		</div>
	);
}

const meta = {
	title: "Onboarding/CompletionInput",
	argTypes: {
		hasSelectedPreset: { control: "boolean" },
		hasSelectedScript: { control: "boolean" },
		hasSelectedPlugin: { control: "boolean" },
		hasSelectedFolder: { control: "boolean" },
		canScanFolders: { control: "boolean" },
		locale: { control: "text" },
	},
	args: {
		hasSelectedPreset: true,
		hasSelectedScript: false,
		hasSelectedPlugin: false,
		hasSelectedFolder: false,
		canScanFolders: false,
		locale: "en",
	},
	render: (args: Args) => (
		<CompletionInputProbe
			input={buildInput(args)}
			listDirectory={noopListDirectory}
		/>
	),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

/**
 * Default: a single preset file selected, no folder selections, no scanning.
 * Yields one candidate from the explicit file list.
 */
export const Default: Story = {};

/**
 * A single folder selected. With `canScanFolders: false` the folder becomes
 * one group candidate without enumeration.
 */
export const FolderSelection: Story = {
	args: {
		hasSelectedPreset: false,
		hasSelectedFolder: true,
		canScanFolders: false,
	},
};

/**
 * All three file categories selected plus folder scanning enabled. The
 * scanner runs against the (stubbed) `listDirectory`, which returns no
 * rows — candidates are derived from the explicit file list.
 */
export const AllFilesWithScan: Story = {
	args: {
		hasSelectedPreset: true,
		hasSelectedScript: true,
		hasSelectedPlugin: true,
		hasSelectedFolder: true,
		canScanFolders: true,
	},
};

/**
 * Empty selections — no candidates and no folder paths.
 */
export const Empty: Story = {
	args: {
		hasSelectedPreset: false,
		hasSelectedScript: false,
		hasSelectedPlugin: false,
		hasSelectedFolder: false,
		canScanFolders: false,
	},
};
