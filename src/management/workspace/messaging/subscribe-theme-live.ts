import { applyCepShellTheme } from "@/management/panel/inject-styles";
import { subscribeThemeLiveSharedBridge } from "@/management/panel/theme/live-shared-bridge";
import { sanitizeCepShellThemeOverrides } from "@/management/panel/theme/storage";
import type {
	SettingsPayload,
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

/**
 * Subscribes to Settings `themeLive` and immediately updates other surfaces' `:root`.
 * (Same-document edits are excluded from the sender)
 *
 * In AE, APPLICATION events from modeless may not reach other panels,
 * so also uses `subscribeThemeLiveSharedBridge` (only on first load, visibility, window focus - no polling).
 */
export const subscribeThemeLive = (
	transport: SurfaceTransport,
	surfaceId: string,
	targetDoc: Document = document,
): (() => void) => {
	const unsubTransport = transport.subscribe((msg: SurfaceMessageEnvelope) => {
		if (msg.channel !== SHELL_CHANNELS.settings) {
			return;
		}
		const pl = msg.payload as SettingsPayload | undefined;
		if (pl?.kind !== "themeLive") {
			return;
		}
		if (pl.sourceSurfaceId === surfaceId) {
			return;
		}
		applyCepShellTheme(targetDoc, {
			themeOverrides: sanitizeCepShellThemeOverrides(pl.overrides),
		});
	});

	const win = targetDoc.defaultView;
	const unsubBridge =
		win !== null
			? subscribeThemeLiveSharedBridge(win, surfaceId, targetDoc)
			: () => {};

	return () => {
		unsubTransport();
		unsubBridge();
	};
};
