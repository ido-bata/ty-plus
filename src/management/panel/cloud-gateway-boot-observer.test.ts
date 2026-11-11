import { beforeEach, describe, expect, it } from "vitest";
import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	createLogger,
	getEntries,
} from "@/management/debug/logger";
import type { OperationWorkerManifest } from "@/management/ipc/operation-worker-binary";
import type { WorkerCorrelation } from "@/management/ipc/operation-worker-runner";
import { createBootLifecycleObserver } from "./cloud-gateway-boot";

/**
 * Issue #158 — the Debug Console must be able to answer "which logical
 * job is this child?" from the log alone.
 *
 * The observer receives only the events only the runner knows about;
 * composition-internal events (`manifest-resolved`, `binary-resolved`,
 * `spawn-attempt`) are logged once, at their source, with the same
 * correlation — logging them here as well is the duplicate noise the
 * issue set out to remove.
 */

const correlation: WorkerCorrelation = {
	logicalOperationId: "job-42",
	requestId: "request-42",
	attempt: 2,
	operation: "host_thumbnail_lookup",
	sessionId: "session-42",
	idempotencyKey: "job-42",
};

let observer: ReturnType<typeof createBootLifecycleObserver>;

beforeEach(() => {
	_resetBusForTests();
	_setDevConsoleEnabled(false);
	observer = createBootLifecycleObserver(createLogger("operation-worker"));
});

const actions = (): ReadonlyArray<unknown> =>
	getEntries().map((entry) => entry.action);

describe("operation worker lifecycle observer (Issue #158)", () => {
	it("labels every runner event and carries the correlation", () => {
		observer({ kind: "spawned", pid: 4321, correlation });
		observer({ kind: "request-sent", correlation });
		observer({
			kind: "accepted",
			requestId: "request-42",
			sessionId: "session-42",
			correlation,
		});
		observer({ kind: "response", status: "success", correlation });
		observer({ kind: "close", exitCode: 0, correlation });

		expect(actions()).toEqual([
			"worker-spawn",
			"worker-request-sent",
			"worker-accepted",
			"worker-response",
			"worker-exit",
		]);

		const entries = getEntries();
		expect(entries).toHaveLength(5);
		for (const entry of entries) {
			expect(entry.source).toBe("operation-worker");
			expect(entry.context).toMatchObject({
				operation: "host_thumbnail_lookup",
				logicalOperationId: "job-42",
				requestId: "request-42",
				attempt: 2,
				sessionId: "session-42",
				idempotencyKey: "job-42",
			});
		}
		expect(entries[0]?.context).toMatchObject({ pid: 4321 });
		expect(entries[3]?.context).toMatchObject({ status: "success" });
		expect(entries[4]?.context).toMatchObject({ exitCode: 0 });
	});

	it("does not re-log composition-internal events that already carry an action", () => {
		const manifest = {} as OperationWorkerManifest;
		observer({ kind: "manifest-resolved", manifest, correlation });
		observer({ kind: "binary-resolved", binary: {} as never, correlation });
		observer({
			kind: "spawn-attempt",
			binaryPath: "/x/worker.exe",
			correlation,
		});

		expect(actions()).toHaveLength(0);
	});

	it("keeps events without a correlation readable instead of forcing empty ids", () => {
		observer({ kind: "close", exitCode: 1 });

		const [entry] = getEntries();
		expect(entry?.action).toBe("worker-exit");
		expect(entry?.context).toMatchObject({ exitCode: 1 });
		expect(entry?.context).not.toHaveProperty("requestId");
		expect(entry?.context).not.toHaveProperty("logicalOperationId");
	});
});
