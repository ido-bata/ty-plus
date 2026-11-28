import { Input, ListSelect } from "@ty-plus/ui";
import type { ChangeEvent, JSX } from "react";
import { useTranslation } from "react-i18next";
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
				// Issue #797: `flex-end` bottom-aligned the controls, but the
				// ListSelect `sm` trigger is one step taller than the `sm`
				// Input, so the input's top edge sat ~4px lower. Center
				// alignment keeps the control midlines on one keyline
				// regardless of the two components' height tiers.
				alignItems: "center",
				gap: "2",
			})}
		>
			<ListSelect
				uiSize="sm"
				// Issue #754: intrinsic width keeps the preset picker on the
				// same row as the sample Input instead of claiming 100% and
				// wrapping it to a second line.
				width="fitContent"
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
				})}
				value={sample}
				// Issue #797: the single-line field scrolls long samples
				// horizontally; `title` keeps the full text reachable on
				// hover instead of clipping mid-word with no affordance.
				title={sample}
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
