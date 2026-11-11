import { describe, expect, it } from "vitest";
import { NonIdempotentTracker, RuntimeLifecycle } from "./lifecycle-runtime";

describe("RuntimeLifecycle", () => {
	it("starts in idle state", () => {
		const lifecycle = new RuntimeLifecycle();
		expect(lifecycle.currentState).toBe("idle");
	});

	it("transitions to starting on start", () => {
		const lifecycle = new RuntimeLifecycle();
		lifecycle.start();
		expect(lifecycle.currentState).toBe("starting");
	});

	it("transitions to running on running", () => {
		const lifecycle = new RuntimeLifecycle();
		lifecycle.start();
		lifecycle.running();
		expect(lifecycle.currentState).toBe("running");
	});

	it("handles crash with auto restart", () => {
		const lifecycle = new RuntimeLifecycle({
			autoRestart: true,
			maxRestarts: 3,
		});
		lifecycle.start();
		lifecycle.running();

		const shouldRestart = lifecycle.crash({
			timestamp: new Date(),
			exitCode: 1,
			signal: null,
		});

		expect(shouldRestart).toBe(true);
		expect(lifecycle.currentState).toBe("crashed");
	});

	it("stops after max restarts", () => {
		const lifecycle = new RuntimeLifecycle({
			autoRestart: true,
			maxRestarts: 2,
		});
		lifecycle.start();
		lifecycle.running();
		lifecycle.crash({ timestamp: new Date(), exitCode: 1, signal: null });
		lifecycle.restart();
		lifecycle.running();
		lifecycle.crash({ timestamp: new Date(), exitCode: 1, signal: null });
		lifecycle.restart();
		lifecycle.running();

		const shouldRestart = lifecycle.crash({
			timestamp: new Date(),
			exitCode: 1,
			signal: null,
		});

		expect(shouldRestart).toBe(false);
		expect(lifecycle.currentState).toBe("stopped");
	});

	it("accepts requests only when running", () => {
		const lifecycle = new RuntimeLifecycle();
		expect(lifecycle.canAcceptRequests()).toBe(false);
		lifecycle.start();
		expect(lifecycle.canAcceptRequests()).toBe(false);
		lifecycle.running();
		expect(lifecycle.canAcceptRequests()).toBe(true);
	});

	it("emits state changes", () => {
		const lifecycle = new RuntimeLifecycle();
		const states: string[] = [];
		lifecycle.onStateChange((state) => states.push(state));

		lifecycle.start();
		lifecycle.running();

		expect(states).toEqual(["starting", "running"]);
	});

	it("emits crash events", () => {
		const lifecycle = new RuntimeLifecycle();
		const crashes: unknown[] = [];
		lifecycle.onCrash((info) => crashes.push(info));

		lifecycle.start();
		lifecycle.running();
		lifecycle.crash({ timestamp: new Date(), exitCode: 1, signal: null });

		expect(crashes).toHaveLength(1);
	});
});

describe("NonIdempotentTracker", () => {
	it("registers a new request", () => {
		const tracker = new NonIdempotentTracker();
		expect(tracker.register("req-1", "test.method")).toBe(true);
	});

	it("rejects duplicate request", () => {
		const tracker = new NonIdempotentTracker();
		tracker.register("req-1", "test.method");
		expect(tracker.register("req-1", "test.method")).toBe(false);
	});

	it("allows request after completion", () => {
		const tracker = new NonIdempotentTracker();
		tracker.register("req-1", "test.method");
		tracker.complete("req-1");
		expect(tracker.register("req-1", "test.method")).toBe(false);
	});

	it("tracks sent requests", () => {
		const tracker = new NonIdempotentTracker();
		tracker.register("req-1", "test.method");
		expect(tracker.hasBeenSent("req-1")).toBe(true);
	});

	it("clears tracking data", () => {
		const tracker = new NonIdempotentTracker();
		tracker.register("req-1", "test.method");
		tracker.clear();
		expect(tracker.hasBeenSent("req-1")).toBe(false);
	});
});
