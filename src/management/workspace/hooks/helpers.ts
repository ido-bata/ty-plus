/**
 * Standalone helper functions extracted from hook.ts.
 * Pure functions with no external dependencies on the hook's state.
 */

import { getMessages, writeSharedLogs } from "@/management/debug";
import { toOpenParams } from "@/management/debug/console/open-params";
import {
	filterLogsByClearedAt,
	getClearedAt,
} from "@/management/debug/console/shared-bridge";
import { openCepDialogSurface } from "@/management/ae/cep/transport";

/**
 * Opens the CEP debug console surface.
 *
 * Issue #151 round-4: the `clearedAt` tombstone is the cross-surface
 * Clear boundary. Both `writeSharedLogs` and the dialog open-params
 * payload derive from `getMessages()`, which still holds the
 * in-memory bus buffer — and the bus buffer is wiped synchronously
 * inside `clearLogs()` only AFTER the in-session UI has emptied. If
 * the operator clicks Clear in one surface and immediately opens the
 * Debug Console from another (or the same surface closes + reopens
 * the dialog before the bus subscriber has run), `getMessages()`
 * can still return the pre-Clear rows. We read the tombstone and
 * filter here so the dialog open-params never carry pre-Clear
 * entries; `writeSharedLogs` also applies the filter so the
 * retention write is tombstone-aware end to end.
 */
export const openDebugConsole = (win: Window): void => {
	void getClearedAt(win)
		.then((clearedAt) => {
			const liveMessages = filterLogsByClearedAt(getMessages(), clearedAt);
			return writeSharedLogs(win, liveMessages).then(() => liveMessages);
		})
		.catch(() => getMessages())
		.finally(() => {
			void getClearedAt(win)
				.then((clearedAt) =>
					openCepDialogSurface(win, {
						extensionId: "app.ty-plus.debug-console",
						params: toOpenParams(
							filterLogsByClearedAt(getMessages(), clearedAt),
						),
					}),
				)
				.catch(() => {
					openCepDialogSurface(win, {
						extensionId: "app.ty-plus.debug-console",
						params: toOpenParams(getMessages()),
					});
				});
		});
};

/**
 * Opens a URL in the default browser (CEP or fallback).
 */
export const openUrlInDefaultBrowser = (url: string): void => {
	try {
		const Ctor = (
			window as unknown as {
				CSInterface?: new () => {
					openURLInDefaultBrowser?: (u: string) => void;
				};
			}
		).CSInterface;
		if (Ctor) {
			const cs = new Ctor();
			if (typeof cs.openURLInDefaultBrowser === "function") {
				cs.openURLInDefaultBrowser(url);
				return;
			}
		}
	} catch {
		/* noop */
	}
	try {
		window.open(url, "_blank", "noopener,noreferrer");
	} catch {
		/* noop */
	}
};