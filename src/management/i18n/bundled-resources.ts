/**
 * Dynamic imports are not resolved at runtime in CEP's Bun.build single bundle.
 * Bundle translation JSONs with static imports and pass them to i18n.init({ resources }).
 * Regenerate: node scripts/write-i18n-bundled-resources.mjs
 */

import type { Resource } from "i18next";

/**
 * Minimal type for locale JSON content.
 * Settings copy structure used by settings panel.
 */
type LocaleJson = Record<string, unknown>;

import de_contextMenu from "@/management/i18n/locales/de/contextMenu.json";
import de_dialogs from "@/management/i18n/locales/de/dialogs.json";
import de_localeNames from "@/management/i18n/locales/de/locale-names.json";
import de_onboarding from "@/management/i18n/locales/de/onboarding.json";
import de_online from "@/management/i18n/locales/de/online.json";
import de_presets from "@/management/i18n/locales/de/presets.json";
import de_settings from "@/management/i18n/locales/de/settings.json";
import de_widgets from "@/management/i18n/locales/de/widgets.json";
import de_workspace from "@/management/i18n/locales/de/workspace.json";
import en_common from "@/management/i18n/locales/en/common.json";
import en_contextMenu from "@/management/i18n/locales/en/contextMenu.json";
import en_dialogs from "@/management/i18n/locales/en/dialogs.json";
import en_localeNames from "@/management/i18n/locales/en/locale-names.json";
import en_onboarding from "@/management/i18n/locales/en/onboarding.json";
import en_online from "@/management/i18n/locales/en/online.json";
import en_presets from "@/management/i18n/locales/en/presets.json";
import en_settings from "@/management/i18n/locales/en/settings.json";
import en_widgets from "@/management/i18n/locales/en/widgets.json";
import en_workspace from "@/management/i18n/locales/en/workspace.json";
import es_contextMenu from "@/management/i18n/locales/es/contextMenu.json";
import es_dialogs from "@/management/i18n/locales/es/dialogs.json";
import es_localeNames from "@/management/i18n/locales/es/locale-names.json";
import es_onboarding from "@/management/i18n/locales/es/onboarding.json";
import es_online from "@/management/i18n/locales/es/online.json";
import es_presets from "@/management/i18n/locales/es/presets.json";
import es_settings from "@/management/i18n/locales/es/settings.json";
import es_widgets from "@/management/i18n/locales/es/widgets.json";
import es_workspace from "@/management/i18n/locales/es/workspace.json";
import fr_contextMenu from "@/management/i18n/locales/fr/contextMenu.json";
import fr_dialogs from "@/management/i18n/locales/fr/dialogs.json";
import fr_localeNames from "@/management/i18n/locales/fr/locale-names.json";
import fr_onboarding from "@/management/i18n/locales/fr/onboarding.json";
import fr_online from "@/management/i18n/locales/fr/online.json";
import fr_presets from "@/management/i18n/locales/fr/presets.json";
import fr_settings from "@/management/i18n/locales/fr/settings.json";
import fr_widgets from "@/management/i18n/locales/fr/widgets.json";
import fr_workspace from "@/management/i18n/locales/fr/workspace.json";
import it_contextMenu from "@/management/i18n/locales/it/contextMenu.json";
import it_dialogs from "@/management/i18n/locales/it/dialogs.json";
import it_localeNames from "@/management/i18n/locales/it/locale-names.json";
import it_onboarding from "@/management/i18n/locales/it/onboarding.json";
import it_online from "@/management/i18n/locales/it/online.json";
import it_presets from "@/management/i18n/locales/it/presets.json";
import it_settings from "@/management/i18n/locales/it/settings.json";
import it_widgets from "@/management/i18n/locales/it/widgets.json";
import it_workspace from "@/management/i18n/locales/it/workspace.json";
import ja_common from "@/management/i18n/locales/ja/common.json";
import ja_contextMenu from "@/management/i18n/locales/ja/contextMenu.json";
import ja_dialogs from "@/management/i18n/locales/ja/dialogs.json";
import ja_localeNames from "@/management/i18n/locales/ja/locale-names.json";
import ja_onboarding from "@/management/i18n/locales/ja/onboarding.json";
import ja_online from "@/management/i18n/locales/ja/online.json";
import ja_presets from "@/management/i18n/locales/ja/presets.json";
import ja_settings from "@/management/i18n/locales/ja/settings.json";
import ja_widgets from "@/management/i18n/locales/ja/widgets.json";
import ja_workspace from "@/management/i18n/locales/ja/workspace.json";
import ko_contextMenu from "@/management/i18n/locales/ko/contextMenu.json";
import ko_dialogs from "@/management/i18n/locales/ko/dialogs.json";
import ko_localeNames from "@/management/i18n/locales/ko/locale-names.json";
import ko_onboarding from "@/management/i18n/locales/ko/onboarding.json";
import ko_online from "@/management/i18n/locales/ko/online.json";
import ko_presets from "@/management/i18n/locales/ko/presets.json";
import ko_settings from "@/management/i18n/locales/ko/settings.json";
import ko_widgets from "@/management/i18n/locales/ko/widgets.json";
import ko_workspace from "@/management/i18n/locales/ko/workspace.json";
import pt_contextMenu from "@/management/i18n/locales/pt/contextMenu.json";
import pt_dialogs from "@/management/i18n/locales/pt/dialogs.json";
import pt_localeNames from "@/management/i18n/locales/pt/locale-names.json";
import pt_onboarding from "@/management/i18n/locales/pt/onboarding.json";
import pt_online from "@/management/i18n/locales/pt/online.json";
import pt_presets from "@/management/i18n/locales/pt/presets.json";
import pt_settings from "@/management/i18n/locales/pt/settings.json";
import pt_widgets from "@/management/i18n/locales/pt/widgets.json";
import pt_workspace from "@/management/i18n/locales/pt/workspace.json";
import ru_contextMenu from "@/management/i18n/locales/ru/contextMenu.json";
import ru_dialogs from "@/management/i18n/locales/ru/dialogs.json";
import ru_localeNames from "@/management/i18n/locales/ru/locale-names.json";
import ru_onboarding from "@/management/i18n/locales/ru/onboarding.json";
import ru_online from "@/management/i18n/locales/ru/online.json";
import ru_presets from "@/management/i18n/locales/ru/presets.json";
import ru_settings from "@/management/i18n/locales/ru/settings.json";
import ru_widgets from "@/management/i18n/locales/ru/widgets.json";
import ru_workspace from "@/management/i18n/locales/ru/workspace.json";
import zh_contextMenu from "@/management/i18n/locales/zh/contextMenu.json";
import zh_dialogs from "@/management/i18n/locales/zh/dialogs.json";
import zh_localeNames from "@/management/i18n/locales/zh/locale-names.json";
import zh_onboarding from "@/management/i18n/locales/zh/onboarding.json";
import zh_online from "@/management/i18n/locales/zh/online.json";
import zh_presets from "@/management/i18n/locales/zh/presets.json";
import zh_settings from "@/management/i18n/locales/zh/settings.json";
import zh_widgets from "@/management/i18n/locales/zh/widgets.json";
import zh_workspace from "@/management/i18n/locales/zh/workspace.json";

