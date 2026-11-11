import { describe, expect, it } from "vitest";
import { canonicalMethods, canonicalOperationPolicies } from "./generated";
import {
	type OperationInvocation,
	OperationWorkerAttemptError,
	type OperationWorkerRunner,
} from "./operation-worker-runner";
import {
	canonicalWireMethodName,
	canRetry,
	OperationWorkerScheduler,
	type RetryState,
} from "./operation-worker-scheduler";
import {
	deferredRunnerFactory,
	invocationFactory,
} from "./operation-worker-scheduler.test-fixtures";

let testId = 0;
const newTestScheduler = (
	factory: ConstructorParameters<typeof OperationWorkerScheduler>[0],
	limit = 4,
) => new OperationWorkerScheduler(factory, limit, () => `test-id-${++testId}`);

const withoutObjectHasOwn = <T>(run: () => T): T => {
	const descriptor = Object.getOwnPropertyDescriptor(Object, "hasOwn");
	Object.defineProperty(Object, "hasOwn", {
		configurable: true,
		value: undefined,
	});
	try {
		return run();
	} finally {
		if (descriptor === undefined) {
			Reflect.deleteProperty(Object, "hasOwn");
		} else {
			Object.defineProperty(Object, "hasOwn", descriptor);
		}
	}
};

