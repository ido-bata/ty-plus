import { Checkbox } from "@ty-plus/ui";
import { type ChangeEvent, type JSX, useCallback, useId } from "react";
import { i18n } from "@/management/i18n/index";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { css } from "@/styled-system/css";

type GestureKey = "anchorPoint" | "alignment";

/**
 * Section that exposes the per-gesture opt-out toggles added by Issue #78.
 *
 * Both toggles default to `true`. Toggling either flag off short-circuits
 * the matching `useAnchorGesture` consumer so the widget falls back to its
 * direct-click path.
 *
 * The read/write path goes through `useSettings()` — the same JSON store
 * the rest of the dialog uses. `mergeSettings` preserves untouched
 * siblings, so updating a single flag does not lose the other one.
 */

const groupStyle = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	flexDirection: "column",
	gap: "var(--ty-space-2)",
});

const labelStyle = css({
	display: "flex",
	width: "full",
	minWidth: 0,
	cursor: "pointer",
	alignItems: "center",
	gap: "var(--ty-shell-space)",
	fontSize: "text-xs",
	color: "text.primary",
});

export function InputsSection(): JSX.Element {
	const { settings, updateSettings } = useSettings();
	const anchorPointId = useId();
	const alignmentId = useId();

	const handleGestureToggle = useCallback(
		(key: GestureKey) => (event: ChangeEvent<HTMLInputElement>) => {
			updateSettings({
				gestures: {
					...settings.gestures,
					[key]: event.target.checked,
				},
			});
		},
		[settings.gestures, updateSettings],
	);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<SettingsFieldLabel>
					{i18n.t("settings:inputsSection.gestures")}
				</SettingsFieldLabel>
				<div className={groupStyle}>
					<label className={labelStyle} htmlFor={anchorPointId}>
						<Checkbox
							id={anchorPointId}
							uiSize="sm"
							checked={settings.gestures.anchorPoint}
							onChange={handleGestureToggle("anchorPoint")}
							data-settings-gesture="anchorPoint"
						/>
						<span>{i18n.t("settings:inputs.gestures.anchorPoint")}</span>
					</label>
					<label className={labelStyle} htmlFor={alignmentId}>
						<Checkbox
							id={alignmentId}
							uiSize="sm"
							checked={settings.gestures.alignment}
							onChange={handleGestureToggle("alignment")}
							data-settings-gesture="alignment"
						/>
						<span>{i18n.t("settings:inputs.gestures.alignment")}</span>
					</label>
				</div>
			</SettingsField>
		</SettingsGrid>
	);
}
