/**
 * Panel-side responder for the updates surface channel (Issue #243).
 *
 * Only panel surfaces boot the operation-worker composition, so the
 * settings dialog relays `update.install` requests here. Requests are
 * non-idempotent: a panel acts only on envelopes explicitly targeted at
 * its own surface id, which keeps multi-panel setups single-executor.
 */

import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import { createLogger } from "@/management/debug/logger";
import type { UpdateInstallResultDTO } from "@/management/ipc/operation-worker-composition";
import { OperationWorkerAttemptError } from "@/management/ipc/operation-worker-runner";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import {
	SHELL_CHANNELS,
	type SurfaceMessageEnvelope,
	type UpdateInstallWirePayload,
	type UpdateInstallWireRequest,
} from "@/management/workspace/surface/contract";

const log = createLogger("operation-worker");

const panelSurfaceIdOf = (win: Window): string => {
	const id = (win as Window & { __TY_PLUS_PANEL_SURFACE_ID__?: string })
		.__TY_PLUS_PANEL_SURFACE_ID__;
	return typeof id === "string" && id.length > 0 ? id : "panel-1";
};

const isInstallRequest = (
	payload: unknown,
): payload is Extract<
	UpdateInstallWirePayload,
	{ kind: "install-request" }
> => {
	if (typeof payload !== "object" || payload === null) return false;
	const p = payload as Record<string, unknown>;
	if (p.kind !== "install-request") return false;
	if (typeof p.requestId !== "string" || p.requestId.length === 0) return false;
	const req = p.request as Record<string, unknown> | undefined;
	if (typeof req !== "object" || req === null) return false;
	const asset = req.asset as Record<string, unknown> | undefined;
	return (
		typeof req.release_version === "string" &&
		typeof req.tag === "string" &&
		typeof asset === "object" &&
		asset !== null &&
		typeof asset.url === "string" &&
		typeof asset.file_name === "string" &&
		typeof asset.sha256 === "string"
	);
};

/**
 * Subscribe `win`'s surface transport for install requests addressed to this
 * panel. Returns an unsubscribe function; call once per panel boot.
 */
export const installUpdateBusResponder = (
	win: Window,
	execute: (
		request: UpdateInstallWireRequest,
	) => Promise<UpdateInstallResultDTO>,
): (() => void) => {
	const transport = createCepSurfaceTransport(win);
	const surfaceId = panelSurfaceIdOf(win);
	return transport.subscribe((envelope: SurfaceMessageEnvelope) => {
		if (envelope.channel !== SHELL_CHANNELS.updates) return;
		if (envelope.kind !== "request") return;
		// Non-idempotent: only the explicitly targeted panel executes.
		if (envelope.targetSurfaceId !== surfaceId) return;
		if (!isInstallRequest(envelope.payload)) return;
		const payload = envelope.payload;
		if (payload.sourceSurfaceId === surfaceId) return;
		void (async () => {
			try {
				const result = await execute(payload.request);
				await publishShellMessage(transport, {
					channel: SHELL_CHANNELS.updates,
					kind: "response",
					sourceSurfaceId: surfaceId,
					targetSurfaceId: payload.sourceSurfaceId,
					correlationId: envelope.correlationId ?? envelope.messageId,
					payload: {
						kind: "install-result",
						requestId: payload.requestId,
						sourceSurfaceId: surfaceId,
						executorSurfaceId: surfaceId,
						ok: true,
						status: result.status,
						version: result.version,
						restart_required: result.restart_required,
						reason: result.reason ?? null,
					} satisfies UpdateInstallWirePayload,
				});
			} catch (error) {
				log.warn("[ty-plus] update.install relay failed", {
					context: {
						errorName: error instanceof Error ? error.name : "unknown",
						...(error instanceof OperationWorkerAttemptError
							? { errorCode: error.code }
							: {}),
					},
				});
				await publishShellMessage(transport, {
					channel: SHELL_CHANNELS.updates,
					kind: "response",
					sourceSurfaceId: surfaceId,
					targetSurfaceId: payload.sourceSurfaceId,
					correlationId: envelope.correlationId ?? envelope.messageId,
					payload: {
						kind: "install-result",
						requestId: payload.requestId,
						sourceSurfaceId: surfaceId,
						executorSurfaceId: surfaceId,
						ok: false,
						errorCode:
							error instanceof OperationWorkerAttemptError
								? error.code
								: "internal_error",
					} satisfies UpdateInstallWirePayload,
				}).catch(() => {});
			}
		})();
	});
};
