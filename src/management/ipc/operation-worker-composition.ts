import { createLogger } from "@/management/debug/logger";
import type {
	CatalogSearchRequestDTO,
	CatalogSearchResultDTO,
	ConnectivityStatusDTO,
	DownloadRequestDTO,
	DownloadResponseDTO,
} from "@/management/online/runtime-gateway";
import {
	type CanonicalMethod,
	canonicalMethods,
	canonicalOperationPolicies,
	type GenerateThumbnailRequest,
	type LookupThumbnailRequest,
	type PluginEffectScanRequest,
	protocolVersion,
	type WireMessage,
} from "./generated";
import type {
	ArtifactTrust,
	OperationWorkerManifest,
	OperationWorkerPlatform,
	ResolvedWorkerBinary,
	ResolveWorkerBinaryInput,
} from "./operation-worker-binary";
import { resolveOperationWorkerBinary } from "./operation-worker-binary";
import type { HostContextProvider } from "./operation-worker-context";
import type {
	ResolveAttemptInput,
	OperationInvocation as WorkerInvocation,
} from "./operation-worker-runner";
import {
	createOperationWorkerRunner,
	type ImmutableHostContext,
	OperationWorkerError,
	type OperationWorkerRunner,
	type WorkerChild,
	type WorkerCorrelation,
	type WorkerLifecycleEvent,
	type WorkerRunOptions,
} from "./operation-worker-runner";
import type { OperationWorkerRuntime } from "./operation-worker-runtime";
import type {
	OperationAttemptIdentity,
	OperationInvocationFactory,
	RunnerFactory,
} from "./operation-worker-scheduler";
import { OperationWorkerScheduler } from "./operation-worker-scheduler";

/** Diagnostic observer applied to every spawned child + lifecycle event. */
export type OperationWorkerLifecycleObserver = (
	event:
		| WorkerLifecycleEvent
		| {
				kind: "binary-resolved";
				binary: ResolvedWorkerBinary;
				correlation?: WorkerCorrelation;
		  }
		| {
				kind: "manifest-resolved";
				manifest: OperationWorkerManifest;
				correlation?: WorkerCorrelation;
		  }
		| {
				kind: "spawn-attempt";
				binaryPath: string;
				correlation?: WorkerCorrelation;
		  },
) => void;

/** Diagnostic observer boundary; observer failures never affect worker execution. */
const notifyOperationWorkerLifecycle = (
	observer: OperationWorkerLifecycleObserver | undefined,
	event: Parameters<OperationWorkerLifecycleObserver>[0],
): void => {
	if (observer === undefined) return;
	try {
		observer(event);
	} catch {
		/* observers are diagnostic-only and cannot alter the worker contract */
	}
};

const operationWorkerCompositionLog = createLogger("operation-worker");

/** Result returned by the worker's host plugin/effect scan route. */
export type HostPluginEffectScanResult = Readonly<{
	readonly rows: readonly Readonly<Record<string, unknown>>[];
	readonly warnings?: readonly string[];
}>;

export type OperationWorkerChildObserver = (
	child: WorkerChild,
	path: string,
	digest: string,
) => void;

/** Diagnostic observer boundary; observer failures never affect worker execution. */
export const notifyOperationWorkerChildCreated = (
	observer: OperationWorkerChildObserver | undefined,
	child: WorkerChild,
	binaryPath: string,
	digest: string,
): void => {
	try {
		observer?.(child, binaryPath, digest);
	} catch {
		/* observers are diagnostic-only and cannot alter the worker contract */
	}
};

export type OperationWorkerCompositionOptions = Readonly<{
	runtime: OperationWorkerRuntime;
	extensionRoot: string;
	platform: OperationWorkerPlatform;
	expectedProductVersion: string;
	expectedExtensionVersion: string;
	expectedTrustMode: ArtifactTrust["mode"];
	hostContextProvider: HostContextProvider;
	onChildCreated?: OperationWorkerChildObserver;
	/**
	 * Composition-level lifecycle observer. Receives every
	 * `WorkerLifecycleEvent` (spawned / accepted / response / stdout_eof /
	 * close), plus composition-internal events (`manifest-resolved`,
	 * `binary-resolved`, `spawn-attempt`). Wired into every `enqueue`
	 * call so spawn PID, exit codes, and stderr are routed to the
	 * canonical logger without per-call plumbing.
	 */
	lifecycleObserver?: OperationWorkerLifecycleObserver;
}>;