describe("operation worker scheduler", () => {
	it("maps every generated policy key to one unique dotted wire name", () => {
		const wireNames = canonicalMethods.map((methodName) => {
			const wireName = canonicalWireMethodName(methodName);
			expect(wireName).toBe(canonicalOperationPolicies[methodName].wireName);
			return wireName;
		});
		expect(new Set(wireNames).size).toBe(canonicalMethods.length);
		expect(canonicalWireMethodName("online.catalog.search")).toBeUndefined();
		expect(canonicalWireMethodName("toString")).toBeUndefined();
	});

	it("allows exactly one retry only for an eligible uncommitted attempt", () => {
		const base: RetryState = {
			retryCount: 0,
			policy: {
				idempotencyKey: "optional",
				retryClass: "idempotent",
				cancellable: true,
				retryCrashBeforeAccept: false,
				wireName: "online.catalog.search",
			},
			attempt: { accepted: true, commitObserved: false, retryEligible: true },
		};
		expect(canRetry(base)).toBe(true);
		expect(canRetry({ ...base, retryCount: 1 })).toBe(false);
		expect(
			canRetry({ ...base, attempt: { ...base.attempt, commitObserved: true } }),
		).toBe(false);
		expect(
			canRetry({
				...base,
				policy: { ...base.policy, retryClass: "non-idempotent" },
			}),
		).toBe(false);
		expect(
			canRetry({ ...base, attempt: { ...base.attempt, retryEligible: false } }),
		).toBe(false);
	});

	it("keeps a fifth job queued while four runners are active", async () => {
		const runners = deferredRunnerFactory();
		const scheduler = newTestScheduler(runners);
		const jobs = Array.from({ length: 5 }, (_, index) => {
			const seen: Array<{ requestId: string; idempotencyKey?: string }> = [];
			return scheduler.enqueue(invocationFactory(seen, index));
		});
		await Promise.resolve();
		expect(scheduler.activeCount()).toBe(4);
		expect(runners.started()).toHaveLength(4);
		runners.release(0);
		await expect(jobs[0]).resolves.toBeUndefined();
		await Promise.resolve();
		expect(runners.started()).toHaveLength(5);
		for (const index of [1, 2, 3, 4]) runners.release(index);
		await Promise.all(jobs);
	});

	// Issue #131: invariant — outstanding child count must NOT grow
	// unbounded over time. This drives the audit's process-storm
	// assertion: even under sustained enqueue traffic, `activeCount`
	// stays at the limit (4) and returns to 0 once all jobs settle.
	it("caps outstanding child count at the limit under sustained enqueue traffic", async () => {
		const runners = deferredRunnerFactory();
		const scheduler = newTestScheduler(runners);
		const peak: number[] = [];
		const totalJobs = 64;
		const jobs: Promise<unknown>[] = [];
		for (let i = 0; i < totalJobs; i += 1) {
			jobs.push(
				scheduler.enqueue(invocationFactory([], i)).finally(() => {
					peak.push(scheduler.activeCount());
				}),
			);
			// Sample after each enqueue. Peak must never exceed 4.
			if (i % 8 === 0) peak.push(scheduler.activeCount());
		}
		// Drain: release 4 at a time, repeatedly.
		// Each `runners.release(index)` releases the runner at that
		// index. After a release, the scheduler pumps the next job.
		// Iterate until all jobs have settled.
		let iterations = 0;
		while (
			jobs.some(
				(j) =>
					(j as Promise<unknown>).then !== undefined &&
					peak.length < totalJobs + 10,
			)
		) {
			const runner = runners.runners[iterations];
			if (runner === undefined) break;
			runner.release();
			await Promise.resolve();
			iterations += 1;
			if (iterations > totalJobs) break;
		}
		// Give the scheduler a chance to settle every pending job.
		await scheduler.drain(1_000);
		expect(await Promise.all(jobs)).toHaveLength(totalJobs);
		// INVARIANT: peak observed active count never exceeds the limit.
		expect(Math.max(...peak)).toBeLessThanOrEqual(4);
		// INVARIANT: active count returns to 0 after every settled job.
		expect(scheduler.activeCount()).toBe(0);
	});

	it("rejects a scheduler limit other than four", () => {
		expect(() => newTestScheduler(deferredRunnerFactory(), 3)).toThrow();
	});

	it("stops accepting jobs but drains existing FIFO work", async () => {
		const runners = deferredRunnerFactory();
		const scheduler = newTestScheduler(runners);
		const first = scheduler.enqueue(invocationFactory([]));
		scheduler.stopAccepting();
		await expect(
			scheduler.enqueue(invocationFactory([])),
		).rejects.toMatchObject({
			code: "worker_forced_termination",
		});
		expect(await scheduler.drain(0)).toBe(false);
		runners.release(0);
		await expect(first).resolves.toBeUndefined();
		expect(await scheduler.drain(0)).toBe(true);
	});

	it("retries once with a fresh runner, fresh request id, and stable key", async () => {
		const seen: Array<{ requestId: string; idempotencyKey?: string }> = [];
		let runnerCreates = 0;
		const scheduler = newTestScheduler({
			create: (): OperationWorkerRunner => {
				runnerCreates += 1;
				return {
					invoke: async <Request, Response>() => {
						if (runnerCreates === 1)
							throw new OperationWorkerAttemptError(
								"worker_crashed",
								undefined,
								{ accepted: true, commitObserved: false, retryEligible: true },
							);
						return { ok: true } as Response;
					},
					stopAccepting: () => undefined,
					drain: async () => true,
				};
			},
		});
		await expect(scheduler.enqueue(invocationFactory(seen))).resolves.toEqual({
			ok: true,
		});
		expect(runnerCreates).toBe(2);
		expect(seen).toHaveLength(2);
		expect(seen[0]?.requestId).not.toBe(seen[1]?.requestId);
		expect(seen[0]?.idempotencyKey).toBe(seen[1]?.idempotencyKey);
	});

	it("rejects a factory that reuses the first request id", async () => {
		let firstRequestId = "";
		const factory = invocationFactory([]);
		const scheduler = newTestScheduler({
			create: () => ({
				invoke: async () => {
					throw new OperationWorkerAttemptError("worker_crashed", undefined, {
						accepted: true,
						commitObserved: false,
						retryEligible: true,
					});
				},
				stopAccepting: () => undefined,
				drain: async () => true,
			}),
		});
		const reusingFactory = {
			methodName: "online_catalog_search" as const,
			create: (identity: { requestId: string; idempotencyKey?: string }) => {
				if (firstRequestId === "") firstRequestId = identity.requestId;
				const invocation = factory.create({
					...identity,
					requestId: firstRequestId,
				});
				return invocation;
			},
		};
		await expect(scheduler.enqueue(reusingFactory)).rejects.toMatchObject({
			code: "protocol_violation",
		});
	});

	it("generates keys only for optional or required policies", async () => {
		const seen: Array<{ requestId: string; idempotencyKey?: string }> = [];
		const scheduler = newTestScheduler({
			create: () => ({
				invoke: async <Request, Response>() => undefined as Response,
				stopAccepting: () => undefined,
				drain: async () => true,
			}),
		});
		await scheduler.enqueue(
			invocationFactory(seen, undefined, "online_catalog_search"),
		);
		await scheduler.enqueue(
			invocationFactory(seen, undefined, "online_download"),
		);
		expect(seen[0]?.idempotencyKey).toMatch(/^job-/);
		expect(seen[1]?.idempotencyKey).toBeUndefined();
	});

	it("rejects unknown generated policy before creating a runner", async () => {
		let created = 0;
		const scheduler = newTestScheduler({
			create: () => {
				created += 1;
				return {
					invoke: async <Request, Response>() => undefined as Response,
					stopAccepting: () => undefined,
					drain: async () => true,
				};
			},
		});
		await expect(
			scheduler.enqueue(invocationFactory([], undefined, "fixture.operation")),
		).rejects.toMatchObject({
			code: "protocol_violation",
		});
		expect(created).toBe(0);
	});

	it("rejects prototype-chain method names before factory create", async () => {
		let created = 0;
		const scheduler = newTestScheduler({
			create: () => {
				throw new Error("runner must not be created");
			},
		});
		const factory = {
			methodName: "toString" as never,
			create: () => {
				created += 1;
				throw new Error("factory must not be called");
			},
		};
		await expect(scheduler.enqueue(factory)).rejects.toMatchObject({
			code: "protocol_violation",
		});
		expect(created).toBe(0);
	});

	it("uses own-property policy lookup when Object.hasOwn is unavailable", async () => {
		const scheduler = newTestScheduler({
			create: () => ({
				invoke: async <Request, Response>() => undefined as Response,
				stopAccepting: () => undefined,
				drain: async () => true,
			}),
		});
		const result = withoutObjectHasOwn(() =>
			scheduler.enqueue(invocationFactory([])),
		);
		await expect(result).resolves.toBeUndefined();
		const inheritedResult = withoutObjectHasOwn(() =>
			scheduler.enqueue({
				methodName: "toString" as never,
				create: () => {
					throw new Error("factory must not be called");
				},
			}),
		);
		await expect(inheritedResult).rejects.toMatchObject({
			code: "protocol_violation",
		});
	});

	it("rejects a factory method lie before creating a runner", async () => {
		let created = 0;
		const honest = invocationFactory([], undefined, "online_catalog_search");
		const lying = {
			methodName: "online_catalog_search" as const,
			create: (identity: { requestId: string; idempotencyKey?: string }) => {
				const invocation = honest.create(identity);
				return {
					...invocation,
					method: { ...invocation.method, name: "online_catalog_cache_read" },
				};
			},
		};
		const scheduler = newTestScheduler({
			create: () => {
				created += 1;
				return {
					invoke: async <Request, Response>() => undefined as Response,
					stopAccepting: () => undefined,
					drain: async () => true,
				};
			},
		});
		await expect(scheduler.enqueue(lying)).rejects.toMatchObject({
			code: "protocol_violation",
		});
		expect(created).toBe(0);
	});

	it("starts queued jobs in strict FIFO order", async () => {
		const started: string[] = [];
		const releases: Array<() => void> = [];
		const scheduler = newTestScheduler({
			create: () => ({
				invoke: async <Request, Response>(
					invocation: OperationInvocation<Request, Response>,
				) => {
					const value = (invocation.request as { value: string }).value;
					started.push(value);
					await new Promise<void>((resolve) => releases.push(resolve));
					return value as Response;
				},
				stopAccepting: () => undefined,
				drain: async () => true,
			}),
		});
		const jobs = ["1", "2", "3", "4", "5", "6"].map((value) =>
			scheduler.enqueue(
				invocationFactory([], undefined, "online_catalog_search", value),
			),
		);
		await Promise.resolve();
		expect(started).toEqual(["1", "2", "3", "4"]);
		releases.shift()?.();
		await jobs[0];
		await Promise.resolve();
		expect(started).toEqual(["1", "2", "3", "4", "5"]);
		for (let index = 0; index < 5; index += 1) {
			await Promise.resolve();
			releases.shift()?.();
		}
		await Promise.all(jobs);
		expect(started).toEqual(["1", "2", "3", "4", "5", "6"]);
	});
});
