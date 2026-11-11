import { createLogger } from "@/management/debug/logger";
import {
	type CanonicalMethod,
	type CanonicalOperationPolicy,
	canonicalMethods,
	canonicalOperationPolicies,
} from "./generated";
import {
	type OperationInvocation,
	OperationWorkerAttemptError,
	OperationWorkerError,
	type OperationWorkerRunner,
	type WorkerCorrelation,
	type WorkerRunOptions,
} from "./operation-worker-runner";

export type RequestId = string;
export type IdempotencyKey = string;

export interface OperationAttemptIdentity {
	readonly requestId: RequestId;
	readonly idempotencyKey?: IdempotencyKey;
}

/**
 * Completes the scheduler's correlation seed with the AE host session the
 * attempt resolved. `sessionId` cannot exist before the attempt reads host
 * context, so the scheduler hands the attempt a builder instead of a
 * half-filled correlation — an optional field would let a preflight event
 * silently ship without it (Issue #158).
 */
export type WorkerCorrelationResolver = (
	sessionId: string,
) => WorkerCorrelation;

export interface OperationInvocationFactory<Request, Response> {
	readonly methodName: CanonicalMethod;
	create(
		identity: OperationAttemptIdentity,
	): OperationInvocation<Request, Response>;
}

/**
 * Everything one attempt needs before it may touch a child process:
 * host context, manifest read, and the invocation itself. It runs inside
 * the attempt boundary, after `requestId` / `attempt` are minted, so its
 * logs are attributable to this attempt instead of to an uncorrelated
 * pre-scheduler window (Issue #158).
 */
export interface PreparedOperationAttempt<Request, Response> {
	readonly invocation: OperationInvocation<Request, Response>;
	/** Attempt-scoped run options (e.g. the manifest this attempt read). */
	readonly options?: WorkerRunOptions;
}

export type OperationAttemptPreparer<Request, Response> = (
	identity: OperationAttemptIdentity,
	correlation: WorkerCorrelationResolver,
) =>
	| PreparedOperationAttempt<Request, Response>
	| Promise<PreparedOperationAttempt<Request, Response>>;

export interface RunnerFactory {
	create(): OperationWorkerRunner;
}

export interface WorkerJob<Request, Response> {
	readonly methodName: CanonicalMethod;
	readonly prepareAttempt: OperationAttemptPreparer<Request, Response>;
	readonly options?: WorkerRunOptions;
}

const canonicalWireMethodValues = canonicalMethods.map(
	(methodName) => canonicalOperationPolicies[methodName].wireName,
);
if (
	new Set(canonicalWireMethodValues).size !== canonicalWireMethodValues.length
)
	throw new Error("canonical wire method mapping contains a collision");

/** Maps a generated policy key to its dotted Rust wire method name. */
export const canonicalWireMethodName = (
	methodName: string,
): string | undefined =>
	hasOwnRuntimeProperty(canonicalOperationPolicies, methodName)
		? canonicalOperationPolicies[methodName as CanonicalMethod].wireName
		: undefined;

export interface RetryState {
	readonly retryCount: number;
	readonly policy: CanonicalOperationPolicy;
	readonly attempt: OperationWorkerAttemptError["attempt"];
}

export const canRetry = (state: RetryState): boolean =>
	state.retryCount === 0 &&
	state.policy.retryClass === "idempotent" &&
	state.attempt.retryEligible &&
	!state.attempt.commitObserved;

const hasOwnRuntimeProperty = (value: object, key: string): boolean =>
	Object.getOwnPropertyDescriptor(value, key) !== undefined;

type QueuedJob = {
	readonly methodName: CanonicalMethod;
	readonly prepareAttempt: OperationAttemptPreparer<unknown, unknown>;
	readonly options?: WorkerRunOptions;
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: unknown) => void;
	/**
	 * One queued job == one **scheduler job**, stable across every attempt
	 * of this job, including retries (Issue #158). It is not a user-intent
	 * id: nothing above `enqueue()` mints one today, so one user action
	 * that enqueues twice produces two of these. It is reused as the wire
	 * `idempotency_key` for methods whose policy allows one — a second
	 * per-job id would only create two names for the same thing.
	 */
	readonly logicalOperationId: IdempotencyKey;
};

const operationWorkerSchedulerLog = createLogger("operation-worker");

