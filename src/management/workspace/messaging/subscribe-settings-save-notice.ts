import { notificationStore } from "@/management/online/notification/service";
import {
	type SettingsPayload,
	SHELL_CHANNELS,
	type SurfaceMessageEnvelope,
	type SurfaceTransport,
} from "@/management/workspace/surface/contract";

/**
 * Surfaces a settings persistence failure as a persistent error toast on the
 * primary workspace panel (#96).
 *
 * `saveError` only renders inside the settings dialog, so a write that fails
 * after the dialog closed would otherwise be invisible. The SettingsProvider
 * broadcasts a `saveNotice` on the settings channel when a write fails; the
 * primary panel (`panel-1`) is the persistent surface that can still show it.
 * Auxiliary panels skip the toast to avoid duplicates.
 */
export const subscribeSettingsSaveNotices = (
	transport: SurfaceTransport,
	surfaceId: string,
): (() => void) =>
	transport.subscribe((msg: SurfaceMessageEnvelope) => {
		if (msg.channel !== SHELL_CHANNELS.settings) {
			return;
		}
		const pl = msg.payload as SettingsPayload | undefined;
		if (pl?.kind !== "saveNotice" || pl.ok) {
			return;
		}
		if (surfaceId !== "panel-1") {
			return;
		}
		notificationStore.add(pl.message ?? "Failed to save settings.", "error", {
			duration: 0,
		});
	});
