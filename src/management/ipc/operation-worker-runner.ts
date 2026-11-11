import {
	type CanonicalOperationPolicy,
	canonicalMethods,
	canonicalOperationPolicies,
	isWireMessage,
	type ProtocolVersion,
	protocolVersion,
	type StableErrorCode,
	type WireMessage,
} from "./generated";
import {
	type OperationWorkerManifest,
	type OperationWorkerPlatform,
	type ResolvedWorkerBinary,
	type ResolveWorkerBinaryInput,
	WorkerBinaryError,
} from "./operation-worker-binary";
import {
	encodeOperationWorkerFrame,
	OperationWorkerFrameDecoder,
} from "./operation-worker-frame";

export type ImmutableHostContext = Readonly<{
	appRoot: string;
	supportRoot: string;
	sessionId: string;
	managedRoot?: string;
}>;

export interface OperationMethod<Request, Response> {
	readonly name: string;
	readonly idempotency: "idempotent" | "non-idempotent";
	readonly cancellable: boolean;
	readonly encode: (
		payload: Request,
		context: ImmutableHostContext,
	) => WireMessage;
	readonly decode: (message: WireMessage) => Response;
}

/**
 * Correlation that follows one queued job from the scheduler through
 * manifest resolution, binary resolution, spawn, and every child event
 * (Issue #158).
 *
 * The four IDs answer different questions and must not be collapsed:
 *
 * - `logicalOperationId` — stable for the whole queued scheduler job,
 *   including every retry. Answers "is this the same scheduler job?" It
 *   is NOT a user-intent id: no id is minted above `enqueue()`, so one
 *   user action that enqueues twice yields two of them (Issue #158).
 * - `requestId` — unique per transport/worker attempt. Answers "is this
 *   the same child?"
 * - `attempt` — 1-based attempt number inside the scheduler job.
 * - `idempotencyKey` — the wire contract's key; present only for
 *   methods whose policy allows one. It reuses the logical job id rather
 *   than minting a second one.
 *
 * `sessionId` comes from the invocation's immutable host context and is
 * what ties a run to a particular AE host session.
 */
export type WorkerCorrelation = Readonly<{
	readonly logicalOperationId: string;
	readonly requestId: string;
	readonly attempt: number;
	readonly operation: string;
	readonly sessionId: string;
	readonly idempotencyKey?: string;
}>;

export interface WorkerRunOptions {
	readonly signal?: AbortSignal;
	readonly onProgress?: (event: WorkerProgress) => void;
	readonly onLifecycle?: (event: WorkerLifecycleEvent) => void;
	readonly cancelPolicy?: CancelPolicy;
	/**
	 * Set by the scheduler for every attempt. Attached to each lifecycle
	 * event so `manifest -> binary -> spawn -> request -> response ->
	 * close` reads as one trace (Issue #158).
	 */
	readonly correlation?: WorkerCorrelation;
	/**
	 * Manifest the caller already resolved for this attempt. Passing it
	 * through keeps `assertResolverInput` from comparing against a second
	 * read of a file that could have changed in between, and halves the
	 * per-attempt manifest reads (Issue #158).
	 */
	readonly resolvedManifest?: OperationWorkerManifest;
}

type WithCorrelation<T> = T & { readonly correlation?: WorkerCorrelation };

export type WorkerLifecycleEvent =
	| WithCorrelation<Readonly<{ kind: "spawned"; pid?: number }>>
	| WithCorrelation<
			Readonly<{ kind: "accepted"; requestId: string; sessionId: string }>
	  >
	| WithCorrelation<Readonly<{ kind: "request-sent" }>>
	| WithCorrelation<
			Readonly<{ kind: "response"; status: "success" | "failure" }>
	  >
	| WithCorrelation<Readonly<{ kind: "stdout_eof" }>>
	| WithCorrelation<
			/**
			 * Counts only. Raw stderr can contain a path, a URL with a query
			 * token, or user-generated data, and this event is mirrored into
			 * the retained cross-surface log — so the bytes never leave the
			 * runner. The raw text is still used to build the redacted
			 * diagnostic on a thrown `OperationWorkerError`.
			 */
			Readonly<{ kind: "stderr-summary"; bytes: number; truncated: boolean }>
	  >
	| WithCorrelation<Readonly<{ kind: "close"; exitCode: number | null }>>;

export interface CancelPolicy {
	readonly graceMs: number;
	readonly forceErrorCode: "worker_forced_termination";
}

