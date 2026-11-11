import { type JSX, useCallback } from "react";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsGrid,
	SettingsSectionHeading,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { SegmentedControl } from "@/shared/component/controls/SegmentedControl";
import { ColorField } from "@/shared/component/fields/ColorField";
import { RangeField } from "@/shared/component/fields/RangeField";
import { css } from "@/styled-system/css";

const THEME_OPTIONS = [
	{ value: "system", label: "System" },
	{ value: "dark", label: "Dark" },
	{ value: "light", label: "Light" },
	{ value: "custom", label: "Custom" },
];

const colorRowStyle = css({
	display: "grid",
	width: "full",
	minWidth: 0,
	gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	gap: "var(--ty-shell-space)",
});

export function StyleSection(): JSX.Element {
	const { settings, updateSettings } = useSettings();

	const handleThemeChange = useCallback(
		(theme: string) => {
			updateSettings({
				ui: {
					...settings.ui,
					theme: theme as "system" | "dark" | "light" | "custom",
				},
			});
		},
		[settings.ui, updateSettings],
	);

	const handleAccentColorChange = useCallback(
		(color: string) => {
			updateSettings({
				ui: { ...settings.ui, accentColor: color },
			});
		},
		[settings.ui, updateSettings],
	);

	const handleTextColorChange = useCallback(
		(color: string) => {
			updateSettings({
				ui: { ...settings.ui, textColor: color },
			});
		},
		[settings.ui, updateSettings],
	);

	const handleWidgetBgColorChange = useCallback(
		(color: string) => {
			updateSettings({
				ui: {
					...settings.ui,
					widget: {
						backgroundColor: color,
						opacity: settings.ui.widget?.opacity ?? 80,
					},
				},
			});
		},
		[settings.ui, updateSettings],
	);

	const handleWidgetOpacityChange = useCallback(
		(opacity: number) => {
			updateSettings({
				ui: {
					...settings.ui,
					widget: {
						backgroundColor: settings.ui.widget?.backgroundColor ?? "#1a1a1a",
						opacity,
					},
				},
			});
		},
		[settings.ui, updateSettings],
	);

	const handlePanelBgColorChange = useCallback(
		(color: string) => {
			updateSettings({
				ui: {
					...settings.ui,
					panel: {
						backgroundColor: color,
						opacity: settings.ui.panel?.opacity ?? 95,
					},
				},
			});
		},
		[settings.ui, updateSettings],
	);

	const handlePanelOpacityChange = useCallback(
		(opacity: number) => {
			updateSettings({
				ui: {
					...settings.ui,
					panel: {
						backgroundColor: settings.ui.panel?.backgroundColor ?? "#0f0f0f",
						opacity,
					},
				},
			});
		},
		[settings.ui, updateSettings],
	);

	const widgetBg = settings.ui.widget?.backgroundColor ?? "#1a1a1a";
	const widgetOpacity = settings.ui.widget?.opacity ?? 80;
	const panelBg = settings.ui.panel?.backgroundColor ?? "#0f0f0f";
	const panelOpacity = settings.ui.panel?.opacity ?? 95;

	return (
		<SettingsGrid>
			<SettingsSectionHeading>Theme</SettingsSectionHeading>
			<SettingsField span={6}>
				<SegmentedControl
					options={THEME_OPTIONS}
					value={settings.ui.theme}
					onChange={handleThemeChange}
					aria-label="Theme selection"
				/>
			</SettingsField>

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
