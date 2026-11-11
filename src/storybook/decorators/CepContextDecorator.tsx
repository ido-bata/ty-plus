import type { Decorator } from "@storybook/react";

import {
	type CepContextValue,
	CepProvider,
} from "@/management/ae/cep/contexts/Context";

const DEFAULT_CEP_VALUE: CepContextValue = {
	isCep: false,
	hostCode: "AEFT",
	panelSurfaceId: "storybook-panel",
	extensionId: "ty-plus.storybook",
	openerWorkspacePanelId: "panel-1",
};

/**
 * Decorator that supplies a deterministic `CepContextValue`. Stories
 * that need a different value (e.g. `isCep: true`) can wrap their own
 * `<CepProvider>` over the top — child providers win.
 */
export const CepContextDecorator: Decorator = (Story) => (
	<CepProvider value={DEFAULT_CEP_VALUE}>
		<Story />
	</CepProvider>
);
