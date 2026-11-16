import "../src/management/panel/styles/app.css";
import "../src/storybook/decorators";

import type { Preview } from "@storybook/react";
import { applyCepShellTheme } from "../src/management/panel/inject-styles";
import {
	CepContextDecorator,
	CepMockDecorator,
	FilesGatewayProviderDecorator,
	I18nDecorator,
	SettingsProviderDecorator,
	SurfaceProviderDecorator,
	ThemeDecorator,
} from "../src/storybook/decorators";
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
		// Pin the story viewport for the Vitest capture pipeline
		// (docs/architecture/ui-reconstruction/storybook.md requirement 4).
		// `@storybook/addon-vitest` calls `page.viewport()` per story from
		// `parameters.viewport.defaultViewport` + `options`; without this
		// every story renders at the addon's 1200x900 default and the
		// tester-iframe scale makes PNG dimensions window-dependent.
		// Keep `capture` in sync with CAPTURE_VIEWPORT in
		// scripts/verify/storybook-screenshot-capture.ts and the provider
		// `contextOptions.viewport` in vitest.config.ts.
		viewport: {
			options: {
				capture: {
					name: "Capture (1280x720)",
					styles: { width: "1280px", height: "720px" },
					type: "desktop",
				},
			},
			defaultViewport: "capture",
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
