import { beforeEach, describe, expect, it } from "vitest";
import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	getEntries,
} from "@/management/debug/logger";
import { OperationWorkerAttemptError } from "./operation-worker-runner";
import { OperationWorkerScheduler } from "./operation-worker-scheduler";
import {
	deferredRunnerFactory,
	invocationFactory,
} from "./operation-worker-scheduler.test-fixtures";

/**
 * Issue #158 — one scheduler job, one attempt, one trace.
 *
 * These cases pin the identity model the scheduler owns:
 *
 *   logicalOperationId  one queued scheduler job, stable across retries
 *   requestId           unique per attempt
 *   attempt             1-based within the scheduler job
 *
 * plus the structured `action` records the scheduler emits for
 * enqueue / start / retry / complete / fail. The `idempotencyKey` on the
 * wire is the logical job id reused, not a second minted id.
 *
 * `logicalOperationId` is NOT a user-intent id. Nothing above
 * `scheduler.enqueue()` mints one (see operation-worker.md), so four
 * distinct ids mean four enqueued scheduler jobs and nothing stronger —
 * a single user action that enqueued four times would look identical.
 */

let testId = 0;
const nextTestId = (): string => {
	testId += 1;
	return `corr-${testId}`;
};
const newScheduler = (
	factory: ConstructorParameters<typeof OperationWorkerScheduler>[0],
	limit = 4,
) => new OperationWorkerScheduler(factory, limit, nextTestId);

const entriesWithAction = (action: string) =>
	getEntries().filter((entry) => entry.action === action);

beforeEach(() => {
	_resetBusForTests();
	_setDevConsoleEnabled(false);
});