export type HostPluginEffectScanOptions = Readonly<{
	readonly run?: WorkerRunOptions;
	readonly managedRoot?: string;
}>;

export type OperationWorkerComposition = Readonly<{
	readonly scanHostPlugins: (
		request: PluginEffectScanRequest,
		options?: HostPluginEffectScanOptions,
	) => Promise<HostPluginEffectScanResult>;
	readonly lookupThumbnail: (
		request: LookupThumbnailRequest,
		options?: HostPluginEffectScanOptions,
	) => Promise<HostThumbnailLookupResult>;
	readonly generateThumbnail: (
		request: GenerateThumbnailRequest,
		options?: HostPluginEffectScanOptions,
	) => Promise<HostThumbnailGenerateResult>;
	readonly lookupCatalog: (
		request: CatalogSearchRequestDTO,
		options?: HostPluginEffectScanOptions,
	) => Promise<CatalogSearchResultDTO>;
	readonly downloadPreset: (
		request: DownloadRequestDTO,
		options?: HostPluginEffectScanOptions,
	) => Promise<DownloadResponseDTO>;
	readonly checkConnectivity: (
		request: undefined,
		options?: HostPluginEffectScanOptions,
	) => Promise<ConnectivityStatusDTO>;
	readonly resolveCurrentBinary: () => Promise<ResolvedWorkerBinary>;
	readonly resolveCurrentManifest: () => Promise<OperationWorkerManifest>;
	readonly stopAccepting: () => void;
	readonly drain: (deadlineMs: number) => Promise<boolean>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Sensitive-log policy for this source (Issue #158): retained structured
 * context carries only allow-listed scalars. A raw `Error.message` can
 * embed an IPC payload, a filesystem path, or a URL with a query token, so
 * only the stable error name and — when the failure came from a classified
 * worker error — its `StableErrorCode` are kept.
 */
const errorContext = (
	error: unknown,
): Readonly<Record<string, string | undefined>> => ({
	errorName: error instanceof Error ? error.name : "unknown",
	...(error instanceof OperationWorkerError ? { errorCode: error.code } : {}),
});

/**
 * Allow-listed `WorkerCorrelation` projection for structured context.
 * Every attempt-level record in this module is built from this, so a
 * field is present on all of them or on none.
 */
const correlationContextOf = (
	correlation: WorkerCorrelation | undefined,
): Readonly<Record<string, unknown>> =>
	correlation === undefined
		? {}
		: {
				operation: correlation.operation,
				logicalOperationId: correlation.logicalOperationId,
				requestId: correlation.requestId,
				attempt: correlation.attempt,
				sessionId: correlation.sessionId,
				...(correlation.idempotencyKey === undefined
					? {}
					: { idempotencyKey: correlation.idempotencyKey }),
			};

const parseManifest = (value: unknown): OperationWorkerManifest => {
	if (!isRecord(value)) throw new Error("operation-worker manifest is invalid");
	return value as unknown as OperationWorkerManifest;
};

const manifestPath = (
	extensionRoot: string,
	runtime: OperationWorkerRuntime,
): string => runtime.path.join(extensionRoot, "worker", "manifest.json");

const readManifest = async (
	extensionRoot: string,
	runtime: OperationWorkerRuntime,
): Promise<OperationWorkerManifest> =>
	parseManifest(
		JSON.parse(
			await runtime.fileSystem.readFile(
				manifestPath(extensionRoot, runtime),
				"utf8",
			),
		),
	);

const managedRootContext = (
	managedRoot: string | undefined,
):
	| "session_default"
	| { readonly explicit_shared: { readonly root: string } } =>
	managedRoot === undefined
		? "session_default"
		: { explicit_shared: { root: managedRoot } };

const hostPluginEffectScanWireName =
	canonicalOperationPolicies.host_plugin_effect_scan.wireName;

const hostThumbnailLookupWireName =
	canonicalOperationPolicies.host_thumbnail_lookup.wireName;
const hostThumbnailGenerateWireName =
	canonicalOperationPolicies.host_thumbnail_generate.wireName;

const onlineCatalogSearchWireName =
	canonicalOperationPolicies.online_catalog_search.wireName;
const onlineConnectivityCheckWireName =
	canonicalOperationPolicies.online_connectivity_check.wireName;
const onlineDownloadWireName =
	canonicalOperationPolicies.online_download.wireName;

const createHostPluginEffectScanFactory = (
	request: PluginEffectScanRequest,
	context: ImmutableHostContext,
	buildId: string,
	capabilities: readonly string[],
	managedRoot: string | undefined,
): OperationInvocationFactory<
	PluginEffectScanRequest,
	HostPluginEffectScanResult
> => ({
	methodName: "host_plugin_effect_scan",
	create: (
		identity: OperationAttemptIdentity,
	): WorkerInvocation<PluginEffectScanRequest, HostPluginEffectScanResult> => ({
		request,
		context: Object.freeze({ ...context, managedRoot }),
		buildId,
		capabilities,
		method: {
			name: hostPluginEffectScanWireName,
			idempotency: "idempotent",
			cancellable: true,
			encode: (payload, encodedContext): WireMessage => ({
				kind: "request",
				message: {
					protocol_version: protocolVersion,
					metadata: {
						request_id: identity.requestId,
						session_id: encodedContext.sessionId,
						deadline_unix_ms: Date.now() + 60_000,
						cancellable: true,
						...(identity.idempotencyKey === undefined
							? {}
							: { idempotency_key: identity.idempotencyKey }),
					},
					context: {
						host_context: {
							app_root: encodedContext.appRoot,
							support_root: encodedContext.supportRoot,
							session_id: encodedContext.sessionId,
						},
						managed_root: managedRootContext(encodedContext.managedRoot),
					},
					method: hostPluginEffectScanWireName,
					payload: { roots: [...payload.roots] },
				},
			}),
			decode: (message): HostPluginEffectScanResult => {
				if (
					message.kind !== "response" ||
					message.message.outcome.status !== "success"
				)
					throw new Error("host plugin scan response is invalid");
				const result = message.message.outcome.payload;
				if (!isRecord(result) || !Array.isArray(result.rows))
					throw new Error("host plugin scan result is invalid");
				return result as unknown as HostPluginEffectScanResult;
			},
		},
	}),
});

/**
 * Validate the wire-shape response payload before handing it back to the
 * panel. The Rust worker can omit `cache_path` / `animated_source_path`
 * (lookup miss); the generated types declare those as optional, so we
 * pass them through unchanged. Any other shape mismatch (e.g. non-string
 * `cache_path` for the generate variant) is rejected.
 */
const decodeThumbnailResponse = <Res>(message: WireMessage): Res => {
	if (
		message.kind !== "response" ||
		message.message.outcome.status !== "success"
	) {
		throw new Error("thumbnail response is invalid");
	}
	const payload = message.message.outcome.payload;
	if (!isRecord(payload)) throw new Error("thumbnail response payload missing");
	return payload as unknown as Res;
};

/**
 * Result type for `host_thumbnail_lookup`. Matches the generated
 * `LookupThumbnailResponse` — `cache_path` and `animated_source_path`
 * are both optional so a cache miss can return an empty object.
 */
type HostThumbnailLookupResult = Readonly<{
	readonly cache_path?: string | null;
	readonly animated_source_path?: string | null;
}>;

/**
 * Result type for `host_thumbnail_generate`. `cache_path` is required
 * by the Rust contract because generation always produces a sidecar
 * file (even if it is later purged); `animated_source_path` is optional
 * and only populated for animated sources (GIF / animated WebP).
 */
type HostThumbnailGenerateResult = Readonly<{
	readonly cache_path: string;
	readonly animated_source_path?: string | null;
}>;

/**
 * Build a factory for either `host_thumbnail_lookup` or
 * `host_thumbnail_generate`. Both share payload shape, idempotency, and
 * cancel policy — only the wire name and response decode differ.
 */
const createThumbnailFactory = <Req, Res>(
	methodName: "host_thumbnail_lookup" | "host_thumbnail_generate",
	wireName: string,
	request: Req,
	context: ImmutableHostContext,
	buildId: string,
	capabilities: readonly string[],
): OperationInvocationFactory<Req, Res> => ({
	methodName,
	create: (identity): WorkerInvocation<Req, Res> => ({
		request,
		context: Object.freeze({ ...context, managedRoot: undefined }),
		buildId,
		capabilities,
		method: {
			name: wireName,
			idempotency: "idempotent",
			cancellable: true,
			encode: (payload, encodedContext): WireMessage => ({
				kind: "request",
				message: {
					protocol_version: protocolVersion,
					metadata: {
						request_id: identity.requestId,
						session_id: encodedContext.sessionId,
						deadline_unix_ms: Date.now() + 60_000,
						cancellable: true,
						...(identity.idempotencyKey === undefined
							? {}
							: { idempotency_key: identity.idempotencyKey }),
					},
					context: {
						host_context: {
							app_root: encodedContext.appRoot,
							support_root: encodedContext.supportRoot,
							session_id: encodedContext.sessionId,
						},
						managed_root: managedRootContext(encodedContext.managedRoot),
					},
					method: wireName,
					payload: {
						source_path: (payload as LookupThumbnailRequest).source_path,
						mtime_ms: (payload as LookupThumbnailRequest).mtime_ms,
						size_bytes: (payload as LookupThumbnailRequest).size_bytes,
						file_type: (payload as LookupThumbnailRequest).file_type,
					},
				},
			}),
			decode: decodeThumbnailResponse<Res>,
		},
	}),
});

/**
 * Build a factory for the online catalog-search, connectivity-check, or
 * download methods. All three share payload-encode rules:
 *
 * - the request body is a plain JSON object matching the wire DTO shape
 *   (snake_case keys as the Rust client expects),
 * - the response payload is a JSON object that the wire contract
 *   already validates; we pass it through unchanged.
 *
 * The `methodName` is the camelCase key into `canonicalMethods` and
 * `canonicalOperationPolicies`; the actual wire name is looked up from
 * the policy table.
 */
const createOnlineFactory = <Req, Res>(
	methodName:
		| "online_catalog_search"
		| "online_connectivity_check"
		| "online_download",
	wireName: string,
	request: Req,
	context: ImmutableHostContext,
	buildId: string,
	capabilities: readonly string[],
): OperationInvocationFactory<Req, Res> => ({
	methodName,
	create: (identity): WorkerInvocation<Req, Res> => ({
		request,
		context: Object.freeze({ ...context, managedRoot: undefined }),
		buildId,
		capabilities,
		method: {
			name: wireName,
			idempotency: "idempotent",
			cancellable: true,
			encode: (payload, encodedContext): WireMessage => ({
				kind: "request",
				message: {
					protocol_version: protocolVersion,
					metadata: {
						request_id: identity.requestId,
						session_id: encodedContext.sessionId,
						deadline_unix_ms: Date.now() + 60_000,
						cancellable: true,
						...(identity.idempotencyKey === undefined
							? {}
							: { idempotency_key: identity.idempotencyKey }),
					},
					context: {
						host_context: {
							app_root: encodedContext.appRoot,
							support_root: encodedContext.supportRoot,
							session_id: encodedContext.sessionId,
						},
						managed_root: managedRootContext(encodedContext.managedRoot),
					},
					method: wireName,
					payload: payload as Record<string, unknown>,
				},
			}),
			decode: (message): Res => {
				if (
					message.kind !== "response" ||
					message.message.outcome.status !== "success"
				) {
					throw new Error(`${methodName} response is invalid`);
				}
				const payload = message.message.outcome.payload;
				if (!isRecord(payload)) {
					throw new Error(`${methodName} response payload missing`);
				}
				return payload as unknown as Res;
			},
		},
	}),
});

export const createOperationWorkerComposition = (
	options: OperationWorkerCompositionOptions,
): OperationWorkerComposition => {
	if (options.expectedTrustMode === undefined)
		throw new TypeError("operation-worker trust mode is required");
	operationWorkerCompositionLog.info(
		"[ty-plus] cloud gateway: composition construction started",
		{
			context: {
				stage: "composition-start",
				platform: options.platform,
				trustMode: options.expectedTrustMode,
				// Install paths are deliberately absent from retained logs
				// (Issue #158 sensitive-log audit); the extension root is
				// still logged once by the boot path that resolved it.
				expectedProductVersion: options.expectedProductVersion,
				expectedExtensionVersion: options.expectedExtensionVersion,
				expectedProtocolVersion: protocolVersion,
				expectedCapabilities: [...canonicalMethods],
			},
		},
	);

	/**
	 * Wrap a caller-supplied `WorkerRunOptions` so the composition-level
	 * lifecycle observer sees every event. Caller-supplied observers still
	 * run (chained); the composition observer runs first so canonical
	 * logger events land before downstream React subscribers.
	 */
	const applyObserver = (
		runOptions: WorkerRunOptions | undefined,
	): WorkerRunOptions | undefined => {
		if (options.lifecycleObserver === undefined) return runOptions;
		const callerObserver = runOptions?.onLifecycle;
		return {
			...runOptions,
			onLifecycle: (event: WorkerLifecycleEvent): void => {
				notifyOperationWorkerLifecycle(options.lifecycleObserver, event);
				callerObserver?.(event);
			},
		};
	};

	/**
	 * Read + validate `worker/manifest.json` (Issue #158).
	 *
	 * The read runs inside `prepareAttempt`, i.e. after the scheduler minted
	 * `logicalOperationId` / `requestId` / `attempt`, so both structured
	 * records — the attempt and the validated result — carry the full
	 * correlation. A burst of per-attempt reads is therefore attributable
	 * instead of looking like duplicated dispatch.
	 *
	 * Manifest reads are **attempt-scoped**, not logical-operation-scoped:
	 * a retry reads again under its own `requestId` / `attempt`. That keeps
	 * `assertResolverInput` comparing against the bytes this attempt
	 * actually read, and matches the per-attempt binary integrity check.
	 * The manifest path and the raw parse error are not persisted: the path
	 * is an install path (retained cross-surface), and the parse error can
	 * embed it. The thrown Error still carries both to the caller.
	 *
	 * `resolveCurrentManifest()` / `resolveCurrentBinary()` call this with
	 * no correlation: they are inspection APIs, not scheduled operations,
	 * and no attempt identity exists for them to inherit.
	 */
	const loadManifest = async (
		correlation?: WorkerCorrelation,
	): Promise<OperationWorkerManifest> => {
		const startedAt = Date.now();
		operationWorkerCompositionLog.info(
			"[ty-plus] operation worker: reading manifest",
			{
				action: "manifest-read",
				context: correlationContextOf(correlation),
			},
		);
		try {
			const manifest = await readManifest(
				options.extensionRoot,
				options.runtime,
			);
			operationWorkerCompositionLog.info(
				"[ty-plus] operation worker: manifest validated",
				{
					action: "manifest-validated",
					context: {
						...correlationContextOf(correlation),
						productVersion: manifest.productVersion,
						extensionVersion: manifest.extensionVersion,
						protocolVersion: manifest.protocolVersion,
						trust: manifest.trust,
						elapsedMs: Date.now() - startedAt,
					},
				},
			);
			notifyOperationWorkerLifecycle(options.lifecycleObserver, {
				kind: "manifest-resolved",
				manifest,
				...(correlation === undefined ? {} : { correlation }),
			});
			return manifest;
		} catch (error) {
			operationWorkerCompositionLog.error(
				"[ty-plus] operation worker: manifest read failed",
				{
					action: "manifest-read",
					context: {
						...correlationContextOf(correlation),
						...errorContext(error),
						elapsedMs: Date.now() - startedAt,
					},
				},
			);
			throw error;
		}
	};

	const resolveInput = async (attempt?: ResolveAttemptInput) => {
		// The caller already resolved this manifest for the attempt, so a
		// second read would only add a window where the file could change
		// between `buildId` and `assertResolverInput`.
		const manifest =
			attempt?.resolvedManifest ?? (await loadManifest(attempt?.correlation));
		return {
			extensionRoot: options.extensionRoot,
			manifest,
			platform: options.platform,
			expectedProductVersion: options.expectedProductVersion,
			expectedExtensionVersion: options.expectedExtensionVersion,
			expectedProtocolVersion: protocolVersion,
			expectedCapabilities: [...canonicalMethods],
			expectedTrustMode: options.expectedTrustMode,
		};
	};
	const resolveBinaryWithLogging = async (
		input: ResolveWorkerBinaryInput,
		correlation?: WorkerCorrelation,
	) => {
		const startedAt = Date.now();
		// Paths stay out of the retained cross-surface log: an extension /
		// install path is a user filesystem location and the resolved
		// absolute path adds nothing the correlation and artifact digest do
		// not already say (Issue #158 sensitive-log audit).
		const context: Readonly<Record<string, unknown>> = {
			platform: options.platform,
			...correlationContextOf(correlation),
		};
		try {
			const binary = await resolveOperationWorkerBinary(input, options.runtime);
			operationWorkerCompositionLog.info(
				"[ty-plus] operation worker: binary resolved",
				{
					action: "binary-resolve",
					context: {
						...context,
						// Content digest of the verified artifact, not a path or a
						// secret: it is what the child re-checks as
						// `TY_PLUS_WORKER_ARTIFACT_SHA256` and what explains
						// "which verified binary actually ran" after an install.
						sha256: binary.sha256,
						trustMode: input.expectedTrustMode,
						signature: binary.signature
							? {
									algorithm: binary.signature.algorithm,
									certificateSha256: binary.signature.certificateSha256,
								}
							: undefined,
						elapsedMs: Date.now() - startedAt,
					},
				},
			);
			notifyOperationWorkerLifecycle(options.lifecycleObserver, {
				kind: "binary-resolved",
				binary,
				...(correlation === undefined ? {} : { correlation }),
			});
			return binary;
		} catch (error) {
			operationWorkerCompositionLog.error(
				"[ty-plus] operation worker: binary resolution failed",
				{
					action: "binary-resolve",
					context: {
						...context,
						...errorContext(error),
						elapsedMs: Date.now() - startedAt,
					},
				},
			);
			throw error;
		}
	};
	const runnerFactory: RunnerFactory = {
		create: (): OperationWorkerRunner =>
			createOperationWorkerRunner({
				extensionRoot: options.extensionRoot,
				platform: options.platform,
				resolveInput,
				resolveBinary: resolveBinaryWithLogging,
				spawnChild: (binaryPath, spawnOptions, correlation) => {
					// Attempt, not outcome: logged BEFORE the child exists so the
					// attempt can be counted even when `spawnChild` throws. The
					// actual child is `worker-spawn` (with `pid`), emitted by the
					// runner one step later — one `worker-spawn-attempt` followed
					// by at most one `worker-spawn` per attempt (Issue #158).
					operationWorkerCompositionLog.info(
						"[ty-plus] operation worker: spawning worker child",
						{
							action: "worker-spawn-attempt",
							context: {
								...correlationContextOf(correlation),
								platform: options.platform,
							},
						},
					);
					notifyOperationWorkerLifecycle(options.lifecycleObserver, {
						kind: "spawn-attempt",
						binaryPath,
						...(correlation === undefined ? {} : { correlation }),
					});
					let child: WorkerChild;
					try {
						child = options.runtime.spawnChild(binaryPath, spawnOptions);
					} catch (error) {
						// No `binaryPath`, `cwd`, or raw message: the retained log
						// takes only allow-listed classification fields.
						operationWorkerCompositionLog.error(
							"[ty-plus] operation worker: spawn failed",
							{
								action: "worker-spawn-failed",
								context: {
									...correlationContextOf(correlation),
									platform: options.platform,
									...errorContext(error),
								},
							},
						);
						throw error;
					}
					notifyOperationWorkerChildCreated(
						options.onChildCreated,
						child,
						binaryPath,
						spawnOptions.env.TY_PLUS_WORKER_ARTIFACT_SHA256,
					);
					return child;
				},
			}),
	};
	const scheduler = new OperationWorkerScheduler(
		runnerFactory,
		4,
		options.runtime.createId,
	);

	/**
	 * Queue one operation with its preflight inside the scheduler's attempt
	 * boundary (Issue #158 follow-up).
	 *
	 * `enqueue()` mints `logicalOperationId` first and the scheduler mints
	 * `requestId` / `attempt` before calling `prepareAttempt`, so the host
	 * context read, the manifest read, and the invocation construction that
	 * follow are attributed to this attempt instead of to an uncorrelated
	 * pre-scheduler window. Nothing mints an id afterwards to decorate a log
	 * that already happened.
	 *
	 * Host context is read first because `sessionId` — a required field of
	 * `WorkerCorrelation` — comes from it; the manifest read then runs under
	 * the complete correlation. Both stay inside one attempt, so the
	 * manifest is read **per attempt**: one read for attempt 1, and one more
	 * for attempt 2 if the single permitted retry fires. Each read carries
	 * its own `requestId` / `attempt`.
	 *
	 * The runner receives the manifest this attempt read as
	 * `resolvedManifest`, so it never re-reads the file for the same attempt
	 * and `assertResolverInput` compares against the bytes that were
	 * actually logged and validated.
	 */
	const enqueueAttempt = <Request, Response>(
		methodName: CanonicalMethod,
		scanOptions: HostPluginEffectScanOptions | undefined,
		buildFactory: (
			context: ImmutableHostContext,
			manifest: OperationWorkerManifest,
		) => OperationInvocationFactory<Request, Response>,
	): Promise<Response> =>
		scheduler.enqueue({
			methodName,
			options: applyObserver(scanOptions?.run),
			prepareAttempt: async (identity, correlation) => {
				const context = await options.hostContextProvider();
				const manifest = await loadManifest(correlation(context.sessionId));
				return {
					invocation: buildFactory(context, manifest).create(identity),
					// Attempt-scoped: the runner validates the binary against this
					// very manifest, so a retry validates against its own read.
					options: { resolvedManifest: manifest },
				};
			},
		});

	return {
		resolveCurrentManifest: loadManifest,
		resolveCurrentBinary: async () => {
			const input = await resolveInput();
			return resolveBinaryWithLogging(input);
		},
		scanHostPlugins: (request, scanOptions) =>
			enqueueAttempt(
				"host_plugin_effect_scan",
				scanOptions,
				(context, manifest) =>
					createHostPluginEffectScanFactory(
						request,
						context,
						manifest.productVersion,
						manifest.capabilities,
						scanOptions?.managedRoot,
					),
			),
		lookupThumbnail: (request, scanOptions) =>
			enqueueAttempt(
				"host_thumbnail_lookup",
				scanOptions,
				(context, manifest) =>
					createThumbnailFactory<
						LookupThumbnailRequest,
						HostThumbnailLookupResult
					>(
						"host_thumbnail_lookup",
						hostThumbnailLookupWireName,
						request,
						context,
						manifest.productVersion,
						manifest.capabilities,
					),
			),
		generateThumbnail: (request, scanOptions) =>
			enqueueAttempt(
				"host_thumbnail_generate",
				scanOptions,
				(context, manifest) =>
					createThumbnailFactory<
						GenerateThumbnailRequest,
						HostThumbnailGenerateResult
					>(
						"host_thumbnail_generate",
						hostThumbnailGenerateWireName,
						request,
						context,
						manifest.productVersion,
						manifest.capabilities,
					),
			),
		lookupCatalog: (request, scanOptions) =>
			enqueueAttempt(
				"online_catalog_search",
				scanOptions,
				(context, manifest) =>
					createOnlineFactory<CatalogSearchRequestDTO, CatalogSearchResultDTO>(
						"online_catalog_search",
						onlineCatalogSearchWireName,
						request,
						context,
						manifest.productVersion,
						manifest.capabilities,
					),
			),
		downloadPreset: (request, scanOptions) =>
			enqueueAttempt("online_download", scanOptions, (context, manifest) =>
				createOnlineFactory<DownloadRequestDTO, DownloadResponseDTO>(
					"online_download",
					onlineDownloadWireName,
					request,
					context,
					manifest.productVersion,
					manifest.capabilities,
				),
			),
		checkConnectivity: (_request, scanOptions) =>
			enqueueAttempt(
				"online_connectivity_check",
				scanOptions,
				(context, manifest) =>
					createOnlineFactory<undefined, ConnectivityStatusDTO>(
						"online_connectivity_check",
						onlineConnectivityCheckWireName,
						undefined,
						context,
						manifest.productVersion,
						manifest.capabilities,
					),
			),
		stopAccepting: () => scheduler.stopAccepting(),
		drain: (deadlineMs) => scheduler.drain(deadlineMs),
	};
};

export const createInjectedHostContextProvider = (
	context: ImmutableHostContext,
): HostContextProvider => {
	const frozen = Object.freeze({ ...context });
	return async () => Object.freeze({ ...frozen });
};
