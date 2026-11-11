import { type ChangeEvent, type JSX, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { cx } from "@/shared/util/cx";
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

const checkboxStyle = css({
	height: "3.5",
	width: "3.5",
	cursor: "pointer",
	accentColor: "text.accent",
});

export function InputsSection(): JSX.Element {
	const { t } = useTranslation("settings");
	const { settings, updateSettings } = useSettings();

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
				<SettingsFieldLabel>Gestures</SettingsFieldLabel>
				<div className={groupStyle}>
					<label className={labelStyle}>
						<input
							type="checkbox"
							className={cx(checkboxStyle, "ty-ui-checkbox")}
							checked={settings.gestures.anchorPoint}
							onChange={handleGestureToggle("anchorPoint")}
							data-settings-gesture="anchorPoint"
						/>
						<span>{t("settings.inputs.gestures.anchorPoint")}</span>
					</label>
					<label className={labelStyle}>
						<input
							type="checkbox"
							className={cx(checkboxStyle, "ty-ui-checkbox")}
							checked={settings.gestures.alignment}
							onChange={handleGestureToggle("alignment")}
							data-settings-gesture="alignment"
						/>
						<span>{t("settings.inputs.gestures.alignment")}</span>
					</label>
				</div>
			</SettingsField>
		</SettingsGrid>
	);
}
