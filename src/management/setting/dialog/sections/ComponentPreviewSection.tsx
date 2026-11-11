import { type JSX, type ReactNode, useMemo, useState } from "react";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset } from "@/management/preset/contract";
import type { CodeEditorValue } from "@/management/preset/editor/Code";
import { Editor } from "@/management/preset/editor/View";
import {
	createPresetIconDraft,
	type PresetIconEditorDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon-editor";
import { MarkdownLiveEditor } from "@/management/preset/markdown/LiveEditor";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { ColorTokenEditor } from "@/management/setting/dialog/components/ColorTokenEditor";
import { NumberTokenEditor } from "@/management/setting/dialog/components/NumberTokenEditor";
import { TokenEditor } from "@/management/setting/dialog/components/TokenEditor";
import {
	SettingsField,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import type { DirectoryBrowserEntry } from "@/management/storage/ui/DirectoryBrowser";
import { SegmentedControl } from "@/shared/component/controls/SegmentedControl";
import { LoadingSpinner } from "@/shared/component/feedback/LoadingSpinner";
import { ListSelect } from "@/shared/component/fields/ListSelect";
import { ScrollArea } from "@/shared/component/layout/ScrollArea";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import { ButtonsPreview } from "./ButtonsPreview";
import { DirectoryBrowserPreview } from "./DirectoryBrowserPreview";
import { InputsPreview } from "./InputsPreview";

const TAB_OPTIONS = [
	{ value: "system", label: "System" },
	{ value: "dark", label: "Dark" },
	{ value: "light", label: "Light" },
];

const SELECT_OPTIONS = [
	{ value: "opt1", label: "Option 1" },
	{ value: "opt2", label: "Option 2" },
	{ value: "opt3", label: "Option 3" },
];

const MOCK_DIR_ENTRIES: DirectoryBrowserEntry[] = [
	{
		path: "/host/presets/animation",
		name: "animation",
		isDirectory: true,
	},
	{
		path: "/host/presets/transitions",
		name: "transitions",
		isDirectory: true,
	},
	{
		path: "/host/presets/fade-in.ffx",
		name: "fade-in.ffx",
		isDirectory: false,
		extension: ".ffx",
	},
	{
		path: "/host/presets/slide-left.ffx",
		name: "slide-left.ffx",
		isDirectory: false,
		extension: ".ffx",
	},
	{
		path: "/host/presets/scale-up.ffx",
		name: "scale-up.ffx",
		isDirectory: false,
		extension: ".ffx",
	},
];

const mutedTextStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const previewGroupStyle = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
});

const previewGroupTitleStyle = css({
	fontSize: "text-xs",
	fontWeight: "semibold",
	color: "text.primary",
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderBottomColor: "border.default",
	paddingBottom: "1",
});

const swatchRowStyle = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	gap: "1",
});

const swatchSwatchStyle = css({
	height: "8",
	width: "full",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
});

const swatchLabelStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const previewCardStyle = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "3",
});

const previewCardIconStyle = css({
	display: "flex",
	height: "10",
	width: "10",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
});

const previewCardIconTextStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const previewCardBodyStyle = css({
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: "0.5",
});

const previewCardTitleStyle = css({
	truncate: true,
	fontSize: "text-sm",
	fontWeight: "medium",
	color: "text.primary",
});

const previewCardDescriptionStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const threeColumnGridStyle = css({
	display: "grid",
	gap: "3",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
});

const scrollAreaClass = css({
	maxHeight: "24",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
});

const scrollInnerStyle = css({
	display: "flex",
	flexDirection: "column",
	paddingInline: "2",
	paddingBlock: "1",
});

const scrollLineStyle = css({
	paddingBlock: "0.5",
	fontSize: "text-xs",
	color: "text.muted",
});

const loadingRowStyle = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	fontSize: "text-xs",
	color: "text.muted",
});

const swatchGridFourStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
	gap: "2",
});

const swatchGridThreeStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "3",
});

const swatchBgPanel = css({ backgroundColor: "surface.panel" });
const swatchBgWidget = css({ backgroundColor: "surface.widget" });
const swatchBgDialog = css({ backgroundColor: "surface.dialog" });
const swatchBgOverlay = css({ backgroundColor: "surface.overlay" });
const swatchBgHover = css({ backgroundColor: "interactive.hover" });
const swatchBgActive = css({ backgroundColor: "interactive.active" });
const swatchBorderFocus = css({
	borderWidth: "2px",
	borderStyle: "solid",
	borderColor: "interactive.focus",
});

const iconEditorEmptyStyle = css({
	display: "flex",
	height: "full",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	fontSize: "text-xs",
	color: "text.muted",
});

const codeEditorClass = css({
	minHeight: "140px",
	width: "full",
});

export function PreviewGroup({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}): JSX.Element {
	return (
		<div className={previewGroupStyle}>
			<div className={previewGroupTitleStyle}>{title}</div>
			{children}
		</div>
	);
}

function SwatchRow({
	label,
	className,
}: {
	label: string;
	className: string;
}): JSX.Element {
	return (
		<div className={swatchRowStyle}>
			<div className={cx(swatchSwatchStyle, className)} />
			<span className={swatchLabelStyle}>{label}</span>
		</div>
	);
}

function PreviewCard({
	title,
	description,
}: {
	title: string;
	description: string;
}): JSX.Element {
	return (
		<div className={previewCardStyle}>
			<div className={previewCardIconStyle}>
				<span className={previewCardIconTextStyle}>🎨</span>
			</div>
			<div className={previewCardBodyStyle}>
				<span className={previewCardTitleStyle}>{title}</span>
				<span className={previewCardDescriptionStyle}>{description}</span>
			</div>
		</div>
	);
}