export interface WorkerProgress {
	readonly sequence: number;
	readonly stage: string;
	readonly payload: WireMessage;
}

export interface OperationInvocation<Request, Response = unknown> {
	readonly request: Request;
	readonly method: OperationMethod<Request, Response>;
	readonly context: ImmutableHostContext;
	readonly buildId: string;
	readonly capabilities: readonly string[];
}

export interface OperationWorkerRunner {
	invoke<Request, Response>(
		invocation: OperationInvocation<Request, Response>,
		options?: WorkerRunOptions,
	): Promise<Response>;
	stopAccepting(): void;
	drain(deadlineMs: number): Promise<boolean>;
}

export interface WorkerStream {
	on(
		event: "data" | "end" | "error",
		listener: (...args: unknown[]) => void,
	): unknown;
	removeListener(
		event: "data" | "end" | "error",
		listener: (...args: unknown[]) => void,
	): unknown;
}

export interface WorkerChild {
	readonly pid?: number;
	readonly stdin: {
		write(chunk: Uint8Array): boolean;
		end(): void;
		on(event: "error", listener: (...args: unknown[]) => void): unknown;
		removeListener(
			event: "error",
			listener: (...args: unknown[]) => void,
		): unknown;
	};
	readonly stdout: WorkerStream;
	readonly stderr: WorkerStream;
	on(event: "error" | "close", listener: (...args: unknown[]) => void): unknown;
	removeListener(
		event: "error" | "close",
		listener: (...args: unknown[]) => void,
	): unknown;
	kill(signal?: NodeJS.Signals): boolean;
}

export interface WorkerSpawnOptions {
	readonly shell: false;
	readonly windowsHide: boolean;
	readonly cwd: string;
	readonly stdio: ["pipe", "pipe", "pipe"];
	readonly env: Readonly<Record<"TY_PLUS_WORKER_ARTIFACT_SHA256", string>>;
}

/** Optional inputs a run passes down to the composition resolvers. */
export interface ResolveAttemptInput {
	readonly correlation?: WorkerCorrelation;
	readonly resolvedManifest?: OperationWorkerManifest;
}

export interface RunnerConstruction {
	readonly resolveBinary: (
		input: ResolveWorkerBinaryInput,
		correlation?: WorkerCorrelation,
	) => Promise<ResolvedWorkerBinary>;
	readonly resolveInput: (
		attempt?: ResolveAttemptInput,
	) => Promise<ResolveWorkerBinaryInput>;
	readonly spawnChild: (
		path: string,
		options: WorkerSpawnOptions,
		correlation?: WorkerCorrelation,
	) => WorkerChild;
	readonly platform: OperationWorkerPlatform;
	readonly extensionRoot: string;
	readonly cancelPolicy?: CancelPolicy;
}

export type OperationWorkerErrorCode = StableErrorCode;

export class OperationWorkerError extends Error {
	readonly code: OperationWorkerErrorCode;
	readonly diagnostic?: string;
	readonly diagnosticId?: string;

	constructor(
		code: OperationWorkerErrorCode,
		diagnostic?: string,
		diagnosticId?: string,
	) {
		super(diagnostic === undefined ? code : `${code}: ${diagnostic}`);
		this.name = "OperationWorkerError";
		this.code = code;
		this.diagnostic = diagnostic;
		this.diagnosticId = diagnosticId;
	}
}

export interface WorkerAttemptMetadata {
	readonly accepted: boolean;
	readonly commitObserved: boolean;
	readonly retryEligible: boolean;
}

export class OperationWorkerAttemptError extends OperationWorkerError {
	readonly attempt: WorkerAttemptMetadata;

	constructor(
		code: OperationWorkerErrorCode,
		diagnostic: string | undefined,
		attempt: WorkerAttemptMetadata,
		diagnosticId?: string,
	) {
		super(code, diagnostic, diagnosticId);
		this.name = "OperationWorkerAttemptError";
		this.attempt = Object.freeze({ ...attempt });
	}
}

const MAX_STDERR_BYTES = 4096;
const MAX_DIAGNOSTIC_BYTES = 1024;
const safeEnvironment = (
	sha256: string,
): Readonly<Record<"TY_PLUS_WORKER_ARTIFACT_SHA256", string>> => ({
	TY_PLUS_WORKER_ARTIFACT_SHA256: sha256,
});

const isSameProtocolVersion = (
	left: ProtocolVersion,
	right: ProtocolVersion,
): boolean => left.major === right.major && left.minor === right.minor;

