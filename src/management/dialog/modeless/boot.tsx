import { createRoot } from "react-dom/client";

import { PanelRoot } from "@/management/ae/cep/entry/PanelRoot";
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import {
	enableCepBroadcast,
	enableInterceptor,
	flushOnAEPanelClose,
	initializeLogRetention,
} from "@/management/debug/console/interceptor";
import { buildDebugConsoleContextMenu } from "@/management/debug/console/ui/context-menu";
import {
	getCurrentFilterLevel,
	getCurrentMessageCount,
	setLastCtxMessageId,
} from "@/management/debug/console/ui/ctx-state";
import { DebugDialogRoot } from "@/management/debug/console/ui/dialog-root";
import { createLogger } from "@/management/debug/logger";
import {
	installCepJsonContextMenuRewrite,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import { applyCepModelessShellLayoutGuards } from "@/management/dialog/dialogs/layout";
import { ModelessDialogRoot } from "@/management/dialog/modeless/Root";
import {
	readPhysicalExtensionId,
	resolveDialogSurfaceIdForBoot,
} from "@/management/dialog/modeless/surface-id";
import { initializeI18n } from "@/management/i18n";
import {
	bootstrapCepShellThemeHydration,
	installCepShellStyleRecoveryOnResize,
} from "@/management/panel/inject-styles";
import { isPresetAddPoolExtensionId } from "@/management/preset/add-dialog-pool";
import { ToolHost } from "@/management/preset/modeless/ToolHost";
import { resolveOpenerWorkspacePanelId } from "@/management/workspace/surface/opener-panel-id";

const modelessLog = createLogger("modeless");

/** CEP Modeless HTML entry (`modeless/index.html` → `entry/dialog.tsx` shim). */
export async function bootTyPlusModelessDialog(): Promise<void> {
	bootstrapCepShellThemeHydration(window);
	installCepShellStyleRecoveryOnResize(window);
	enableInterceptor();
	enableCepBroadcast(window);
	// Issue #79: wire `panel_before_close` / `panel_destroyed` on the modeless
	// (debug-console) surface so the in-memory log buffer is flushed and the
	// session marker is written before AE destroys the panel.
	flushOnAEPanelClose(window);

	applyCepModelessShellLayoutGuards(window);

	const mount = document.getElementById("app");
	if (!mount) {
		throw new Error("Missing #app mount point");
	}

	const isCep =
		typeof (window as unknown as { __adobe_cep__?: unknown }).__adobe_cep__ !==
			"undefined" ||
		typeof (window as unknown as { CSInterface?: unknown }).CSInterface !==
			"undefined";

	const hostCode = detectCepHostCode();
	const extensionId = readPhysicalExtensionId();
	const isPresetToolPool = isPresetAddPoolExtensionId(extensionId);
	const surfaceId = isPresetToolPool
		? ""
		: await resolveDialogSurfaceIdForBoot();

	if (surfaceId === "debug-console") {
		void initializeLogRetention(window).catch((error) => {
			modelessLog.warn("[debug-console] log retention unavailable", {
				context: { error: String(error) },
			});
		});
		const debugMenuPayload = buildDebugConsoleContextMenu({
			filterLevel: getCurrentFilterLevel(),
			autoScroll: true,
			messageCount: getCurrentMessageCount(),
		});
		installCepJsonContextMenuRewrite(window, surfaceId, debugMenuPayload);
		registerCepJsonContextMenuSurface(surfaceId, {
			buildPayload: (event: MouseEvent) => {
				const el = event.target instanceof Element ? event.target : null;
				const row = el?.closest("[data-debug-msg-id]");
				const msgId = row?.getAttribute("data-debug-msg-id") ?? null;
				setLastCtxMessageId(msgId);
				return buildDebugConsoleContextMenu({
					filterLevel: getCurrentFilterLevel(),
					autoScroll: true,
					messageCount: getCurrentMessageCount(),
				});
			},
			onMenuSelect: (menuId) => {
				const win = window as Window & {
					__tyPlusDebugCtxHandler?: (id: string) => void;
				};
				win.__tyPlusDebugCtxHandler?.(menuId);
			},
		});
		createRoot(mount).render(<DebugDialogRoot surfaceId={surfaceId} />);
		return;
	}

	await initializeI18n(window);

	const contextMenuSurfaceKey =
		isPresetToolPool && extensionId.trim().length > 0 ? extensionId : surfaceId;
	installCepJsonContextMenuRewrite(window, contextMenuSurfaceKey);

	const panelSurfaceId =
		isPresetToolPool && extensionId.trim().length > 0 ? extensionId : surfaceId;
	const openerWorkspacePanelId = resolveOpenerWorkspacePanelId(window);

	createRoot(mount).render(
		<PanelRoot
			value={{
				isCep,
				hostCode,
				panelSurfaceId,
				extensionId,
				openerWorkspacePanelId,
			}}
		>
			{isPresetToolPool ? (
				<ToolHost />
			) : (
				<ModelessDialogRoot surfaceId={surfaceId} />
			)}
		</PanelRoot>,
	);
}
