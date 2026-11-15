import { gridSettingsFromThemeOverrides } from "@/management/workspace/grid-settings";
import type { GridSettings } from "@/management/workspace/layout/grid-document";
import type {
	SettingsPayload,
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

/**
 * Grid metrics the Settings dialog falls back to
 * (`metricsFromSettingsGrid` in `setting/dialog/grid-theme-sync.ts`).
 * Duplicated here because the workspace layer must not import the
 * settings dialog module.
 */
const DEFAULT_GRID_SETTINGS: GridSettings = {
	cellSize: 48,
	gap: 4,
	radius: 2,
};

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
		// A `replace: true` payload is the complete persisted override set:
		// grid tokens absent from it mean the saved grid returned to the
		// dialog defaults, so receivers must converge to defaults instead of
		// keeping stale custom metrics. Partial payloads (no `replace`)
		// still require all three tokens.
		const grid =
			gridSettingsFromThemeOverrides(payload.overrides) ??
			(payload.replace === true ? DEFAULT_GRID_SETTINGS : null);
		if (grid) {
			onGrid(grid);
		}
	});
