import type { Decorator } from "@storybook/react";

import { AfterEffectsFilesGatewayProvider } from "@/management/ae/files/gateway-context";

/**
 * Mounts `AfterEffectsFilesGatewayProvider` with `value={null}` so that
 * directory-browser stories fall back to the glyph path (matching the
 * `dev/test` path in `PanelRoot.tsx`). Components that consume
 * `useThumbnail` will see `status: "idle"` and render the default
 * glyph rather than triggering an operation-worker request.
 */
export const FilesGatewayProviderDecorator: Decorator = (Story) => (
	<AfterEffectsFilesGatewayProvider value={null}>
		<Story />
	</AfterEffectsFilesGatewayProvider>
);