const truncateUtf8 = (value: string, maxBytes: number): string => {
	const encoded = new TextEncoder().encode(value);
	const decoder = new TextDecoder("utf-8", { fatal: true });
	for (let end = Math.min(encoded.byteLength, maxBytes); end >= 0; end -= 1) {
		try {
			return decoder.decode(encoded.subarray(0, end));
		} catch {
			/* retry at the preceding UTF-8 boundary */
		}
	}
	return "";
};

const redactedDiagnostic = (value: string): string => {
	const redacted = value
		.replace(
			/(?:token|secret|password|authorization|bearer)\s*[=:]\s*[^\s]+/giu,
			"[redacted]",
		)
		.replace(/[A-Za-z]:[\\/][^\s]+/gu, "[path]")
		.replace(/\/(?:Users|home|private|var)\/[^\s]+/gu, "[path]");
	return truncateUtf8(redacted, MAX_DIAGNOSTIC_BYTES);
};

const crash = (diagnostic?: string): OperationWorkerError =>
	new OperationWorkerError(
		"worker_crashed",
		diagnostic === undefined ? undefined : redactedDiagnostic(diagnostic),
	);

const violation = (diagnostic: string): OperationWorkerError =>
	new OperationWorkerError(
		"protocol_violation",
		redactedDiagnostic(diagnostic),
	);

const toBytes = (chunk: unknown): Uint8Array => {
	if (chunk instanceof Uint8Array) return chunk;
	if (typeof chunk === "string") return new TextEncoder().encode(chunk);
	throw violation("worker stream emitted a non-byte chunk");
};

type WorkerRequest = Extract<WireMessage, { readonly kind: "request" }>;

interface PreparedRequest {
	readonly message: WorkerRequest;
	readonly frame: Uint8Array;
	readonly policy: CanonicalOperationPolicy;
}

const hasExpectedManagedRoot = (
	actual: WorkerRequest["message"]["context"]["managed_root"],
	expected: string | undefined,
): boolean => {
	if (expected === undefined) return actual === "session_default";
	return (
		typeof actual === "object" &&
		actual !== null &&
		actual.explicit_shared.root === expected
	);
};

const policyForWireMethod = (
	wireMethodName: string,
): CanonicalOperationPolicy | undefined => {
	let match: CanonicalOperationPolicy | undefined;
	for (const methodName of canonicalMethods) {
		const policy = canonicalOperationPolicies[methodName];
		if (policy.wireName !== wireMethodName) continue;
		if (match !== undefined) return undefined;
		match = policy;
	}
	return match;
};

const prepareRequest = <Request, Response>(
	invocation: OperationInvocation<Request, Response>,
): PreparedRequest => {
	const request = invocation.method.encode(
		invocation.request,
		invocation.context,
	);
	if (!isWireMessage(request) || request.kind !== "request")
		throw violation("operation method did not encode a request");
	if (
		request.message.method !== invocation.method.name ||
		request.message.metadata.cancellable !== invocation.method.cancellable ||
		request.message.metadata.session_id !== invocation.context.sessionId ||
		!isSameProtocolVersion(request.message.protocol_version, protocolVersion) ||
		request.message.context.host_context.app_root !==
			invocation.context.appRoot ||
		request.message.context.host_context.support_root !==
			invocation.context.supportRoot ||
		request.message.context.host_context.session_id !==
			invocation.context.sessionId ||
		!hasExpectedManagedRoot(
			request.message.context.managed_root,
			invocation.context.managedRoot,
		)
	) {
		throw violation("operation request metadata mismatch");
	}
	try {
		const generatedPolicy = policyForWireMethod(request.message.method);
		if (generatedPolicy === undefined)
			throw violation("operation method policy missing");
		return {
			message: request,
			frame: encodeOperationWorkerFrame(request),
			policy: generatedPolicy,
		};
	} catch {
		throw violation("operation request frame rejected");
	}
};

const sortedCapabilities = (values: readonly string[]): readonly string[] =>
	[...values].sort((left, right) => left.localeCompare(right));

const hasSameCapabilities = (
	left: readonly string[],
	right: readonly string[],
): boolean => {
	const sortedLeft = sortedCapabilities(left);
	const sortedRight = sortedCapabilities(right);
	return (
		sortedLeft.length === sortedRight.length &&
		sortedLeft.every((value, index) => value === sortedRight[index])
	);
};

