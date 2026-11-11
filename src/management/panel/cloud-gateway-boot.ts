/**
 * Build the live cloud gateway for the panel.
 *
 * The gateway routes the three online methods (`online.connectivity.check`,
 * `online.catalog.search`, `online.download`) through the production Rust
 * operation worker via `OperationWorkerComposition`. Boot can fail in
 * several classified ways (trust-mode mismatch, unsupported platform,
 * missing extension root, worker runtime failure, worker composition
 * failure); each one is propagated to the caller as a `GatewayBootFailure`
 * so the panel can surface a non-empty empty-state copy and the
 * `runtime-gateway-health` store can drive downstream UI.
 *
 * Mirrors `thumbnail-gateway-boot.ts:59-89` exactly: same trust-mode gate,
 * same platform/extension-root resolution, same warn-and-return-false
 * error contract. Tests can mock this whole module to inject a fake gateway
 * without having to mock every individual helper.
 */

import {
	getCepPathReaderFromWindow,
	normalizeCepSystemPath,
} from "@/management/ae/cep/runtime";
import { createLogger } from "@/management/debug/logger";
import type { OperationWorkerPlatform } from "@/management/ipc/operation-worker-binary";
import { compiledOperationWorkerTrustMode } from "@/management/ipc/operation-worker-binary";
import {
	createCepOperationWorkerRuntime,
	readCepNodePlatform,
} from "@/management/ipc/operation-worker-cep-runtime";
import type {
	OperationWorkerComposition,
	OperationWorkerLifecycleObserver,
} from "@/management/ipc/operation-worker-composition";
import { createOperationWorkerComposition } from "@/management/ipc/operation-worker-composition";
import { createOperationWorkerContextProvider } from "@/management/ipc/operation-worker-context";
import {
	OperationWorkerError,
	type WorkerCorrelation,
	type WorkerLifecycleEvent,
} from "@/management/ipc/operation-worker-runner";
import { createCompositionRuntimeDispatcher } from "@/management/online/catalog/composition-runtime-dispatcher";
import { createRuntimeCloudGateway } from "@/management/online/catalog/runtime-cloud-gateway";
import { bindOnlineRuntimeGatewayPort } from "@/management/online/runtime-gateway";
import {
	publishGatewayHealth,
	setHostOnlineStatePublisher,
} from "@/management/online/runtime-gateway-health";
import {
	isBootProbeEnabled,
	readBootProbeFlag,
} from "@/management/panel/boot-feature-flags";
import { runCepEvalScript } from "@/management/storage/cep";
import { initCloudGateway } from "@/management/workspace/services";

declare const __APP_VERSION__: string;

const cloudGatewayLog = createLogger("online-runtime");
const operationWorkerLog = createLogger("operation-worker");

/**
 * Lifecycle observer for every spawned child (Issue #158).
 *
 * Composition-internal events (`manifest-resolved`, `binary-resolved`,
 * `spawn-attempt`) are deliberately NOT handled here: the composition
 * already emits `manifest-read` / `manifest-validated` / `binary-resolve`
 * / `worker-spawn-attempt` with the scheduler correlation, and logging
 * them twice is exactly the duplicate noise this issue set out to remove.
 *
 * What is left is everything only the runner knows about. Each event
 * carries the scheduler correlation when it is available, so
 *
 *   manifest -> binary -> spawn -> request -> response -> exit
 *
 * reads as one trace and four concurrent children are distinguishable as
 * four distinct logical jobs.
 */
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

/**
 * Retained-log projection of a thrown value (Issue #158 sensitive-log
 * audit). A raw `Error.message` can embed an IPC payload or a path, so only
 * the stable name and — for classified worker errors — the stable
 * `StableErrorCode` are persisted. The message still travels on the thrown
 * value itself.
 */
const errorContextOf = (
	error: unknown,
): Readonly<Record<string, string | undefined>> => ({
	errorName: error instanceof Error ? error.name : "unknown",
	...(error instanceof OperationWorkerError ? { errorCode: error.code } : {}),
});

