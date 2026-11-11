import type { JSX } from "react";
import type {
	Layer,
	PatternValue,
} from "@/management/workspace/background/contract";
import { SegmentedControl } from "@/shared/component/controls/SegmentedControl";
import { css } from "@/styled-system/css";
import { QUIET_SELECTED_CLASS } from "./constants";
import { ColorField, FieldLabel, NumberField } from "./Fields";

const PATTERNS: readonly PatternValue[] = ["dots", "grid", "lines"];

const root = css({
	display: "grid",
	gap: "3",
});

const fieldGroup = css({
	display: "grid",
	gap: "1",
});

const segmentedOverrides = css({
	borderColor: "var(--color-ty-widget-border)",
});

const segmentedButton = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "transparent",
});

const unselected = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "var(--color-ty-ink-04)",
		color: "text.primary",
	},
});

export function PatternLayerEditor({
	layer,
	updateLayer,
	t,
}: {
	layer: Layer;
	updateLayer: (id: string, updates: Partial<Layer>) => void;
	t: (key: string) => string;
}): JSX.Element {
	return (
		<div className={root}>
			<div className={fieldGroup}>
				<FieldLabel>{t("workspaceShell.backgroundPanel.pattern")}</FieldLabel>
				<SegmentedControl
					aria-label={t("workspaceShell.backgroundPanel.pattern")}
					value={layer.patternType ?? "dots"}
					onChange={(value) =>
						updateLayer(layer.id, { patternType: value as PatternValue })
					}
					options={PATTERNS.map((pattern) => ({
						value: pattern,
						label: t(`workspaceShell.backgroundPanel.patterns.${pattern}`),
					}))}
					className={segmentedOverrides}
					buttonClassName={segmentedButton}
					selectedClassName={QUIET_SELECTED_CLASS}
					unselectedClassName={unselected}
				/>
			</div>
			<NumberField
				label={t("workspaceShell.backgroundPanel.patternSize")}
				value={layer.patternSize ?? 6}
				min={2}
				max={64}
				onValueChange={(v) => updateLayer(layer.id, { patternSize: v })}
			/>
			<ColorField
				label={t("workspaceShell.backgroundPanel.patternColor")}
				value={layer.patternColor ?? "#444444"}
				onColorChange={(value) =>
					updateLayer(layer.id, { patternColor: value })
				}
			/>
			<NumberField
				label={t("workspaceShell.backgroundPanel.opacity")}
				value={layer.patternColorOpacity ?? 100}
				min={0}
				max={100}
				onValueChange={(v) => updateLayer(layer.id, { patternColorOpacity: v })}
			/>
			<ColorField
				label={t("workspaceShell.backgroundPanel.patternBg")}
				value={layer.patternBgColor ?? "transparent"}
				onColorChange={(value) =>
					updateLayer(layer.id, { patternBgColor: value })
				}
			/>
			<NumberField
				label={t("workspaceShell.backgroundPanel.opacity")}
				value={layer.patternBgOpacity ?? 100}
				min={0}
				max={100}
				onValueChange={(v) => updateLayer(layer.id, { patternBgOpacity: v })}
			/>
		</div>
	);
}
