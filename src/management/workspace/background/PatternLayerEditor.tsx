import { SegmentedControl, segmentedButtonQuietClass } from "@ty-plus/ui";
import type { JSX } from "react";
import type {
	Layer,
	PatternValue,
} from "@/management/workspace/background/contract";
import { DEFAULT_PATTERN_COLOR } from "@/management/workspace/literals/layer-colors";
import { css } from "@/styled-system/css";
import { QUIET_SELECTED_CLASS } from "./constants";
import { ColorField, FieldLabel, NumberField } from "./Fields";
import { colorConsumesOpacity } from "./style";

const PATTERNS: readonly PatternValue[] = ["dots", "grid", "lines"];

const root = css({
	display: "grid",
	gap: "3",
});

const fieldGroup = css({
	display: "grid",
	gap: "1",
});

/*
 * Issue #795: each colour field and its opacity control form one setting.
 * They used to be flat siblings at the root `gap: 3`, so an opacity row
 * sat as far from its own colour row as from the next colour row and the
 * four rows read as an undifferentiated stack. Pairing them at `gap: 2`
 * keeps the colour→opacity relationship scannable while the root gap
 * still separates the pairs.
 */
const colorOpacityPair = css({
	display: "grid",
	gap: "2",
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
	const patternColor = layer.patternColor ?? DEFAULT_PATTERN_COLOR;
	const patternBgColor = layer.patternBgColor ?? "transparent";
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
					buttonClassName={segmentedButtonQuietClass}
					selectedClassName={QUIET_SELECTED_CLASS}
				/>
			</div>
			<NumberField
				label={t("workspaceShell.backgroundPanel.patternSize")}
				value={layer.patternSize ?? 6}
				min={2}
				max={64}
				onValueChange={(v) => updateLayer(layer.id, { patternSize: v })}
			/>
			<div className={colorOpacityPair}>
				<ColorField
					label={t("workspaceShell.backgroundPanel.patternColor")}
					value={patternColor}
					onColorChange={(value) =>
						updateLayer(layer.id, { patternColor: value })
					}
				/>
				{/* Issue #795: a non-hex colour ("transparent" or an
				 * unparseable value) renders fully transparent in
				 * `hexToRgba`, so its opacity control has no effect —
				 * disable it instead of leaving a live-looking dead
				 * slider beside a transparent swatch. */}
				<NumberField
					label={t("workspaceShell.backgroundPanel.patternColorOpacity")}
					value={layer.patternColorOpacity ?? 100}
					min={0}
					max={100}
					disabled={!colorConsumesOpacity(patternColor)}
					onValueChange={(v) =>
						updateLayer(layer.id, { patternColorOpacity: v })
					}
				/>
			</div>
			<div className={colorOpacityPair}>
				<ColorField
					label={t("workspaceShell.backgroundPanel.patternBg")}
					value={patternBgColor}
					onColorChange={(value) =>
						updateLayer(layer.id, { patternBgColor: value })
					}
				/>
				<NumberField
					label={t("workspaceShell.backgroundPanel.patternBgOpacity")}
					value={layer.patternBgOpacity ?? 100}
					min={0}
					max={100}
					disabled={!colorConsumesOpacity(patternBgColor)}
					onValueChange={(v) => updateLayer(layer.id, { patternBgOpacity: v })}
				/>
			</div>
		</div>
	);
}
