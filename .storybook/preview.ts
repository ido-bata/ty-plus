import "../src/management/panel/styles/app.css";
import "../src/storybook/decorators";

import type { Preview } from "@storybook/react";

import {
	CepContextDecorator,
	CepMockDecorator,
	FilesGatewayProviderDecorator,
	I18nDecorator,
	SettingsProviderDecorator,
	SurfaceProviderDecorator,
	ThemeDecorator,
} from "../src/storybook/decorators";
import { applyCepShellTheme } from "../src/management/panel/inject-styles";
import { css } from "../styled-system/css";

if (typeof document !== "undefined") {
	applyCepShellTheme(document);
	document.body.classList.add(
		...css({ backgroundColor: "surface.panel", color: "text.primary" }).split(
			" ",
		),
	);
}

const preview: Preview = {
	decorators: [
		CepMockDecorator,
		CepContextDecorator,
		SettingsProviderDecorator,
			I18nDecorator,
		FilesGatewayProviderDecorator,
		ThemeDecorator,
		SurfaceProviderDecorator,
	],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		backgrounds: {
			default: "panel",
			values: [
				{ name: "panel", value: "#252525" },
				{ name: "widget", value: "#2c2c2c" },
				{ name: "dialog", value: "#1f1f1f" },
			],
		},
	},
};

export default preview;