/**
 * Primitive error code only. The scheduler log is retained and mirrored
 * cross-surface (Issue #138), so a raw `Error.message` — which can embed
 * an IPC payload — is never stored; the thrown Error still carries it to
 * the caller.
 */
const readOperationErrorCode = (error: unknown): string | undefined => {
	if (error instanceof OperationWorkerError) return error.code;
	return undefined;
};

const readOperationErrorName = (error: unknown): string =>
	error instanceof Error ? error.name : "unknown";

/**
 * Preflight is awaited only when it actually returns a promise. Keeping the
 * synchronous path free of an `await` matters: the scheduler reaches
 * `runner.invoke()` in the same turn for jobs that need no preflight, which
 * is what makes "four enqueued jobs, four started runners" observable in one
 * microtask.
 */
const isThenable = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> =>
	typeof (value as PromiseLike<T>).then === "function";

const assertIdentity = (
	invocation: OperationInvocation<unknown, unknown>,
	identity: OperationAttemptIdentity,
	policy: CanonicalOperationPolicy,
): void => {
	const encoded = invocation.method.encode(
		invocation.request,
		invocation.context,
	);
	if (
		invocation.method.name !== policy.wireName ||
		encoded.kind !== "request" ||
		encoded.message.method !== policy.wireName ||
		encoded.message.metadata.request_id !== identity.requestId ||
		encoded.message.metadata.idempotency_key !== identity.idempotencyKey
	) {
		throw new OperationWorkerError(
			"protocol_violation",
			"invocation identity mismatch",
		);
	}
};

export class OperationWorkerScheduler {
	private readonly queue: QueuedJob[] = [];
	private active = 0;
	private accepting = true;
	private readonly createId: () => string;

	constructor(
		private readonly runnerFactory: RunnerFactory,
		limit = 4,
		createId: () => string,
	) {
		if (limit !== 4)
			throw new RangeError("operation worker limit must be four");
		this.createId = createId;
	}

	activeCount(): number {
		return this.active;
	}

	enqueue<Request, Response>(
		factoryOrJob:
			| OperationInvocationFactory<Request, Response>
			| WorkerJob<Request, Response>,
	): Promise<Response> {
		if (!this.accepting)
			return Promise.reject(
				new OperationWorkerError("worker_forced_termination"),
			);
		// A factory with no preflight is adapted to the same path the
		// composition uses; only the composition needs `prepareAttempt`.
		const job: WorkerJob<Request, Response> =
			"prepareAttempt" in factoryOrJob
				? factoryOrJob
				: {
						methodName: factoryOrJob.methodName,
						prepareAttempt: (identity) => ({
							invocation: factoryOrJob.create(identity),
						}),
					};
		return new Promise<Response>((resolve, reject) => {
			const logicalOperationId = `job-${this.createId()}`;
			this.queue.push({
				methodName: job.methodName,
				prepareAttempt: job.prepareAttempt as OperationAttemptPreparer<
					unknown,
					unknown
				>,
				options: job.options,
				resolve: resolve as (value: unknown) => void,
				reject,
				logicalOperationId,
			});
			operationWorkerSchedulerLog.info("[ty-plus] operation queued", {
				action: "scheduler-enqueue",
				context: {
					operation: job.methodName,
					logicalOperationId,
					queueDepth: this.queue.length,
					activeCount: this.active,
				},
			});
			this.pump();
		});
	}

	stopAccepting(): void {
		this.accepting = false;
	}

	async drain(deadlineMs: number): Promise<boolean> {
		const deadline = Date.now() + Math.max(0, deadlineMs);
		while (this.active !== 0 || this.queue.length !== 0) {
			if (Date.now() >= deadline) return false;
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
		}
		return true;
	}

	private pump(): void {
		while (this.active < 4 && this.queue.length > 0) {
			const job = this.queue.shift();
			if (job === undefined) return;
			this.active += 1;
			void this.start(job);
		}
	}

