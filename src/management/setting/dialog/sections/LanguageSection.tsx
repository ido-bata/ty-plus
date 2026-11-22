import { ListSelect } from "@ty-plus/ui/fields/ListSelect";
import { type JSX, useCallback, useState } from "react";
import { BUNDLED_LOCALE_NAMES } from "@/management/i18n/bundled-resources";
import {
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "@/management/i18n/config";
import { changeLanguage, i18n } from "@/management/i18n/index";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";

export function LanguageSection(): JSX.Element {
	const { settings, updateSettings } = useSettings();
	const [localLocale, setLocalLocale] = useState<string>(settings.ui.language);

	const handleLocaleChange = useCallback(
		(locale: string) => {
			setLocalLocale(locale);
			void changeLanguage(locale as SupportedLocale);
			updateSettings({
				ui: { ...settings.ui, language: locale as "en" | "ja" },
			});
		},
		[settings.ui, updateSettings],
	);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<SettingsFieldLabel>
					{i18n.t("settings:languageSection.displayLanguage")}
				</SettingsFieldLabel>
				<ListSelect
					options={SUPPORTED_LOCALES.map((code) => ({
						value: code,
						label: BUNDLED_LOCALE_NAMES[i18n.language]?.[code] ?? code,
					}))}
					value={localLocale}
					onChange={handleLocaleChange}
					placeholder={i18n.t("settings:languageSection.selectLanguage")}
				/>
			</SettingsField>
		</SettingsGrid>
	);
}
