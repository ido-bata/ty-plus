import { cardTitleClass } from "@ty-plus/ui";
import { SegmentedControl } from "@ty-plus/ui/controls/SegmentedControl";
import { LoadingSpinner } from "@ty-plus/ui/feedback/LoadingSpinner";
import { ListSelect } from "@ty-plus/ui/fields/ListSelect";
import { ScrollArea } from "@ty-plus/ui/layout/ScrollArea";
import { cx } from "@ty-plus/ui/util/cx";
import { type JSX, type ReactNode, useMemo, useState } from "react";
import { i18n } from "@/management/i18n/index";
import type { Preset } from "@/management/preset/contract";
import type { CodeEditorValue } from "@/management/preset/editor/Code";
import { Editor } from "@/management/preset/editor/View";
import { PresetIconEditor } from "@/management/preset/icon/Editor";
import {
	createPresetIconDraft,
	type PresetIconEditorDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon/editor-state";
import { MarkdownLiveEditor } from "@/management/preset/markdown/LiveEditor";
import { glyphBoxFillClass } from "@/management/preset/workspace/glyph/classes";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph/WorkspaceGlyph";
import { ColorTokenEditor } from "@/management/setting/dialog/components/ColorTokenEditor";
import { NumberTokenEditor } from "@/management/setting/dialog/components/NumberTokenEditor";
import { TokenEditor } from "@/management/setting/dialog/components/TokenEditor";
import {
	SettingsField,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { css } from "@/styled-system/css";
import { ButtonsPreview } from "./ButtonsPreview";
import { DirectoryBrowserPreview } from "./DirectoryBrowserPreview";
import { InputsPreview } from "./InputsPreview";

const TAB_OPTIONS = [
	{ value: "system", labelKey: "common:settings.themes.system" },
	{ value: "dark", labelKey: "common:settings.themes.dark" },
	{ value: "light", labelKey: "common:settings.themes.light" },
];

const SELECT_OPTIONS = [
	{ value: "opt1", labelKey: "settings:componentPreview.option1" },
	{ value: "opt2", labelKey: "settings:componentPreview.option2" },
	{ value: "opt3", labelKey: "settings:componentPreview.option3" },
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
	borderBottomWidth: "hairline",
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
	borderWidth: "hairline",
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
	borderWidth: "hairline",
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
	borderWidth: "hairline",
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
	borderWidth: "hairline",
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
	borderWidth: "hairline",
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
				<span className={cx(cardTitleClass, css({ truncate: true }))}>
					{title}
				</span>
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
	const tabOptions = useMemo(
		() =>
			TAB_OPTIONS.map((option) => ({
				value: option.value,
				label: i18n.t(option.labelKey),
			})),
		[],
	);
	const selectOptions = useMemo(
		() =>
			SELECT_OPTIONS.map((option) => ({
				value: option.value,
				label: i18n.t(option.labelKey),
			})),
		[],
	);

	const iconPreviewPreset = useMemo((): Preset | null => {
		const icon = presetIconDraftToPresetIcon(iconDraft);
		if (!icon) {
			return null;
		}
		return {
			id: "ty-plus-preview-icon",
			type: "preset",
			title: i18n.t("settings:componentPreview.presetTitle"),
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
					{i18n.t("settings:componentPreview.intro")}
				</p>
			</SettingsField>

			<SettingsField span={6}>
				<ButtonsPreview />
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup
					title={i18n.t("settings:componentPreview.segmentedControl")}
				>
					<SegmentedControl
						options={tabOptions}
						value={selectedTab}
						onChange={setSelectedTab}
						aria-label={i18n.t("settings:componentPreview.themeSelectionAria")}
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
				<PreviewGroup title={i18n.t("settings:componentPreview.listSelect")}>
					<ListSelect
						options={selectOptions}
						value={selectValue}
						onChange={setSelectValue}
						placeholder={i18n.t(
							"settings:componentPreview.selectOptionPlaceholder",
						)}
					/>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title={i18n.t("settings:componentPreview.dialogEditors")}>
					<div className={threeColumnGridStyle}>
						<TokenEditor
							label={i18n.t("settings:componentPreview.editorToken")}
							description="text-r"
							value={tokenValue}
							onChange={setTokenValue}
						/>
						<NumberTokenEditor
							label={i18n.t("settings:componentPreview.editorNumber")}
							description="ty-opacity-text-main"
							value={numberTokenValue}
							onChange={setNumberTokenValue}
							unit="%"
						/>
						<ColorTokenEditor
							label={i18n.t("settings:componentPreview.editorColor")}
							description="color-ty-accent"
							value={colorTokenValue}
							onChange={setColorTokenValue}
						/>
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title={i18n.t("settings:componentPreview.scrollArea")}>
					<ScrollArea className={scrollAreaClass}>
						<div className={scrollInnerStyle}>
							{Array.from({ length: 12 }, (_, index) => (
								<div key={index} className={scrollLineStyle}>
									{i18n.t("settings:componentPreview.lineItem", {
										index: index + 1,
									})}
								</div>
							))}
						</div>
					</ScrollArea>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title={i18n.t("settings:componentPreview.loading")}>
					<div className={loadingRowStyle}>
						<LoadingSpinner size="sm" />
						<span>{i18n.t("settings:componentPreview.syncingSettings")}</span>
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title={i18n.t("settings:componentPreview.surfaceColors")}>
					<div className={swatchGridFourStyle}>
						<SwatchRow
							label={i18n.t("settings:componentPreview.swatchPanel")}
							className={swatchBgPanel}
						/>
						<SwatchRow
							label={i18n.t("settings:componentPreview.swatchWidget")}
							className={swatchBgWidget}
						/>
						<SwatchRow
							label={i18n.t("settings:componentPreview.swatchDialog")}
							className={swatchBgDialog}
						/>
						<SwatchRow
							label={i18n.t("settings:componentPreview.swatchOverlay")}
							className={swatchBgOverlay}
						/>
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup
					title={i18n.t("settings:componentPreview.interactiveStates")}
				>
					<div className={swatchGridThreeStyle}>
						<SwatchRow
							label={i18n.t("settings:componentPreview.swatchHover")}
							className={swatchBgHover}
						/>
						<SwatchRow
							label={i18n.t("settings:componentPreview.swatchActive")}
							className={swatchBgActive}
						/>
						<SwatchRow
							label={i18n.t("settings:componentPreview.swatchFocus")}
							className={swatchBorderFocus}
						/>
					</div>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title={i18n.t("settings:componentPreview.previewCard")}>
					<PreviewCard
						title={i18n.t("settings:componentPreview.previewCardTitle")}
						description={i18n.t(
							"settings:componentPreview.previewCardDescription",
						)}
					/>
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
				<PreviewGroup
					title={i18n.t("settings:componentPreview.presetIconEditor")}
				>
					<PresetIconEditor
						draft={iconDraft}
						onChange={setIconDraft}
						preview={
							iconPreviewPreset ? (
								<FramedPresetGlyph
									preset={iconPreviewPreset}
									boxClass={glyphBoxFillClass}
								/>
							) : (
								<div className={iconEditorEmptyStyle}>—</div>
							)
						}
					/>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup
					title={i18n.t("settings:componentPreview.markdownEditor")}
				>
					<MarkdownLiveEditor
						value={markdownValue}
						onChange={setMarkdownValue}
						placeholder={i18n.t(
							"settings:componentPreview.markdownPlaceholder",
						)}
					/>
				</PreviewGroup>
			</SettingsField>

			<SettingsField span={6}>
				<PreviewGroup title={i18n.t("settings:componentPreview.codeEditor")}>
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