const assertResolverInput = (
	construction: RunnerConstruction,
	invocation: OperationInvocation<unknown, unknown>,
	input: ResolveWorkerBinaryInput,
): void => {
	if (
		input.extensionRoot !== construction.extensionRoot ||
		input.platform !== construction.platform ||
		input.expectedProductVersion !== invocation.buildId ||
		input.expectedExtensionVersion !== invocation.buildId ||
		!isSameProtocolVersion(input.expectedProtocolVersion, protocolVersion) ||
		!hasSameCapabilities(input.expectedCapabilities, invocation.capabilities)
	) {
		throw new WorkerBinaryError("binary_manifest_mismatch");
	}
};

const runChild = async <Response>(
	child: WorkerChild,
	invocation: OperationInvocation<unknown, Response>,
	preparedRequest: PreparedRequest,
	options: WorkerRunOptions | undefined,
	platform: OperationWorkerPlatform,
	defaultCancelPolicy: CancelPolicy,
): Promise<Response> => {
	const decoder = new OperationWorkerFrameDecoder();
	const request = preparedRequest.message;
	const requestId = request.message.metadata.request_id;
	const sessionId = request.message.metadata.session_id;
	let accepted = false;
	let finalMessage: WireMessage | undefined;
	let progressSequence = -1;
	const stderrChunks: Uint8Array[] = [];
	let stderrBytes = 0;
	let stdoutEnded = false;
	let closeSeen = false;
	let closeCode: number | null | undefined;
	let settled = false;
	let terminalError: OperationWorkerError | undefined;
	let killRequested = false;
	let cancelSent = false;
	let cancellationRequested = false;
	let commitObserved = false;
	let graceTimer: ReturnType<typeof setTimeout> | undefined;
	let requestWriteCompleted = false;
	let pendingAbort = false;
	const observe = (event: WorkerLifecycleEvent): void => {
		// Issue #158: every child event carries the scheduler's correlation
		// so `manifest -> binary -> spawn -> request -> response -> close`
		// reads as one trace. Observation never alters the contract.
		const correlated: WorkerLifecycleEvent =
			options?.correlation === undefined
				? event
				: { ...event, correlation: options.correlation };
		try {
			options?.onLifecycle?.(correlated);
		} catch {
			/* observation is diagnostic-only and cannot alter the worker contract */
		}
	};

	const listeners: Array<() => void> = [];
	const listen = <T extends (...args: unknown[]) => void>(
		target: {
			on(event: string, listener: T): unknown;
			removeListener(event: string, listener: T): unknown;
		},
		event: string,
		listener: T,
	): void => {
		target.on(event, listener);
		listeners.push(() => target.removeListener(event, listener));
	};
	const cleanup = (): void => {
		for (const remove of listeners.splice(0)) remove();
	};
	const stderrDiagnostic = (): string =>
		new TextDecoder().decode(
			Uint8Array.from(stderrChunks.flatMap((chunk) => [...chunk])),
		);
	const attempt = (retryEligible: boolean): WorkerAttemptMetadata =>
		Object.freeze({ accepted, commitObserved, retryEligible });
	const attemptError = (
		error: OperationWorkerError,
		retryEligible = false,
	): OperationWorkerAttemptError =>
		error instanceof OperationWorkerAttemptError
			? error
			: new OperationWorkerAttemptError(
					error.code,
					error.diagnostic,
					attempt(
						retryEligible && !accepted
							? preparedRequest.policy.retryCrashBeforeAccept
							: retryEligible,
					),
				);

	const validateIdentity = (message: WireMessage): void => {
		if (message.kind !== "event" && message.kind !== "response") return;
		const envelope = message.message;
		if (
			envelope.request_id !== requestId ||
			envelope.session_id !== sessionId ||
			!isSameProtocolVersion(
				envelope.protocol_version,
				request.message.protocol_version,
			)
		) {
			throw violation("response identity mismatch");
		}
	};

	const handleMessage = (message: WireMessage): void => {
		validateIdentity(message);
		if (finalMessage !== undefined) throw violation("message after final");
		if (!accepted) {
			if (
				message.kind !== "event" ||
				message.message.payload.event !== "accepted"
			) {
				throw violation("accepted event is not first");
			}
			if (
				message.message.payload.data.request_id !==
					message.message.request_id ||
				message.message.payload.data.session_id !== message.message.session_id
			) {
				throw violation("accepted identity mismatch");
			}
			accepted = true;
			observe({ kind: "accepted", requestId, sessionId });
			return;
		}

		if (
			message.kind === "event" &&
			message.message.payload.event === "progress"
		) {
			const progress = message.message.payload.data;
			if (progress.sequence <= progressSequence)
				throw violation("progress sequence regressed");
			progressSequence = progress.sequence;
			if (progress.stage === "committing" || progress.stage === "finished")
				commitObserved = true;
			options?.onProgress?.({
				sequence: progress.sequence,
				stage: progress.stage,
				payload: message,
			});
			return;
		}
		if (
			message.kind === "event" &&
			message.message.payload.event === "cancellation_acknowledged"
		) {
			if (message.message.payload.data.target_request_id !== requestId)
				throw violation("cancellation identity mismatch");
			return;
		}
		if (message.kind !== "response") throw violation("unexpected event");
		finalMessage = message;
		observe({
			kind: "response",
			status: message.message.outcome.status,
		});
	};

	const result = await new Promise<Response>((resolve, reject) => {
		const finish = (error?: OperationWorkerError): void => {
			if (settled) return;
			if (error !== undefined && terminalError === undefined) {
				terminalError = attemptError(error, false);
			}
			if (terminalError !== undefined) {
				if (!killRequested && !cancellationRequested) {
					killRequested = true;
					try {
						if (platform === "windows") child.kill("SIGKILL");
						else child.kill("SIGKILL");
					} catch {
						/* close remains the process-lifetime authority */
					}
				}
				if (!closeSeen) return;
				settled = true;
				if (graceTimer !== undefined) clearTimeout(graceTimer);
				cleanup();
				reject(terminalError);
				return;
			}
			if (!stdoutEnded || !closeSeen) return;
			settled = true;
			if (graceTimer !== undefined) clearTimeout(graceTimer);
			cleanup();
			if (closeCode !== 0 || !accepted || finalMessage === undefined) {
				reject(
					attemptError(
						crash(stderrDiagnostic()),
						!accepted && preparedRequest.policy.retryCrashBeforeAccept,
					),
				);
			} else {
				try {
					if (finalMessage.kind !== "response") {
						reject(attemptError(violation("final response missing")));
					} else if (finalMessage.message.outcome.status === "failure") {
						const protocolError = finalMessage.message.outcome.error;
						reject(
							new OperationWorkerAttemptError(
								protocolError.code,
								protocolError.user_safe_detail,
								attempt(
									protocolError.retryable &&
										!commitObserved &&
										!cancellationRequested,
								),
								protocolError.diagnostic_id,
							),
						);
					} else {
						resolve(invocation.method.decode(finalMessage) as Response);
					}
				} catch (decodeError) {
					reject(decodeError);
				}
			}
		};

		listen(child.stdout, "data", (chunk: unknown) => {
			try {
				for (const message of decoder.push(toBytes(chunk)))
					handleMessage(message);
			} catch (error) {
				finish(
					error instanceof OperationWorkerError
						? error
						: violation("stdout frame rejected"),
				);
			}
		});
		listen(child.stdout, "end", () => {
			try {
				decoder.finish();
				stdoutEnded = true;
				observe({ kind: "stdout_eof" });
				if (finalMessage === undefined && !cancellationRequested)
					finish(crash(stderrDiagnostic()));
				else finish();
			} catch {
				finish(violation("stdout frame truncated"));
			}
		});
		listen(child.stdout, "error", () => finish(crash(stderrDiagnostic())));
		listen(child.stderr, "data", (chunk: unknown) => {
			try {
				const bytes = toBytes(chunk);
				const remaining = MAX_STDERR_BYTES - stderrBytes;
				if (remaining <= 0) return;
				const captured = Uint8Array.from(bytes.subarray(0, remaining));
				stderrChunks.push(captured);
				stderrBytes += captured.byteLength;
			} catch {
				/* stderr is diagnostic-only */
			}
		});
		listen(child.stderr, "end", () => undefined);
		listen(child.stderr, "error", () => undefined);
		listen(child, "error", () => finish(crash(stderrDiagnostic())));
		listen(child, "close", (code: unknown) => {
			closeSeen = true;
			closeCode = typeof code === "number" || code === null ? code : null;
			// Counts, never contents: `stderrDiagnostic()` stays local and only
			// feeds the redacted diagnostic of a thrown error.
			observe({
				kind: "stderr-summary",
				bytes: stderrBytes,
				truncated: stderrBytes >= MAX_STDERR_BYTES,
			});
			observe({ kind: "close", exitCode: closeCode });
			finish();
		});

		listen(child.stdin, "error", () => {
			if (finalMessage === undefined) finish(crash(stderrDiagnostic()));
			else finish();
		});
		const cancelPolicy = options?.cancelPolicy ?? defaultCancelPolicy;
		const sendCancel = (): void => {
			if (cancelSent || settled || !requestWriteCompleted) {
				if (!requestWriteCompleted) pendingAbort = true;
				return;
			}
			if (finalMessage !== undefined) return;
			cancelSent = true;
			cancellationRequested = true;
			const forceAfterGrace = (): void => {
				if (settled || closeSeen) return;
				if (finalMessage !== undefined) {
					graceTimer = undefined;
					finish();
					return;
				}
				terminalError = new OperationWorkerAttemptError(
					cancelPolicy.forceErrorCode,
					undefined,
					attempt(false),
				);
				killRequested = true;
				try {
					if (platform === "windows") child.kill("SIGKILL");
					else child.kill("SIGKILL");
				} catch {
					/* close remains the process-lifetime authority */
				}
				finish();
			};
			graceTimer = setTimeout(
				forceAfterGrace,
				Math.max(0, cancelPolicy.graceMs),
			);
			graceTimer.unref?.();
			try {
				const cancelFrame = encodeOperationWorkerFrame({
					kind: "cancel",
					message: { target_request_id: requestId },
				});
				child.stdin.write(cancelFrame);
			} catch {
				/* bounded forced termination remains armed after synchronous EPIPE */
			}
		};
		if (options?.signal !== undefined) {
			options.signal.addEventListener("abort", sendCancel);
			listeners.push(() =>
				options.signal?.removeEventListener("abort", sendCancel),
			);
			if (options.signal.aborted) pendingAbort = true;
		}
		try {
			child.stdin.write(preparedRequest.frame);
			requestWriteCompleted = true;
			// Issue #158: distinguishes "bytes left this side" from the
			// worker's later `accepted` handshake — a child that never
			// answers is then visible as sent-but-not-accepted.
			observe({ kind: "request-sent" });
			if (pendingAbort || options?.signal?.aborted === true) sendCancel();
		} catch {
			requestWriteCompleted = true;
			finish(crash(stderrDiagnostic()));
		}
	});
	return result;
};

