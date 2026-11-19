/**
 * Build the live operation-worker composition for the panel.
 *
 * The composition routes `lookupThumbnail` / `generateThumbnail` /
 * `installUpdate` through the production Rust operation worker.
 * Tests can mock this whole module to inject fakes without having to
 * mock every individual helper.
 *
 * Returns `null` if any prerequisite is missing (not in a CEP
 * environment, unsupported platform, missing extension root, runtime
 * construction failure). `useThumbnail` returns `idle` without a
 * provider, so the directory browser falls back to glyph rendering in
 * that case — the panel must still boot.
 */

import {
	getCepPathReaderFromWindow,
	normalizeCepSystemPath,
} from "@/management/ae/cep/runtime";
import { createFilesGatewayFromComposition } from "@/management/ae/files/runtime-gateway-composition-adapter";
import { createLogger } from "@/management/debug/logger";
import {
	compiledOperationWorkerTrustMode,
	type OperationWorkerPlatform,
} from "@/management/ipc/operation-worker/binary";
import {
	createCepOperationWorkerRuntime,
	readCepNodePlatform,
} from "@/management/ipc/operation-worker/cep-runtime";
import {
	createOperationWorkerComposition,
	type OperationWorkerComposition,
	type OperationWorkerLifecycleObserver,
} from "@/management/ipc/operation-worker/composition";
import { createOperationWorkerContextProvider } from "@/management/ipc/operation-worker/context";
import type { WorkerCorrelation } from "@/management/ipc/operation-worker/runner";

declare const __APP_VERSION__: string;

const readPlatformForComposition = (
	win: Window,
): OperationWorkerPlatform | undefined => {
	const platform = readCepNodePlatform(win);
	if (platform === "win32") return "windows";
	if (platform === "darwin") return "macos";
	return undefined;
};

const readExtensionRootForComposition = (win: Window): string | undefined => {
	const raw = getCepPathReaderFromWindow(win)?.getSystemPath?.("extension");
	if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
	const normalized = normalizeCepSystemPath(raw);
	return normalized.trim().length > 0 ? normalized : undefined;
};

const operationWorkerLog = createLogger("operation-worker");

export const createBootLifecycleObserver = (
	log: ReturnType<typeof createLogger>,
): OperationWorkerLifecycleObserver => {
	const correlationOf = (event: {
		correlation?: WorkerCorrelation;
	}): Readonly<Record<string, unknown>> => {
		const correlation = event.correlation;
		if (correlation === undefined) return {};
		return {
			operation: correlation.operation,
			logicalOperationId: correlation.logicalOperationId,
			requestId: correlation.requestId,
			attempt: correlation.attempt,
			sessionId: correlation.sessionId,
			...(correlation.idempotencyKey === undefined
				? {}
				: { idempotencyKey: correlation.idempotencyKey }),
		};
	};

	return (event) => {
		const base = correlationOf(event);
		switch (event.kind) {
			case "spawned":
				log.info("[ty-plus] operation worker: child spawned", {
					action: "worker-spawn",
					context: { ...base, pid: event.pid },
				});
				return;
			case "accepted":
				log.info("[ty-plus] operation worker: handshake accepted", {
					action: "worker-accepted",
					context: { ...base, handshakeRequestId: event.requestId },
				});
				return;
			case "request-sent":
				log.info("[ty-plus] operation worker: request sent", {
					action: "worker-request-sent",
					context: base,
				});
				return;
			case "response":
				log.info("[ty-plus] operation worker: response received", {
					action: "worker-response",
					context: { ...base, status: event.status },
				});
				return;
			case "stdout_eof":
				log.info("[ty-plus] operation worker: stdout EOF", {
					action: "worker-stdout-eof",
					context: base,
				});
				return;
			case "stderr-summary": {
				// Allow-list metadata only (Issue #158 sensitive-log audit):
				// worker stderr is not a wire channel and may carry a path, a
				// URL with a query token, or user-generated data, and this
				// entry is retained and mirrored cross-surface. `bytes` +
				// `truncated` are enough to tell "silent exit" from "noisy
				// exit that we deliberately did not store".
				const context = {
					...base,
					hasOutput: event.bytes > 0,
					bytes: event.bytes,
					truncated: event.truncated,
				};
				if (event.bytes === 0) {
					log.info("[ty-plus] operation worker: stderr empty", {
						action: "worker-stderr",
						context,
					});
					return;
				}
				log.warn("[ty-plus] operation worker: stderr captured", {
					action: "worker-stderr",
					context,
				});
				return;
			}
			case "close":
				log.info("[ty-plus] operation worker: child closed", {
					action: "worker-exit",
					context: { ...base, exitCode: event.exitCode },
				});
				return;
		}
	};
};

export type PanelOperationWorker = Readonly<{
	readonly filesGateway: ReturnType<typeof createFilesGatewayFromComposition>;
	readonly composition: OperationWorkerComposition;
}>;

/**
 * Try to build the live operation worker for the given window.
 *
 * Returns `null` (and logs a warning) when the host environment is
 * missing the prerequisites the Rust worker needs. Returning `null` is
 * the right thing for the panel — `useThumbnail` will keep returning
 * `idle` and `EntryThumb` / `GlyphCachedImage` will fall back to the
 * glyph renderer, which is the documented pre-pipeline behaviour, and
 * the settings UI renders update install as manual-only.
 */
export const tryBuildOperationWorker = (
	win: Window,
): PanelOperationWorker | null => {
	const trustMode = compiledOperationWorkerTrustMode;
	if (trustMode !== "development-unsigned" && trustMode !== "release") {
		return null;
	}
	const platform = readPlatformForComposition(win);
	if (platform === undefined) return null;
	const extensionRoot = readExtensionRootForComposition(win);
	if (extensionRoot === undefined) return null;
	try {
		const runtime = createCepOperationWorkerRuntime(win);
		const composition = createOperationWorkerComposition({
			lifecycleObserver: createBootLifecycleObserver(operationWorkerLog),
			runtime,
			extensionRoot,
			platform,
			expectedProductVersion: __APP_VERSION__,
			expectedExtensionVersion: __APP_VERSION__,
			expectedTrustMode: trustMode,
			hostContextProvider: createOperationWorkerContextProvider(win),
		});
		return {
			filesGateway: createFilesGatewayFromComposition(composition),
			composition,
		};
	} catch (err) {
		console.warn(
			"[ty-plus] operation worker unavailable, falling back to glyph-only rendering:",
			err,
		);
		return null;
	}
};
