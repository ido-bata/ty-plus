import "@/management/ae/cep/install-unload-guard";
import "@/management/ae/cep/install-drop-guard";
import "@/management/panel/appearance-boot";

import { createRoot } from "react-dom/client";

import { PanelRoot } from "@/management/ae/cep/entry/PanelRoot";
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import {
	enableCepBroadcast,
	enableInterceptor,
} from "@/management/debug/console/interceptor";
import { installGlobalErrorReporting } from "@/management/debug/global-error-reporter";
import { installCepJsonContextMenuRewrite } from "@/management/dialog/dialogs/context-menu";
import { resolveWorkspaceModelessExtensionId } from "@/management/dialog/dialogs/ids";
import { applyCepModelessShellLayoutGuards } from "@/management/dialog/dialogs/layout";
import { ModelessDialogRoot } from "@/management/dialog/modeless/Root";
import { initializeI18n } from "@/management/i18n";
import { ErrorBoundary } from "@/management/panel/ErrorBoundary";
import {
	bootstrapCepShellThemeHydration,
	installCepShellStyleRecoveryOnResize,
} from "@/management/panel/inject-styles";
import { resolveOpenerWorkspacePanelId } from "@/management/workspace/surface/opener-panel-id";

declare global {
	interface Window {
		__TY_PLUS_DIALOG_SURFACE_ID__?: string;
	}
}

async function bootWorkspaceShellDialogs(): Promise<void> {
	bootstrapCepShellThemeHydration(window);
	installCepShellStyleRecoveryOnResize(window);
	enableInterceptor();
	enableCepBroadcast(window);
	// Issue #140: surface dialog crashes (e.g. settings dialog boot failures)
	// into the debug log bus instead of leaving only a CEPHtmlEngine log line.
	installGlobalErrorReporting(window, "modeless");
	await initializeI18n(window);

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
	const surfaceId = window.__TY_PLUS_DIALOG_SURFACE_ID__ ?? "";
	const extensionId = resolveWorkspaceModelessExtensionId(surfaceId);
	const openerWorkspacePanelId = resolveOpenerWorkspacePanelId(window);
	installCepJsonContextMenuRewrite(window, surfaceId);

	createRoot(mount).render(
		<PanelRoot
			value={{
				isCep,
				hostCode,
				panelSurfaceId: surfaceId,
				extensionId,
				openerWorkspacePanelId,
			}}
		>
			<ErrorBoundary name={surfaceId || "modeless"}>
				<ModelessDialogRoot surfaceId={surfaceId} />
			</ErrorBoundary>
		</PanelRoot>,
	);
}

void bootWorkspaceShellDialogs();