describe("operation worker correlation (Issue #158)", () => {
	it("gives four concurrent scheduler jobs four distinct identities", async () => {
		const runners = deferredRunnerFactory();
		const scheduler = newScheduler(runners);
		const seen: Array<{ requestId: string; idempotencyKey?: string }> = [];

		const jobs = Array.from({ length: 4 }, () =>
			scheduler.enqueue(invocationFactory(seen, { ok: true })),
		);
		await Promise.resolve();

		expect(scheduler.activeCount()).toBe(4);
		// Four children, four request ids, one attempt each, four distinct
		// scheduler job ids. What this does NOT establish: that four
		// scheduler jobs came from four different user intents — there is
		// no upstream intent id to check that against (Issue #158).
		expect(new Set(seen.map((entry) => entry.requestId)).size).toBe(4);
		expect(new Set(seen.map((entry) => entry.idempotencyKey)).size).toBe(4);

		const starts = entriesWithAction("scheduler-start");
		expect(starts).toHaveLength(4);
		expect(
			new Set(
				starts.map(
					(entry) =>
						(entry.context as { logicalOperationId?: string })
							.logicalOperationId,
				),
			).size,
		).toBe(4);
		for (const entry of starts) {
			const context = entry.context as {
				operation?: string;
				attempt?: number;
				queueDepth?: number;
				activeCount?: number;
				elapsedMs?: number;
			};
			expect(context.operation).toBe("online_catalog_search");
			expect(context.attempt).toBe(1);
			expect(typeof context.queueDepth).toBe("number");
			expect(context.activeCount).toBeLessThanOrEqual(4);
			expect(typeof context.elapsedMs).toBe("number");
		}

		for (const index of [0, 1, 2, 3]) runners.release(index);
		await Promise.all(jobs);
		expect(entriesWithAction("operation-complete")).toHaveLength(4);
		expect(scheduler.activeCount()).toBe(0);
	});

	it("never lets active children exceed the contract of four", async () => {
		const runners = deferredRunnerFactory();
		const scheduler = newScheduler(runners);
		const observed: number[] = [];
		const jobs = Array.from({ length: 12 }, (_, index) =>
			scheduler.enqueue(invocationFactory([], index)).then((value) => {
				observed.push(scheduler.activeCount());
				return value;
			}),
		);
		await Promise.resolve();
		observed.push(scheduler.activeCount());
		expect(Math.max(...observed)).toBeLessThanOrEqual(4);

		// Release each runner as the scheduler pumps the next job.
		for (
			let index = 0;
			index < runners.runners.length && index < 64;
			index += 1
		) {
			runners.runners[index].release();
			await Promise.resolve();
		}
		await scheduler.drain(1_000);
		await Promise.all(jobs);
		expect(scheduler.activeCount()).toBe(0);
		expect(Math.max(...observed)).toBeLessThanOrEqual(4);
	});

	it("keeps the logical operation id while the attempt and request id advance", async () => {
		let attempt = 0;
		const seen: Array<{ requestId: string; idempotencyKey?: string }> = [];
		const scheduler = newScheduler({
			create: () => ({
				invoke: async <Request, Response>() => {
					attempt += 1;
					if (attempt === 1) {
						throw new OperationWorkerAttemptError("worker_crashed", undefined, {
							accepted: true,
							commitObserved: false,
							retryEligible: true,
						});
					}
					return { ok: true } as Response;
				},
				stopAccepting: () => undefined,
				drain: async () => true,
			}),
		});

		await expect(scheduler.enqueue(invocationFactory(seen))).resolves.toEqual({
			ok: true,
		});

		expect(seen).toHaveLength(2);
		expect(seen[0]?.requestId).not.toBe(seen[1]?.requestId);
		expect(seen[0]?.idempotencyKey).toBe(seen[1]?.idempotencyKey);

		const starts = entriesWithAction("scheduler-start");
		expect(
			starts.map((entry) => (entry.context as { attempt?: number }).attempt),
		).toEqual([1, 2]);
		const logicalIds = starts.map(
			(entry) =>
				(entry.context as { logicalOperationId?: string }).logicalOperationId,
		);
		expect(logicalIds[0]).toBe(logicalIds[1]);

		const retries = entriesWithAction("operation-retry");
		expect(retries).toHaveLength(1);
		expect(retries[0]?.context).toMatchObject({
			logicalOperationId: logicalIds[0],
			attempt: 1,
			nextAttempt: 2,
			requestId: seen[0]?.requestId,
		});
		expect(entriesWithAction("operation-complete")).toHaveLength(1);
		expect(entriesWithAction("operation-failed")).toHaveLength(0);
	});

	it("records a failed operation without a retry when the policy forbids one", async () => {
		const seen: Array<{ requestId: string; idempotencyKey?: string }> = [];
		const scheduler = newScheduler({
			create: () => ({
				invoke: async <Request, Response>() => {
					throw new Error("child crashed before the handshake");
				},
				stopAccepting: () => undefined,
				drain: async () => true,
			}),
		});

		// `online_catalog_search` is idempotent, so a plain Error (not an
		// `OperationWorkerAttemptError`) is terminal — no retry.
		await expect(scheduler.enqueue(invocationFactory(seen))).rejects.toThrow(
			"child crashed before the handshake",
		);

		expect(entriesWithAction("operation-retry")).toHaveLength(0);
		const failures = entriesWithAction("operation-failed");
		expect(failures).toHaveLength(1);
		expect(failures[0]?.context).toMatchObject({
			logicalOperationId: seen[0]?.idempotencyKey,
			requestId: seen[0]?.requestId,
			attempt: 1,
			errorName: "Error",
		});
		// The raw message is never persisted — it can carry an IPC payload.
		expect(JSON.stringify(failures)).not.toContain("child crashed");
	});

	it("emits a structured enqueue record with queue depth and active count", async () => {
		const runners = deferredRunnerFactory();
		const scheduler = newScheduler(runners);
		scheduler.enqueue(invocationFactory([], 1));
		scheduler.enqueue(invocationFactory([], 2));
		await Promise.resolve();

		const enqueued = entriesWithAction("scheduler-enqueue");
		expect(enqueued).toHaveLength(2);
		expect(enqueued[0]?.source).toBe("operation-worker");
		// Logged after the push and before `pump()`, so the queue already
		// holds this job while `active` still reflects the previous pump.
		expect(enqueued[0]?.context).toMatchObject({
			operation: "online_catalog_search",
			queueDepth: 1,
			activeCount: 0,
		});
		expect(enqueued[1]?.context).toMatchObject({
			queueDepth: 1,
			activeCount: 1,
		});

		for (const runner of [...runners.runners]) runner.release();
		await scheduler.drain(1_000);
	});
});
