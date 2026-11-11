import type { Decorator } from "@storybook/react";

import type { SurfaceState } from "@/management/workspace/state";
import {
	PanelStateProvider,
	SelectionProvider,
} from "@/management/workspace/state/PanelContext";

const EMPTY_SURFACE_STATE = {} as SurfaceState;

/**
 * Mounts the workspace surface providers with empty defaults. Stories
 * that need a richer state (e.g. preset entries) should wrap their own
 * `<PanelStateProvider state={...}>` inside the story body — child
 * providers override the decorator's value.
 */
export const SurfaceProviderDecorator: Decorator = (Story) => (
	<PanelStateProvider state={EMPTY_SURFACE_STATE}>
		<SelectionProvider selectedSurfaceIndices={[]}>
			<Story />
		</SelectionProvider>
	</PanelStateProvider>
);