export const createOperationWorkerRunner = (
	construction: RunnerConstruction,
): OperationWorkerRunner => {
	let accepting = true;
	let active = 0;
	const invoke = async <Request, Response>(
		invocation: OperationInvocation<Request, Response>,
		options?: WorkerRunOptions,
	): Promise<Response> => {
		if (!accepting) throw new OperationWorkerError("worker_forced_termination");
		active += 1;
		try {
			const request = prepareRequest(invocation);
			const attempt: ResolveAttemptInput = {
				correlation: options?.correlation,
				resolvedManifest: options?.resolvedManifest,
			};
			const resolveInput = await construction.resolveInput(attempt);
			assertResolverInput(
				construction,
				invocation as OperationInvocation<unknown, unknown>,
				resolveInput,
			);
			const binary = await construction.resolveBinary(
				resolveInput,
				options?.correlation,
			);
			let child: WorkerChild;
			try {
				child = construction.spawnChild(
					binary.absolutePath,
					{
						shell: false,
						windowsHide: construction.platform === "windows",
						cwd: construction.extensionRoot,
						stdio: ["pipe", "pipe", "pipe"],
						env: safeEnvironment(binary.sha256),
					},
					options?.correlation,
				);
			} catch (error) {
				throw crash(error instanceof Error ? error.message : undefined);
			}
			try {
				const spawned: WorkerLifecycleEvent = {
					kind: "spawned",
					pid: child.pid,
					...(options?.correlation === undefined
						? {}
						: { correlation: options.correlation }),
				};
				options?.onLifecycle?.(spawned);
			} catch {
				/* observation is diagnostic-only and cannot alter the worker contract */
			}
			return await runChild<Response>(
				child,
				invocation as OperationInvocation<unknown, Response>,
				request,
				options,
				construction.platform,
				construction.cancelPolicy ?? {
					graceMs: 250,
					forceErrorCode: "worker_forced_termination",
				},
			);
		} finally {
			active -= 1;
		}
	};

	return {
		invoke,
		stopAccepting: () => {
			accepting = false;
		},
		drain: async (deadlineMs: number): Promise<boolean> => {
			const deadline = Date.now() + Math.max(0, deadlineMs);
			while (active !== 0 && Date.now() < deadline)
				await new Promise((resolve) => setTimeout(resolve, 10));
			return active === 0;
		},
	};
};
