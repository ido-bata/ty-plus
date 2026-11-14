import { gridSettingsFromThemeOverrides } from "@/management/workspace/grid-settings";
import type { GridSettings } from "@/management/workspace/layout/grid-document";
import type {
	SettingsPayload,
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

/**
 * Subscribes to Settings `themeLive` broadcasts and reports grid metric
 * changes so every workspace panel keeps `state.grid` in step with the
 * Settings dialog (Issue #95). The grid tokens ride the existing
 * `themeLive` payload published by `applyGridMetricsLive`; senders are
 * excluded so a panel does not echo its own commit back into state.
 */
export const subscribeWorkspaceGridLive = (
	transport: SurfaceTransport,
	surfaceId: string,
	onGrid: (grid: GridSettings) => void,
): (() => void) =>
	transport.subscribe((msg: SurfaceMessageEnvelope) => {
		if (msg.channel !== SHELL_CHANNELS.settings) {
			return;
		}
		const payload = msg.payload as SettingsPayload | undefined;
		if (payload?.kind !== "themeLive") {
			return;
		}
		if (payload.sourceSurfaceId === surfaceId) {
			return;
		}
		const grid = gridSettingsFromThemeOverrides(payload.overrides);
		if (grid) {
			onGrid(grid);
		}
	});
