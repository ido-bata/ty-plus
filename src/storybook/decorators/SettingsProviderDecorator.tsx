import type { Decorator } from "@storybook/react";

import { SettingsProvider } from "@/management/setting/context";

/**
 * Mounts `SettingsProvider`. Its `useEffect`-based loader calls
 * `readSettings(window)` which routes through the CEP file API; in
 * Storybook that path throws and the loader logs a console error then
 * falls back to `DEFAULT_SETTINGS`. First render still uses the
 * default state, so stories do not block.
 */
export const SettingsProviderDecorator: Decorator = (Story) => (
	<SettingsProvider>
		<Story />
	</SettingsProvider>
);
