import { applyCepShellTheme } from "@/management/panel/inject-styles";
import { subscribeThemeLiveSharedBridge } from "@/management/panel/theme/live-shared-bridge";
import { sanitizeCepShellThemeOverrides } from "@/management/panel/theme/storage";
import {
	mergeThemeOverrideCache,
	setThemeOverrideCache,
} from "@/management/style/theme-overrides-cache";
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
		const overrides = sanitizeCepShellThemeOverrides(pl.overrides);
		// Keep the sync cache in step so boot/resize re-injection does not
		// revert the live-applied overrides (Issue #91). `replace` payloads
		// carry the full persisted set, so the cache is swapped wholesale —
		// a merge would resurrect keys the sender deleted (Issue #94).
		if (pl.replace) {
			setThemeOverrideCache(overrides);
		} else {
			mergeThemeOverrideCache(overrides);
		}
		applyCepShellTheme(targetDoc, {
			themeOverrides: overrides,
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