/**
 * Fire a single connectivity probe after successful composition. The probe
 * is best-effort: a probe failure leaves the gateway `live` (composition
 * succeeded) but the user sees an offline-state empty state. Failure
 * events are routed through `online-runtime` source so the Debug Console
 * can attribute them to the connectivity probe rather than boot.
 *
 * Issue #144: a probe rejection now downgrades the gateway health to
 * `degraded` with `worker-runtime-failed` so the user-visible state
 * reflects the probe outcome instead of staying stuck at `live`.
 */
const fireBootConnectivityProbe = (
	composition: OperationWorkerComposition,
	observer: OperationWorkerLifecycleObserver,
): void => {
	cloudGatewayLog.info(
		"[ty-plus] cloud gateway boot: connectivity probe sent",
		{
			context: { stage: "connectivity-probe-sent" },
		},
	);
	void composition
		.checkConnectivity(undefined, {
			run: { onLifecycle: (event: WorkerLifecycleEvent) => observer(event) },
		})
		.then((status) => {
			cloudGatewayLog.info(
				"[ty-plus] cloud gateway boot: connectivity probe result",
				{
					context: {
						stage: "connectivity-probe-result",
						state: status.state,
						label: status.label,
						checkedAt: status.checked_at,
						errorMessage: status.error_message,
					},
				},
			);
		})
		.catch((err) => {
			cloudGatewayLog.error(
				"[ty-plus] cloud gateway boot: connectivity probe failed",
				{
					context: {
						stage: "connectivity-probe-failed",
						...errorContextOf(err),
					},
				},
			);
			publishGatewayHealth({
				state: "degraded",
				failure: {
					reason: "worker-runtime-failed",
					message: "connectivity probe rejection after successful composition",
					cause: err,
				},
			});
		});
};

/**
 * Fire a single empty-query catalog request after successful composition
 * so the Debug Console observes whether the catalog wire path is live.
 *
 * Issue #144: same downgrade behaviour as the connectivity probe — a
 * rejection after a successful composition publishes `degraded` so the
 * empty-state UI can reflect the wire-path failure.
 */
const fireBootCatalogProbe = (
	composition: OperationWorkerComposition,
	observer: OperationWorkerLifecycleObserver,
): void => {
	cloudGatewayLog.info("[ty-plus] cloud gateway boot: catalog probe sent", {
		context: { stage: "catalog-probe-sent" },
	});
	void composition
		.lookupCatalog(
			{},
			{
				run: { onLifecycle: (event: WorkerLifecycleEvent) => observer(event) },
			},
		)
		.then((result) => {
			cloudGatewayLog.info(
				"[ty-plus] cloud gateway boot: catalog probe result",
				{
					context: {
						stage: "catalog-probe-result",
						itemCount: result.items.length,
					},
				},
			);
		})
		.catch((err) => {
			cloudGatewayLog.error(
				"[ty-plus] cloud gateway boot: catalog probe failed",
				{
					context: {
						stage: "catalog-probe-failed",
						...errorContextOf(err),
					},
				},
			);
			publishGatewayHealth({
				state: "degraded",
				failure: {
					reason: "worker-runtime-failed",
					message: "catalog probe rejection after successful composition",
					cause: err,
				},
			});
		});
};

/**
 * Duplicated from `thumbnail-gateway-boot.ts` per CLAUDE.md ("no shims"):
 * the cloud and thumbnail gateways are sibling panels over the same Rust
 * runtime, not a hierarchy. Sharing a helper would re-introduce a
 * `composition-host-helpers` module that is just a bag of helpers.
 */
const readPlatformForComposition = (
	win: Window,
): OperationWorkerPlatform | undefined => {
	const platform = readCepNodePlatform(win);
	if (platform === "win32") return "windows";
	if (platform === "darwin") return "macos";
	return undefined;
};

/**
 * Duplicated from `thumbnail-gateway-boot.ts` per CLAUDE.md ("no shims").
 * Returns `undefined` when the host CEP runtime is unavailable or the
 * extension root path is empty after normalization.
 */
