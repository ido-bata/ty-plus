import type { JSX, ReactNode } from "react";
import { useEffect } from "react";

import { DebugDialogRoot } from "@/management/debug/console/ui/dialog-root";
import {
	type CepMenuPayload,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import { DeferredDialogBody } from "@/management/dialog/lazy-body";
import { resolveFunctionDialog } from "@/management/dialog/routes";
import { PresetsDialog } from "@/management/preset/catalog-browser/ListDialog";
import { SettingsDialog } from "@/management/setting/dialog/Settings";
import { AddWidgetDialog } from "@/management/widget/add-dialog";

export type RootProps = {
	surfaceId: string;
};

const UNKNOWN_DIALOG_OUTER_STYLE = {
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	height: "100vh",
	padding: "2rem",
	textAlign: "center",
	fontFamily: "sans-serif",
} as const;

const PROBE_DIALOG_OUTER_STYLE = {
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	height: "100vh",
	padding: "2rem",
	textAlign: "center",
	fontFamily: "sans-serif",
} as const;

/** Fallback for unknown or unimplemented dialog surfaces */
function UnknownDialog({ surfaceId }: { surfaceId: string }): JSX.Element {
	useEffect(() => {
		const payload: CepMenuPayload = {
			menu: [
				{
					id: "ty.ctx.unknown-dialog.copy-surface-id",
					label: "Copy surface id",
				},
				{ label: "---" },
				{ id: "ty.ctx.unknown-dialog.close", label: "Close" },
			],
		};
		return registerCepJsonContextMenuSurface(surfaceId, {
			buildPayload: () => payload,
			onMenuSelect: (menuId) => {
				if (menuId === "ty.ctx.unknown-dialog.copy-surface-id") {
					void navigator.clipboard?.writeText?.(surfaceId);
				}
				if (menuId === "ty.ctx.unknown-dialog.close") {
					window.close();
				}
			},
		});
	}, [surfaceId]);

	if (process.env.NODE_ENV !== "production") {
		console.warn(
			`[DialogRoot] No body route for surfaceId: "${surfaceId}" — rendering fallback. Add a case to DialogRoot switch to eliminate this warning.`,
		);
	}
	return (
		<div style={UNKNOWN_DIALOG_OUTER_STYLE}>
			<h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
				Unknown Dialog Surface
			</h1>
			<p style={{ color: "#666" }}>
				No dialog body found for surfaceId:{" "}
				<code style={{ background: "#f0f0f0", padding: "0.125rem 0.375rem" }}>
					{surfaceId}
				</code>
			</p>
		</div>
	);
}

/** Placeholder for probe dialog (not yet implemented) */
function ProbeDialogBody({ surfaceId }: { surfaceId: string }): JSX.Element {
	useEffect(() => {
		return registerCepJsonContextMenuSurface(surfaceId, {
			buildPayload: () => ({
				menu: [
					{ id: "ty.ctx.probe.log-surface", label: "Log surface id" },
					{ id: "ty.ctx.probe.copy-surface", label: "Copy surface id" },
					{ label: "---" },
					{ id: "ty.ctx.probe.close", label: "Close" },
				],
			}),
			onMenuSelect: (menuId) => {
				if (menuId === "ty.ctx.probe.log-surface") {
					console.info("[DialogRoot] probe surface", surfaceId);
				}
				if (menuId === "ty.ctx.probe.copy-surface") {
					void navigator.clipboard?.writeText?.(surfaceId);
				}
				if (menuId === "ty.ctx.probe.close") {
					window.close();
				}
			},
		});
	}, [surfaceId]);

	return (
		<div style={PROBE_DIALOG_OUTER_STYLE}>
			<h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Probe</h1>
			<p style={{ color: "#666" }}>
				Probe dialog for surfaceId:{" "}
				<code style={{ background: "#f0f0f0", padding: "0.125rem 0.375rem" }}>
					{surfaceId}
				</code>
			</p>
		</div>
	);
}

/**
 * Routes to the appropriate dialog body based on surfaceId.
 *
 * Surface routing:
 * - "dialog-presets" → PresetsDialog
 * - "dialog-preset-library" → management/online/catalog (via `routes`)
 * - "dialog-messages" → management/online/notification (via `routes`)
 * - "dialog-settings" → SettingsDialog
 * - "dialog-probe" → ProbeDialogBody (placeholder)
 * - "dialog-widget-selector" → AddWidgetDialog (management/widget)
 * - Unknown → UnknownDialog (visible error fallback)
 */
export function Root({ surfaceId }: RootProps): ReactNode {
	console.log("[DialogRoot] surfaceId:", surfaceId);
	switch (surfaceId) {
		case "debug-console":
			return <DebugDialogRoot surfaceId={surfaceId} />;
		case "dialog-presets":
			return <DeferredDialogBody body={() => <PresetsDialog />} />;
		case "dialog-settings":
			return <DeferredDialogBody body={() => <SettingsDialog />} />;
		case "dialog-widget-selector":
			return <DeferredDialogBody body={() => <AddWidgetDialog />} />;
		case "dialog-probe":
			return <ProbeDialogBody surfaceId={surfaceId} />;
		default: {
			// Surfaces registered in `routes.tsx` (preset / notification / import flows)
			const fnDialog = resolveFunctionDialog(surfaceId);
			if (fnDialog) {
				return fnDialog();
			}
			return <UnknownDialog surfaceId={surfaceId} />;
		}
	}
}

export type DialogRootProps = RootProps;
export const DialogRoot = Root;