	private async start(job: QueuedJob): Promise<void> {
		const startedAt = Date.now();
		let retryCount = 0;
		/**
		 * Full correlation for the attempt currently inside the boundary.
		 * `undefined` while the attempt has not resolved a host session yet
		 * (before `prepareAttempt` finishes, or when preflight itself fails).
		 */
		let correlation: WorkerCorrelation | undefined;
		let currentRequestId: string | undefined;
		let currentAttempt: number | undefined;
		const baseContext = (): Readonly<Record<string, unknown>> => ({
			operation: job.methodName,
			logicalOperationId: job.logicalOperationId,
			queueDepth: this.queue.length,
			activeCount: this.active,
			elapsedMs: Date.now() - startedAt,
			...(correlation === undefined
				? {}
				: { sessionId: correlation.sessionId }),
		});
		const attemptContext = (
			requestId: string,
			attempt: number,
		): Readonly<Record<string, unknown>> => ({
			...baseContext(),
			requestId,
			attempt,
		});
		try {
			for (;;) {
				const requestId = `request-${this.createId()}`;
				const attempt = retryCount + 1;
				currentRequestId = requestId;
				currentAttempt = attempt;
				// A retry must not inherit the previous attempt's session: this
				// attempt has not read host context yet, and a preflight failure
				// would otherwise be reported against the wrong session.
				correlation = undefined;
				const policy = hasOwnRuntimeProperty(
					canonicalOperationPolicies,
					job.methodName,
				)
					? canonicalOperationPolicies[job.methodName]
					: undefined;
				if (policy === undefined)
					throw new OperationWorkerError(
						"protocol_violation",
						"operation method policy missing",
					);
				const identity: OperationAttemptIdentity = {
					requestId,
					idempotencyKey:
						policy.idempotencyKey !== "forbidden"
							? job.logicalOperationId
							: undefined,
				};
				const seed = {
					logicalOperationId: job.logicalOperationId,
					requestId,
					attempt,
					operation: job.methodName,
					...(identity.idempotencyKey === undefined
						? {}
						: { idempotencyKey: identity.idempotencyKey }),
				} satisfies Omit<WorkerCorrelation, "sessionId">;
				operationWorkerSchedulerLog.info(
					"[ty-plus] operation attempt started",
					{
						action: "scheduler-start",
						// `sessionId` is deliberately absent: the attempt has not
						// read host context yet. The session enters the trace at
						// `manifest-read`, the first event inside `prepareAttempt`.
						context: attemptContext(requestId, attempt),
					},
				);
				// Identity exists before any preflight work, so the manifest and
				// host-context reads that follow are attributable to THIS attempt.
				const pending = job.prepareAttempt(identity, (sessionId) => ({
					...seed,
					sessionId,
				}));
				const prepared = isThenable(pending) ? await pending : pending;
				const invocation = prepared.invocation;
				correlation = { ...seed, sessionId: invocation.context.sessionId };
				assertIdentity(invocation, identity, policy);
				const runner = this.runnerFactory.create();
				try {
					const result = await runner.invoke(invocation, {
						...job.options,
						...prepared.options,
						correlation,
					});
					operationWorkerSchedulerLog.info("[ty-plus] operation complete", {
						action: "operation-complete",
						context: attemptContext(requestId, attempt),
					});
					job.resolve(result);
					return;
				} catch (error) {
					if (
						error instanceof OperationWorkerAttemptError &&
						canRetry({ retryCount, policy, attempt: error.attempt })
					) {
						const nextAttempt = retryCount + 2;
						retryCount += 1;
						operationWorkerSchedulerLog.warn("[ty-plus] operation retrying", {
							action: "operation-retry",
							context: {
								...attemptContext(requestId, attempt),
								nextAttempt,
								errorCode: readOperationErrorCode(error),
							},
						});
						continue;
					}
					operationWorkerSchedulerLog.error("[ty-plus] operation failed", {
						action: "operation-failed",
						context: {
							...attemptContext(requestId, attempt),
							errorCode: readOperationErrorCode(error),
							errorName: readOperationErrorName(error),
						},
					});
					job.reject(error);
					return;
				}
			}
		} catch (error) {
			// Preflight / identity failures: reported with whatever identity
			// this attempt had minted, and with `sessionId` only if host
			// context resolved before the failure.
			operationWorkerSchedulerLog.error("[ty-plus] operation failed", {
				action: "operation-failed",
				context: {
					...baseContext(),
					...(currentAttempt === undefined ? {} : { attempt: currentAttempt }),
					...(currentRequestId === undefined
						? {}
						: { requestId: currentRequestId }),
					errorCode: readOperationErrorCode(error),
					errorName: readOperationErrorName(error),
				},
			});
			job.reject(error);
		} finally {
			this.active -= 1;
			this.pump();
		}
	}
}
