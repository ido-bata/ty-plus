import type { ChangeEvent, JSX } from "react";
import { useTranslation } from "react-i18next";
import { ListSelect } from "@/shared/component";
import { Input } from "@/shared/component/fields/Input";
import { css } from "@/styled-system/css";
import type { FontSamplePreset } from "./sample-presets";

export type FontViewerSampleRowProps = {
	presets: readonly FontSamplePreset[];
	presetChoice: string;
	sample: string;
	onSampleChange: (next: string) => void;
	onPresetChoiceChange: (next: string) => void;
};

export function FontViewerSampleRow({
	presets,
	presetChoice,
	sample,
	onSampleChange,
	onPresetChoiceChange,
}: FontViewerSampleRowProps): JSX.Element {
	const { t } = useTranslation("widgets");
	return (
		<div
			className={css({
				display: "flex",
				flexShrink: 0,
				flexWrap: "wrap",
				alignItems: "flex-end",
				gap: "2",
			})}
		>
			<ListSelect
				uiSize="sm"
				className={css({ flexShrink: 0 })}
				options={[
					...presets.map((p) => ({
						value: p.id,
						label: p.id.toUpperCase(),
					})),
					{
						value: "custom",
						label: t("fontViewer.sampleCustom", { defaultValue: "Custom" }),
					},
				]}
				value={presetChoice}
				onChange={(v) => {
					if (v === "custom") {
						onPresetChoiceChange("custom");
						return;
					}
					const preset = presets.find((p) => p.id === v);
					if (preset) {
						onSampleChange(preset.text);
						onPresetChoiceChange(v);
					}
				}}
				aria-label={t("fontViewer.samplePresetAria", {
					defaultValue: "Preview sample preset",
				})}
			/>
			<Input
				uiSize="sm"
				className={css({
					minWidth: 0,
					flex: 1,
					fontFamily: "mono",
					fontSize: "text-xs",
				})}
				value={sample}
				onChange={(e: ChangeEvent<HTMLInputElement>) => {
					onSampleChange(e.target.value);
					onPresetChoiceChange("custom");
				}}
				placeholder={t("fontViewer.samplePlaceholder", {
					defaultValue: "Preview text (CJK / emoji / Latin)",
				})}
				aria-label={t("fontViewer.previewTextAria", {
					defaultValue: "Preview text",
				})}
			/>
		</div>
	);
}
