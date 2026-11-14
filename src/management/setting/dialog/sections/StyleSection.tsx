import { type JSX, useCallback } from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsGrid,
	SettingsSectionHeading,
} from "@/management/setting/dialog/layout/SettingsGrid";
import type { Settings } from "@/management/setting/models/settings";
import { applyUiSettingsTheme } from "@/management/setting/ui-theme-sync";
import { ColorField } from "@/shared/component/fields/ColorField";
import { RangeField } from "@/shared/component/fields/RangeField";
import { css } from "@/styled-system/css";

const colorRowStyle = css({
	display: "grid",
	width: "full",
	minWidth: 0,
	gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	gap: "var(--ty-shell-space)",
});

export function StyleSection(): JSX.Element {
	const { settings, updateSettings } = useSettings();
	const { panelSurfaceId } = useCep();

	// `settings.ui.*` is write-only unless projected into the theme token
	// pipeline; `applyUiSettingsTheme` persists it to theme.css and
	// broadcasts `themeLive` so every surface converges (Issue #94).
	const commitUi = useCallback(
		(nextUi: Settings["ui"]) => {
			updateSettings({ ui: nextUi });
			void applyUiSettingsTheme(window, panelSurfaceId, nextUi).catch(
				(error) => {
					console.error("[StyleSection] Failed to apply UI theme:", error);
				},
			);
		},
		[panelSurfaceId, updateSettings],
	);

	const handleAccentColorChange = useCallback(
		(color: string) => {
			commitUi({ ...settings.ui, accentColor: color });
		},
		[settings.ui, commitUi],
	);

	const handleTextColorChange = useCallback(
		(color: string) => {
			commitUi({ ...settings.ui, textColor: color });
		},
		[settings.ui, commitUi],
	);

	const handleWidgetBgColorChange = useCallback(
		(color: string) => {
			commitUi({
				...settings.ui,
				widget: {
					backgroundColor: color,
					opacity: settings.ui.widget?.opacity ?? 80,
				},
			});
		},
		[settings.ui, commitUi],
	);

	const handleWidgetOpacityChange = useCallback(
		(opacity: number) => {
			commitUi({
				...settings.ui,
				widget: {
					backgroundColor: settings.ui.widget?.backgroundColor ?? "#1a1a1a",
					opacity,
				},
			});
		},
		[settings.ui, commitUi],
	);

	const handlePanelBgColorChange = useCallback(
		(color: string) => {
			commitUi({
				...settings.ui,
				panel: {
					backgroundColor: color,
					opacity: settings.ui.panel?.opacity ?? 95,
				},
			});
		},
		[settings.ui, commitUi],
	);

	const handlePanelOpacityChange = useCallback(
		(opacity: number) => {
			commitUi({
				...settings.ui,
				panel: {
					backgroundColor: settings.ui.panel?.backgroundColor ?? "#0f0f0f",
					opacity,
				},
			});
		},
		[settings.ui, commitUi],
	);

	const widgetBg = settings.ui.widget?.backgroundColor ?? "#1a1a1a";
	const widgetOpacity = settings.ui.widget?.opacity ?? 80;
	const panelBg = settings.ui.panel?.backgroundColor ?? "#0f0f0f";
	const panelOpacity = settings.ui.panel?.opacity ?? 95;

	return (
		<SettingsGrid>
			{/* `ui.theme` has no second palette to switch to; the selector is
			    hidden until light/system themes exist (Issue #94). */}
			<SettingsSectionHeading>Colors</SettingsSectionHeading>
			<SettingsField span={3}>
				<ColorField
					label="Accent"
					value={settings.ui.accentColor ?? "#5886ff"}
					onChange={handleAccentColorChange}
				/>
			</SettingsField>
			<SettingsField span={3}>
				<ColorField
					label="Text"
					value={settings.ui.textColor ?? "#f0f0f0"}
					onChange={handleTextColorChange}
				/>
			</SettingsField>
			<SettingsField span={6}>
				<div className={colorRowStyle}>
					<ColorField
						label="Widget Background"
						value={widgetBg}
						onChange={handleWidgetBgColorChange}
					/>
					<RangeField
						label="Opacity"
						unit="%"
						min={0}
						max={100}
						value={widgetOpacity}
						onChange={handleWidgetOpacityChange}
					/>
				</div>
			</SettingsField>
			<SettingsField span={6}>
				<div className={colorRowStyle}>
					<ColorField
						label="Panel Background"
						value={panelBg}
						onChange={handlePanelBgColorChange}
					/>
					<RangeField
						label="Opacity"
						unit="%"
						min={0}
						max={100}
						value={panelOpacity}
						onChange={handlePanelOpacityChange}
					/>
				</div>
			</SettingsField>
		</SettingsGrid>
	);
}
