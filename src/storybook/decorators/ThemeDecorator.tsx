import type { Decorator } from "@storybook/react";

import { ThemeProvider } from "@/management/ae/cep/contexts/ThemeContext";

/**
 * Wraps stories in `ThemeProvider`. The provider's storage I/O is
 * handled by `src/management/panel/theme/storage.ts` which calls into
 * the CEP file API; in Storybook those calls will throw, but the
 * provider's `useEffect` swallows them via the catch in
 * `loadSettingsFromStorage`-equivalent paths. Stories that need to
 * read `useTheme()` get an empty `themeOverrides` record and
 * `isDirty: false` — sufficient for visual snapshotting.
 */
export const ThemeDecorator: Decorator = (Story) => (
	<ThemeProvider>
		<Story />
	</ThemeProvider>
);