const BUNDLED_SETTINGS: Record<string, LocaleJson> = {
	en: en_settings,
	ja: ja_settings,
	de: de_settings,
	fr: fr_settings,
	es: es_settings,
	it: it_settings,
	ko: ko_settings,
	pt: pt_settings,
	ru: ru_settings,
	zh: zh_settings,
};

/** Locale display names indexed by locale code, for each UI locale */
export const BUNDLED_LOCALE_NAMES: Record<string, Record<string, string>> = {
	en: en_localeNames,
	ja: ja_localeNames,
	de: de_localeNames,
	fr: fr_localeNames,
	es: es_localeNames,
	it: it_localeNames,
	ko: ko_localeNames,
	pt: pt_localeNames,
	ru: ru_localeNames,
	zh: zh_localeNames,
};

export const BUNDLED_I18N_RESOURCES: Resource = {
	en: {
		common: en_common,
		contextMenu: en_contextMenu,
		onboarding: en_onboarding,
		presets: en_presets,
		workspace: en_workspace,
		settings: en_settings,
		widgets: en_widgets,
		dialogs: en_dialogs,
		online: en_online,
	},
	ja: {
		common: ja_common,
		contextMenu: ja_contextMenu,
		onboarding: ja_onboarding,
		presets: ja_presets,
		workspace: ja_workspace,
		settings: ja_settings,
		widgets: ja_widgets,
		dialogs: ja_dialogs,
		online: ja_online,
	},
	de: {
		common: en_common,
		contextMenu: de_contextMenu,
		onboarding: de_onboarding,
		presets: de_presets,
		workspace: de_workspace,
		settings: de_settings,
		widgets: de_widgets,
		dialogs: de_dialogs,
		online: de_online,
	},
	fr: {
		common: en_common,
		contextMenu: fr_contextMenu,
		onboarding: fr_onboarding,
		presets: fr_presets,
		workspace: fr_workspace,
		settings: fr_settings,
		widgets: fr_widgets,
		dialogs: fr_dialogs,
		online: fr_online,
	},
	zh: {
		common: en_common,
		contextMenu: zh_contextMenu,
		onboarding: zh_onboarding,
		presets: zh_presets,
		workspace: zh_workspace,
		settings: zh_settings,
		widgets: zh_widgets,
		dialogs: zh_dialogs,
		online: zh_online,
	},
	es: {
		common: en_common,
		contextMenu: es_contextMenu,
		onboarding: es_onboarding,
		presets: es_presets,
		workspace: es_workspace,
		settings: es_settings,
		widgets: es_widgets,
		dialogs: es_dialogs,
		online: es_online,
	},
	ko: {
		common: en_common,
		contextMenu: ko_contextMenu,
		onboarding: ko_onboarding,
		presets: ko_presets,
		workspace: ko_workspace,
		settings: ko_settings,
		widgets: ko_widgets,
		dialogs: ko_dialogs,
		online: ko_online,
	},
	pt: {
		common: en_common,
		contextMenu: pt_contextMenu,
		onboarding: pt_onboarding,
		presets: pt_presets,
		workspace: pt_workspace,
		settings: pt_settings,
		widgets: pt_widgets,
		dialogs: pt_dialogs,
		online: pt_online,
	},
	it: {
		common: en_common,
		contextMenu: it_contextMenu,
		onboarding: it_onboarding,
		presets: it_presets,
		workspace: it_workspace,
		settings: it_settings,
		widgets: it_widgets,
		dialogs: it_dialogs,
		online: it_online,
	},
	ru: {
		common: en_common,
		contextMenu: ru_contextMenu,
		onboarding: ru_onboarding,
		presets: ru_presets,
		workspace: ru_workspace,
		settings: ru_settings,
		widgets: ru_widgets,
		dialogs: ru_dialogs,
		online: ru_online,
	},
};