const readExtensionRootForComposition = (win: Window): string | undefined => {
	const raw = getCepPathReaderFromWindow(win)?.getSystemPath?.("extension");
	if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
	const normalized = normalizeCepSystemPath(raw);
	return normalized.trim().length > 0 ? normalized : undefined;
};

/**
 * Classified reason a cloud-gateway boot attempt failed. UI surfaces
 * (`PresetLibraryEmptyState`, the notification center, retained logs)
 * branch on these strings to render non-silent, human-readable error
 * copy. Adding a new branch means adding a new label below and an
 * empty-state sub-line in `PresetLibraryEmptyState`.
 */
export type GatewayBootFailureReason =
	| "unsupported-trust-mode"
	| "unsupported-platform"
	| "missing-extension-root"
	| "worker-runtime-failed"
	| "worker-composition-failed";

/**
 * Classified failure payload. `cause` is the raw thrown value when the
 * failure originated from composition/runtime construction so it can be
 * retained in logs without surfacing to the user.
 */
export type GatewayBootFailure = {
	readonly reason: GatewayBootFailureReason;
	readonly message: string;
	readonly cause?: unknown;
};

export type GatewayBootResult =
	| { readonly kind: "live" }
	| { readonly kind: "degraded"; readonly failure: GatewayBootFailure };

export const isLiveGatewayBootResult = (
	value: GatewayBootResult,
): value is { readonly kind: "live" } => value.kind === "live";

export const isDegradedGatewayBootResult = (
	value: GatewayBootResult,
): value is {
	readonly kind: "degraded";
	readonly failure: GatewayBootFailure;
} => value.kind === "degraded";

/**
 * Round-4 Blocker B — register the publisher that forwards every
 * `publishGatewayHealth` transition to `$.global.tyPlusOnlineState`
 * via the canonical CEP `evalScript` bridge.  The ExtendScript probe
 * `tyPlusProbeOnlineState` (in `host-bundle.ext.ts`) reads that
 * flag, so the probe now sees the same value the production state
 * machine writes.  Failures are swallowed: in Vite preview / tests
 * `evalScript` is unavailable, and the in-memory snapshot still
 * updates correctly.
 */
const registerTyPlusHostOnlineStatePublisher = (win: Window): void => {
	const publisher = (state: "online" | "degraded" | "offline"): void => {
		const script = `$.global.tyPlusOnlineState = "${state}";`;
		runCepEvalScript(win, script).catch(() => {
			// evalScript unavailable (Vite preview, tests, debug build
			// without CEP).  Probe will read undefined and the panel-
			// side `useGatewayHealth` is unaffected.
		});
	};
	setHostOnlineStatePublisher(publisher);
};

/**
 * Human-readable label for each failure reason. Used by the panel
 * boot error log and the `data-gateway-boot-reason` attribute on the
 * preset-library empty state.
 */
export const labelOfGatewayBootFailureReason = (
	reason: GatewayBootFailureReason,
): string => {
	switch (reason) {
		case "unsupported-trust-mode":
			return "Unsupported operation-worker trust mode";
		case "unsupported-platform":
			return "Unsupported host platform";
		case "missing-extension-root":
			return "CEP extension root unavailable";
		case "worker-runtime-failed":
			return "Worker runtime unavailable";
		case "worker-composition-failed":
			return "Worker composition failed";
	}
};

/**
 * Emit the canonical `online.failure` log event. Both `console.warn` (the
 * interceptor in `console/interceptor.ts` retains this) and the
 * `runtime-gateway-health` pub/sub store are updated so React-side
 * surfaces can re-render the empty state.
 */
const reportCloudGatewayFailure = (failure: GatewayBootFailure): void => {
	const label = labelOfGatewayBootFailureReason(failure.reason);
	const payload = {
		source: "cloud-gateway-boot",
		reason: failure.reason,
		label,
		message: failure.message,
	};
	console.warn('[event: "online.failure"]', payload);
	publishGatewayHealth({
		state: "degraded",
		failure: {
			reason: failure.reason,
			message: failure.message,
			...(failure.cause !== undefined ? { cause: failure.cause } : {}),
		},
	});
};