export function ComponentPreviewSection(): JSX.Element {
	const [textValue, setTextValue] = useState("sample");
	const [numberValue, setNumberValue] = useState("42");
	const [sliderValue, setSliderValue] = useState(42);
	const [selectedTab, setSelectedTab] = useState("dark");

	const [selectValue, setSelectValue] = useState("opt1");
	const [searchValue, setSearchValue] = useState("");
	const [pathValue, setPathValue] = useState("/host/presets/example.zip");
	const [tokenValue, setTokenValue] = useState("token-value");
	const [numberTokenValue, setNumberTokenValue] = useState("128");
	const [colorTokenValue, setColorTokenValue] = useState("#5886ff");
	const [markdownValue, setMarkdownValue] = useState(
		"**Bold** and _italic_ text with `code` and [links](https://example.com)",
	);
	const [codeValue, setCodeValue] = useState<CodeEditorValue>(
		"// Sample script preset\nfunction main() {\n  app.project.activeItem.selectedLayers[0].name = 'Renamed';\n}\nmain();",
	);
	const [iconDraft, setIconDraft] = useState<PresetIconEditorDraft>(
		createPresetIconDraft,
	);
	const iconPreviewPreset = useMemo((): Preset | null => {
		const icon = presetIconDraftToPresetIcon(iconDraft);
		if (!icon) {
			return null;
		}
		return {
			id: "ty-plus-preview-icon",
			type: "preset",
			title: "Preview",
			filePath: "ty-plus://icon-preview",
			icon,
		};
	}, [iconDraft]);

	// Directory browser mock entries
	const [dirSelectedFiles, setDirSelectedFiles] = useState<Set<string>>(
		new Set(["/host/presets/fade-in.ffx"]),
	);
	const [dirSelectedFolders, setDirSelectedFolders] = useState<Set<string>>(
		new Set(["/host/presets/animation"]),
	);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<p className={mutedTextStyle}>
					Live preview of shared UI components using current design tokens.
				</p>
			</SettingsField>

			<SettingsField span={6}>
				<ButtonsPreview />
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Segmented Control">
					<SegmentedControl
						options={TAB_OPTIONS}
						value={selectedTab}
						onChange={setSelectedTab}
						aria-label="Theme selection"
					/>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<InputsPreview
					textValue={textValue}
					onTextChange={setTextValue}
					numberValue={numberValue}
					onNumberChange={setNumberValue}
					sliderValue={sliderValue}
					onSliderChange={setSliderValue}
					searchValue={searchValue}
					onSearchChange={setSearchValue}
					pathValue={pathValue}
					onPathChange={setPathValue}
				/>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="List Select">
					<ListSelect
						options={SELECT_OPTIONS}
						value={selectValue}
						onChange={setSelectValue}
						placeholder="Select option"
					/>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Dialog Editors">
					<div className={threeColumnGridStyle}>
						<TokenEditor
							label="Token"
							description="text-r"
							value={tokenValue}
							onChange={setTokenValue}
						/>
						<NumberTokenEditor
							label="Number"
							description="ty-opacity-text-main"
							value={numberTokenValue}
							onChange={setNumberTokenValue}
							unit="%"
						/>
						<ColorTokenEditor
							label="Color"
							description="color-ty-accent"
							value={colorTokenValue}
							onChange={setColorTokenValue}
						/>
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Scroll Area">
					<ScrollArea className={scrollAreaClass}>
						<div className={scrollInnerStyle}>
							{Array.from({ length: 12 }, (_, index) => (
								<div key={index} className={scrollLineStyle}>
									Line item {index + 1}
								</div>
							))}
						</div>
					</ScrollArea>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Loading">
					<div className={loadingRowStyle}>
						<LoadingSpinner size="sm" />
						<span>Syncing settings</span>
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Surface Colors">
					<div className={swatchGridFourStyle}>
						<SwatchRow label="Panel" className={swatchBgPanel} />
						<SwatchRow label="Widget" className={swatchBgWidget} />
						<SwatchRow label="Dialog" className={swatchBgDialog} />
						<SwatchRow label="Overlay" className={swatchBgOverlay} />
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Interactive States">
					<div className={swatchGridThreeStyle}>
						<SwatchRow label="Hover" className={swatchBgHover} />
						<SwatchRow label="Active" className={swatchBgActive} />
						<SwatchRow label="Focus" className={swatchBorderFocus} />
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Preview Card">
					<PreviewCard title="Cool blue" description="local · 12 KB" />
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<DirectoryBrowserPreview
					dirSelectedFiles={dirSelectedFiles}
					setDirSelectedFiles={setDirSelectedFiles}
					dirSelectedFolders={dirSelectedFolders}
					setDirSelectedFolders={setDirSelectedFolders}
					viewMode="list"
				/>
			</SettingsField>

			<SettingsField span={6}>
				<DirectoryBrowserPreview
					dirSelectedFiles={dirSelectedFiles}
					setDirSelectedFiles={setDirSelectedFiles}
					dirSelectedFolders={dirSelectedFolders}
					setDirSelectedFolders={setDirSelectedFolders}
					viewMode="icons"
				/>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Preset Icon Editor">
					<PresetIconEditor
						draft={iconDraft}
						onChange={setIconDraft}
						preview={
							iconPreviewPreset ? (
								<FramedPresetGlyph
									preset={iconPreviewPreset}
									boxClass="h-full w-full"
								/>
							) : (
								<div className={iconEditorEmptyStyle}>—</div>
							)
						}
					/>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Markdown Editor">
					<MarkdownLiveEditor
						value={markdownValue}
						onChange={setMarkdownValue}
						placeholder="Description (markdown)"
					/>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title="Code Editor">
					<Editor
						value={codeValue}
						onChange={setCodeValue}
						language="javascript"
						className={codeEditorClass}
					/>
				</PreviewGroup>
			</SettingsField>
		</SettingsGrid>
	);
}
