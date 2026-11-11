import { type JSX, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { changeLanguage } from "@/management/i18n/index";
import { useSettings } from "@/management/setting/context";
import {
	SettingsField,
	SettingsFieldLabel,
	SettingsGrid,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { ListSelect } from "@/shared/component/fields/ListSelect";

const LOCALES: { value: string; labelKey: string }[] = [
	{ value: "en", labelKey: "settings.languages.english" },
	{ value: "ja", labelKey: "settings.languages.japanese" },
	{ value: "ko", labelKey: "settings.languages.korean" },
	{ value: "zh-CN", labelKey: "settings.languages.chineseSimplified" },
	{ value: "zh-TW", labelKey: "settings.languages.chineseTraditional" },
	{ value: "es", labelKey: "settings.languages.spanish" },
	{ value: "fr", labelKey: "settings.languages.french" },
	{ value: "de", labelKey: "settings.languages.german" },
];

export function LanguageSection(): JSX.Element {
	const { t } = useTranslation("settings");
	const { settings, updateSettings } = useSettings();
	const [localLocale, setLocalLocale] = useState<string>(settings.ui.language);

	const handleLocaleChange = useCallback(
		(locale: string) => {
			setLocalLocale(locale);
			void changeLanguage(
				locale as
					| "en"
					| "ja"
					| "de"
					| "fr"
					| "zh"
					| "es"
					| "ko"
					| "pt"
					| "it"
					| "ru",
			);
			updateSettings({
				ui: { ...settings.ui, language: locale as "en" | "ja" },
			});
		},
		[settings.ui, updateSettings],
	);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<SettingsFieldLabel>Display Language</SettingsFieldLabel>
				<ListSelect
					options={LOCALES.map((l) => ({
						value: l.value,
						label: t(l.labelKey),
					}))}
					value={localLocale}
					onChange={handleLocaleChange}
					placeholder="Select language"
				/>
			</SettingsField>
		</SettingsGrid>
	);
}
