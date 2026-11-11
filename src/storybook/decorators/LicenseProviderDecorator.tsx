import type { Decorator } from "@storybook/react";

import { LicenseProvider } from "@/management/online/licensing/LicenseContext";

/**
 * Mounts `LicenseProvider`. The underlying license gateway stores
 * state in `localStorage` by default (no CEP file API dependency), so
 * stories see a `createDefaultInfo(...)` baseline. The provider's
 * `activateLicense` / `deactivateLicense` paths are not exercised in
 * stories by default.
 */
export const LicenseProviderDecorator: Decorator = (Story) => (
	<LicenseProvider>
		<Story />
	</LicenseProvider>
);