/**
 * Try to build the live cloud gateway for the given window.
 *
 * Returns `{ kind: "live" }` only when every stage (trust mode, platform,
 * extension root, runtime, composition) succeeded. Every other branch
 * returns `{ kind: "degraded", failure }` with a classified reason and
 * publishes to the health store; the caller must surface this to the user
 * rather than silently fall back.
 *
 * On success, calls `initCloudGateway(gateway)` so the workspace
 * singleton swaps to the runtime-backed gateway.
 *
 * Issue #131: `tryBuildCloudGateway` previously fired a connectivity
 * probe and a catalog probe unconditionally right after publishing
 * `state: "live"`. Combined with the startup preset asset scan, those
 * three round-trips flooded the AE host main thread on first paint
 * and froze AE UI on Windows AE 2026. `options.probesEnabled`
 * (defaulting to `isBootProbeEnabled()` from `readBootProbeFlag()`)
 * lets callers suppress the auto-probes without touching the boot
 * path. The release default — env unset — is OFF. Producers can
 * drive the flag from `process.env.TY_PLUS_BOOT_PROBES=on`.
 */
export const tryBuildCloudGateway = (
	win: Window,
	options: { readonly probesEnabled?: boolean } = {},
): GatewayBootResult => {
	const probesEnabled = options.probesEnabled ?? isBootProbeEnabled();

	// Round-4 Blocker B — wire the host-state publisher so the
	// canonical ExtendScript probe `tyPlusProbeOnlineState` reads what
	// `publishGatewayHealth` actually writes.  The publisher uses the
	// existing CEP `evalScript` bridge; in Vite preview / tests where
	// `$.evalScript` is not available the call is silently no-op'd.
	registerTyPlusHostOnlineStatePublisher(win);
	// Issue #129: every stage of cloud-gateway boot emits an explicit
	// event on the canonical bus so the Debug Console can see where the
	// boot stopped on Windows AE 2026, instead of receiving only the
	// final "degraded" failure (which is also reported here, but with
	// the originating stage in the message context).
	cloudGatewayLog.info("[ty-plus] cloud gateway boot started", {
		context: {
			stage: "boot-started",
			trustMode: compiledOperationWorkerTrustMode,
		},
	});

	const trustMode = compiledOperationWorkerTrustMode;
	if (trustMode !== "development-unsigned" && trustMode !== "release") {
		const failure: GatewayBootFailure = {
			reason: "unsupported-trust-mode",
			message: `compiled operation-worker trust mode "${trustMode}" is not supported for live cloud gateway boot`,
		};
		cloudGatewayLog.error(
			"[ty-plus] cloud gateway boot stopped at trust-mode gate",
			{ context: { stage: "trust-mode", trustMode } },
		);
		reportCloudGatewayFailure(failure);
		return { kind: "degraded", failure };
	}
	const platform = readPlatformForComposition(win);
	if (platform === undefined) {
		const failure: GatewayBootFailure = {
			reason: "unsupported-platform",
			message:
				"host platform is not supported (operation-worker binaries exist for Windows and macOS only)",
		};
		cloudGatewayLog.error(
			"[ty-plus] cloud gateway boot stopped at platform gate",
			{
				context: {
					stage: "platform",
					nodePlatform: readCepNodePlatform(win),
				},
			},
		);
		reportCloudGatewayFailure(failure);
		return { kind: "degraded", failure };
	}
	cloudGatewayLog.info("[ty-plus] cloud gateway boot: trust and platform OK", {
		context: { stage: "platform-ok", trustMode, platform },
	});
	const extensionRoot = readExtensionRootForComposition(win);
	if (extensionRoot === undefined) {
		const failure: GatewayBootFailure = {
			reason: "missing-extension-root",
			message:
				"CEP extension root path is empty or unreadable; cannot construct operation-worker composition",
		};
		cloudGatewayLog.error(
			"[ty-plus] cloud gateway boot stopped at extension-root gate",
			{
				context: {
					stage: "extension-root",
					platform,
				},
			},
		);
		reportCloudGatewayFailure(failure);
		return { kind: "degraded", failure };
	}
	cloudGatewayLog.info(
		"[ty-plus] cloud gateway boot: extension root resolved",
		{
			context: {
				stage: "extension-root-ok",
				platform,
				trustMode,
				extensionRoot,
			},
		},
	);
	let runtime: ReturnType<typeof createCepOperationWorkerRuntime>;
	try {
		runtime = createCepOperationWorkerRuntime(win);
		operationWorkerLog.info("operation worker runtime initialized", {
			context: { platform, trustMode },
		});
	} catch (err) {
		const failure: GatewayBootFailure = {
			reason: "worker-runtime-failed",
			message: "createCepOperationWorkerRuntime threw during boot",
			cause: err,
		};
		operationWorkerLog.error(
			"[ty-plus] operation worker runtime construction failed",
			{
				context: {
					stage: "worker-runtime",
					platform,
					trustMode,
					...errorContextOf(err),
				},
			},
		);
		reportCloudGatewayFailure(failure);
		return { kind: "degraded", failure };
	}
	try {
		const lifecycleObserver = createBootLifecycleObserver(operationWorkerLog);
		const composition = createOperationWorkerComposition({
			runtime,
			extensionRoot,
			platform,
			expectedProductVersion: __APP_VERSION__,
			expectedExtensionVersion: __APP_VERSION__,
			expectedTrustMode: trustMode,
			hostContextProvider: createOperationWorkerContextProvider(win),
			lifecycleObserver,
		});
		operationWorkerLog.info(
			"[ty-plus] operation worker composition constructed",
			{
				context: { stage: "worker-composition-ok", platform, trustMode },
			},
		);
		const dispatcher = createCompositionRuntimeDispatcher(composition);
		cloudGatewayLog.info("[ty-plus] cloud gateway boot: dispatcher built", {
			context: { stage: "dispatcher-ok", platform, trustMode },
		});
		const port = bindOnlineRuntimeGatewayPort(dispatcher);
		const gateway = createRuntimeCloudGateway(port);
		initCloudGateway(gateway);
		cloudGatewayLog.info(
			"[ty-plus] cloud gateway: initCloudGateway registered",
			{
				context: {
					stage: "gateway-singleton-swap",
					platform,
					extensionRoot,
					trustMode,
				},
			},
		);
		publishGatewayHealth({ state: "live" });
		if (probesEnabled) {
			cloudGatewayLog.info(
				"[ty-plus] cloud gateway boot: auto-probes enabled",
				{
					context: {
						stage: "auto-probes-enabled",
						flag: readBootProbeFlag(),
					},
				},
			);
			fireBootConnectivityProbe(composition, lifecycleObserver);
			fireBootCatalogProbe(composition, lifecycleObserver);
		} else {
			cloudGatewayLog.warn(
				"[ty-plus] cloud gateway boot: auto-probes suppressed by flag",
				{
					context: {
						stage: "auto-probes-suppressed",
						flag: readBootProbeFlag(),
					},
				},
			);
		}
		return { kind: "live" };
	} catch (err) {
		const failure: GatewayBootFailure = {
			reason: "worker-composition-failed",
			message: "createOperationWorkerComposition threw during boot",
			cause: err,
		};
		operationWorkerLog.error(
			"[ty-plus] operation worker composition construction failed",
			{
				context: {
					stage: "worker-composition",
					platform,
					trustMode,
					...errorContextOf(err),
				},
			},
		);
		cloudGatewayLog.warn("[ty-plus] cloud gateway init failed (degraded)", {
			context: { ...errorContextOf(err), platform, trustMode },
		});
		reportCloudGatewayFailure(failure);
		return { kind: "degraded", failure };
	}
};
