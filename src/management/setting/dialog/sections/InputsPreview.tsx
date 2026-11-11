import { FolderOpen, Search } from "lucide-react";
import type { JSX } from "react";
import { Input } from "@/shared/component/fields/Input";
import { NumberField } from "@/shared/component/fields/NumberField";
import { PathField } from "@/shared/component/fields/PathField";
import { RangeField } from "@/shared/component/fields/RangeField";
import { SearchField } from "@/shared/component/fields/SearchField";
import { Textarea } from "@/shared/component/fields/Textarea";
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
			<PreviewGroup title="Inputs">
				<div className={inputsGridStyle}>
					<Input
						label="Text input"
						value={textValue}
						onChange={(e) => onTextChange(e.target.value)}
						placeholder="Text"
						className={fullWidthClass}
					/>
					<NumberField
						label="Number field"
						value={numberValue}
						onChange={onNumberChange}
						placeholder="42"
						className={fullWidthClass}
					/>
					<RangeField
						label="Slider with numeric input"
						value={sliderValue}
						onChange={onSliderChange}
						min={0}
						max={100}
						step={1}
						unit="%"
					/>
					<Input
						label="Error state"
						value=""
						onChange={() => {}}
						error="Example validation message"
						placeholder="Error"
						className={fullWidthClass}
					/>
				</div>
			</PreviewGroup>
			<PreviewGroup title="Search Field">
				<SearchField
					icon={Search}
					value={searchValue}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Search..."
					showInlineTrailing={true}
					inlineTrailing={<span>12 results</span>}
					showClearButton={true}
					onClear={() => onSearchChange("")}
				/>
			</PreviewGroup>
			<PreviewGroup title="Path Field">
				<PathField
					value={pathValue}
					onChange={onPathChange}
					onBrowse={() => onPathChange("/host/presets/example.zip")}
					browseSlot={<FolderOpen size={16} strokeWidth={2} aria-hidden />}
					browseAriaLabel="Browse preset path"
					placeholder="Preset path"
					uiSize="sm"
					className={fullWidthClass}
				/>
			</PreviewGroup>
			<PreviewGroup title="Text Area">
				<Textarea
					value="Sample multiline text"
					onChange={() => {}}
					placeholder="Enter description..."
					rows={3}
					className={fullWidthClass}
				/>
			</PreviewGroup>
		</>
	);
}
