import "@testing-library/jest-dom/vitest";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./src/management/i18n/locales/en/common.json";
import enContextMenu from "./src/management/i18n/locales/en/contextMenu.json";
import enDialogs from "./src/management/i18n/locales/en/dialogs.json";
import enOnboarding from "./src/management/i18n/locales/en/onboarding.json";
import enPresets from "./src/management/i18n/locales/en/presets.json";
import enSettings from "./src/management/i18n/locales/en/settings.json";
import enWidgets from "./src/management/i18n/locales/en/widgets.json";
import enWorkspace from "./src/management/i18n/locales/en/workspace.json";

void i18next.use(initReactI18next).init({
	lng: "en",
	fallbackLng: "en",
	defaultNS: "presets",
	ns: [
		"presets",
		"common",
		"widgets",
		"dialogs",
		"contextMenu",
		"onboarding",
		"settings",
		"workspace",
	],
	resources: {
		en: {
			presets: enPresets,
			common: enCommon,
			widgets: enWidgets,
			dialogs: enDialogs,
			contextMenu: enContextMenu,
			onboarding: enOnboarding,
			settings: enSettings,
			workspace: enWorkspace,
		},
	},
	interpolation: { escapeValue: false },
});

if (
	typeof globalThis.PointerEvent === "undefined" &&
	typeof MouseEvent !== "undefined"
) {
	class PolyfilledPointerEvent extends MouseEvent {}

	Object.defineProperty(globalThis, "PointerEvent", {
		configurable: true,
		writable: true,
		value: PolyfilledPointerEvent,
	});
}

const originalConsoleWarn = console.warn.bind(console);
console.warn = ((...args: Parameters<typeof console.warn>) => {
	if (
		typeof args[0] === "string" &&
		args[0].includes("KaTeX doesn't work in quirks mode")
	) {
		return;
	}
	originalConsoleWarn(...args);
}) as typeof console.warn;

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
	const text =
		typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");

	if (text.includes("KaTeX doesn't work in quirks mode")) {
		return true;
	}

	return Reflect.apply(originalStderrWrite, process.stderr, [chunk, ...args]);
}) as typeof process.stderr.write;
