import { Input } from "@ty-plus/ui/fields/Input";
import { NumberField } from "@ty-plus/ui/fields/NumberField";
import { PathField } from "@ty-plus/ui/fields/PathField";
import { RangeField } from "@ty-plus/ui/fields/RangeField";
import { SearchField } from "@ty-plus/ui/fields/SearchField";
import { Textarea } from "@ty-plus/ui/fields/Textarea";
import { FolderOpen, Search } from "lucide-react";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import { css } from "@/styled-system/css";
import { PreviewGroup } from "./ComponentPreviewSection";

const inputsGridStyle = css({
	display: "grid",
	width: "full",
	gap: "3",
});

const fullWidthClass = css({ width: "full" });

export function InputsPreview({
	textValue,
	onTextChange,
	numberValue,
	onNumberChange,
	sliderValue,
	onSliderChange,
	searchValue,
	onSearchChange,
	pathValue,
	onPathChange,
}: {
	textValue: string;
	onTextChange: (v: string) => void;
	numberValue: string;
	onNumberChange: (v: string) => void;
	sliderValue: number;
	onSliderChange: (v: number) => void;
	searchValue: string;
	onSearchChange: (v: string) => void;
	pathValue: string;
	onPathChange: (v: string) => void;
}): JSX.Element {
	return (
		<>
			<PreviewGroup title={i18n.t("settings:componentPreview.inputs")}>
				<div className={inputsGridStyle}>
					<Input
						label={i18n.t("settings:componentPreview.textInput")}
						value={textValue}
						onChange={(e) => onTextChange(e.target.value)}
						placeholder={i18n.t("settings:componentPreview.textPlaceholder")}
						className={fullWidthClass}
					/>
					<NumberField
						label={i18n.t("settings:componentPreview.numberField")}
						value={numberValue}
						onChange={onNumberChange}
						placeholder="42"
						className={fullWidthClass}
					/>
					<RangeField
						label={i18n.t("settings:componentPreview.sliderWithNumericInput")}
						value={sliderValue}
						onChange={onSliderChange}
						min={0}
						max={100}
						step={1}
						unit="%"
					/>
					<Input
						label={i18n.t("settings:componentPreview.errorState")}
						value=""
						onChange={() => {}}
						error={i18n.t("settings:componentPreview.errorMessage")}
						placeholder={i18n.t("settings:componentPreview.errorPlaceholder")}
						className={fullWidthClass}
					/>
				</div>
			</PreviewGroup>
			<PreviewGroup title={i18n.t("settings:componentPreview.searchField")}>
				<SearchField
					icon={Search}
					value={searchValue}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder={i18n.t("settings:componentPreview.searchPlaceholder")}
					showInlineTrailing={true}
					inlineTrailing={
						<span>
							{i18n.t("settings:componentPreview.resultsCount", {
								count: 12,
							})}
						</span>
					}
					showClearButton={true}
					onClear={() => onSearchChange("")}
				/>
			</PreviewGroup>
			<PreviewGroup title={i18n.t("settings:componentPreview.pathField")}>
				<PathField
					value={pathValue}
					onChange={onPathChange}
					onBrowse={() => onPathChange("/host/presets/example.zip")}
					browseSlot={<FolderOpen size={16} strokeWidth={2} aria-hidden />}
					browseAriaLabel={i18n.t("settings:componentPreview.browsePresetPath")}
					placeholder={i18n.t(
						"settings:componentPreview.presetPathPlaceholder",
					)}
					uiSize="sm"
					className={fullWidthClass}
				/>
			</PreviewGroup>
			<PreviewGroup title={i18n.t("settings:componentPreview.textArea")}>
				<Textarea
					value="Sample multiline text"
					onChange={() => {}}
					placeholder={i18n.t(
						"settings:componentPreview.enterDescriptionPlaceholder",
					)}
					rows={3}
					className={fullWidthClass}
				/>
			</PreviewGroup>
		</>
	);
}
