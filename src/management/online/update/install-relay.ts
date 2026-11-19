/**
 * Client side of the updates surface-channel relay (Issue #243).
 *
 * Non-panel surfaces (the settings dialog) cannot reach the operation
 * worker: only panel surfaces boot the worker composition. This helper
 * publishes an `install-request` targeted at the opener panel and awaits
 * the matching `install-result`.
 */

import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import type {
	UpdateInstallRequestDTO,
	UpdateInstallResultDTO,
} from "@/management/ipc/operation-worker-composition";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import {
	SHELL_CHANNELS,
	type SurfaceMessageEnvelope,
	type UpdateInstallWirePayload,
} from "@/management/workspace/surface/contract";
import { resolveOpenerWorkspacePanelId } from "@/management/workspace/surface/opener-panel-id";

export class UpdateInstallRelayError extends Error {
	readonly code: string | undefined;
	constructor(message: string, code?: string) {
		super(message);
		this.name = "UpdateInstallRelayError";
		this.code = code;
	}
}

const ownSurfaceId = (win: Window): string => {
	const w = win as Window & {
		__TY_PLUS_DIALOG_SURFACE_ID__?: string;
		__TY_PLUS_PANEL_SURFACE_ID__?: string;
	};
	return (
		w.__TY_PLUS_DIALOG_SURFACE_ID__ ??
		w.__TY_PLUS_PANEL_SURFACE_ID__ ??
		"ty-plus-surface"
	);
};

const isInstallResult = (
	payload: unknown,
): payload is Extract<UpdateInstallWirePayload, { kind: "install-result" }> => {
	if (typeof payload !== "object" || payload === null) return false;
	const p = payload as Record<string, unknown>;
	return p.kind === "install-result" && typeof p.requestId === "string";
};

const nextRequestId = (): string => {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `upd-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * Ask the opener panel to run `update.install`. Rejects with
 * `UpdateInstallRelayError` on worker failure (`code` carries the stable
 * worker error code) or `UpdateInstallRelayTimeoutError` when no panel
 * answers in time.
 */
export const requestPanelUpdateInstall = async (
	request: UpdateInstallRequestDTO,
	options?: {
		readonly timeoutMs?: number;
		readonly targetPanelId?: string;
		readonly win?: Window;
	},
): Promise<UpdateInstallResultDTO> => {
	const win = options?.win ?? window;
	const transport = createCepSurfaceTransport(win);
	const surfaceId = ownSurfaceId(win);
	const targetPanelId =
		options?.targetPanelId ?? resolveOpenerWorkspacePanelId(win);
	const requestId = nextRequestId();
	const timeoutMs = options?.timeoutMs ?? 180_000;

	return await new Promise<UpdateInstallResultDTO>((resolve, reject) => {
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			fn();
		};
		const unsubscribe = transport.subscribe(
			(envelope: SurfaceMessageEnvelope) => {
				if (envelope.channel !== SHELL_CHANNELS.updates) return;
				if (envelope.kind !== "response") return;
				if (envelope.sourceSurfaceId !== targetPanelId) return;
				if (
					envelope.targetSurfaceId !== undefined &&
					envelope.targetSurfaceId !== surfaceId
				)
					return;
				if (!isInstallResult(envelope.payload)) return;
				const payload = envelope.payload;
				if (payload.requestId !== requestId) return;
				if (payload.ok) {
					finish(() =>
						resolve({
							status: payload.status ?? "manual_required",
							version: payload.version ?? request.release_version,
							restart_required: payload.restart_required ?? true,
							reason: payload.reason ?? null,
						}),
					);
				} else {
					finish(() =>
						reject(
							new UpdateInstallRelayError(
								"panel update.install failed",
								payload.errorCode,
							),
						),
					);
				}
			},
		);
		const timer = setTimeout(() => {
			finish(() =>
				reject(
					new UpdateInstallRelayError(
						"panel did not answer update.install in time",
						"timeout",
					),
				),
			);
		}, timeoutMs);
		void publishShellMessage(transport, {
			channel: SHELL_CHANNELS.updates,
			kind: "request",
			sourceSurfaceId: surfaceId,
			targetSurfaceId: targetPanelId,
			payload: {
				kind: "install-request",
				requestId,
				sourceSurfaceId: surfaceId,
				request,
			} satisfies UpdateInstallWirePayload,
		}).catch((error: unknown) => {
			finish(() =>
				reject(
					new UpdateInstallRelayError(
						`update.install relay publish failed: ${String(error)}`,
					),
				),
			);
		});
	});
};
