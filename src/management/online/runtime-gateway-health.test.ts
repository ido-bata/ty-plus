// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	__resetGatewayHealthForTests,
	markGatewayNotBooted,
	publishGatewayHealth,
	readGatewayHealth,
	readHostOnlineState,
	setHostOnlineStatePublisher,
	subscribeGatewayHealth,
} from "./runtime-gateway-health";

describe("runtime-gateway-health store", () => {
	beforeEach(() => {
		__resetGatewayHealthForTests();
	});

	afterEach(() => {
		__resetGatewayHealthForTests();
	});

	it("starts in the offline state with the documented reason", () => {
		const health = readGatewayHealth();
		expect(health.state).toBe("offline");
		if (health.state === "offline") {
			expect(health.reason).toBe("gateway boot was not invoked");
		}
	});

	it("publishGatewayHealth replaces the state and notifies listeners synchronously", () => {
		const listener = vi.fn();
		subscribeGatewayHealth(listener);
		listener.mockClear();

		publishGatewayHealth({ state: "live" });

		expect(listener).toHaveBeenCalledTimes(1);
		expect(readGatewayHealth()).toEqual({ state: "live" });
	});

	it("preserves classified failure data on the degraded state", () => {
		const failure = {
			reason: "worker-composition-failed" as const,
			message: "boom",
		};
		publishGatewayHealth({ state: "degraded", failure });
		const health = readGatewayHealth();
		expect(health.state).toBe("degraded");
		if (health.state === "degraded") {
			expect(health.failure.reason).toBe("worker-composition-failed");
			expect(health.failure.message).toBe("boom");
		}
	});

	it("markGatewayNotBooted refuses to overwrite a live state", () => {
		publishGatewayHealth({ state: "live" });
		markGatewayNotBooted();
		expect(readGatewayHealth().state).toBe("live");
	});

	it("markGatewayNotBooted promotes offline from the default start state", () => {
		// Default start state is already offline, but the call must
		// still bump the listeners so UI surfaces re-render.
		const listener = vi.fn();
		subscribeGatewayHealth(listener);
		listener.mockClear();
		markGatewayNotBooted();
		expect(readGatewayHealth().state).toBe("offline");
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("subscribeGatewayHealth does NOT fire immediately with the current value (Issue #131)", () => {
		// The previous contract fired `listener(_current)` synchronously
		// on subscribe, which on every `useGatewayHealth` mount would
		// push a fresh snapshot into the React render loop. The
		// `useSyncExternalStore` initializer reads via `getSnapshot`
		// directly; the listener should only fire on `publish`.
		publishGatewayHealth({ state: "live" });
		const listener = vi.fn();
		subscribeGatewayHealth(listener);
		expect(listener).not.toHaveBeenCalled();
		expect(readGatewayHealth()).toEqual({ state: "live" });
	});

	it("unsubscribe stops further notifications", () => {
		const listener = vi.fn();
		const off = subscribeGatewayHealth(listener);
		listener.mockClear();
		off();
		publishGatewayHealth({ state: "live" });
		expect(listener).not.toHaveBeenCalled();
	});

	it("returns the same identity for repeated reads when state is unchanged (Issue #131)", () => {
		const failure = {
			reason: "worker-runtime-failed" as const,
			message: "transient",
		};
		publishGatewayHealth({ state: "degraded", failure });
		const a = readGatewayHealth();
		const b = readGatewayHealth();
		// `useSyncExternalStore` requires `Object.is(getSnapshot(),
		// getSnapshot()) === true`. The store now holds a single
		// immutable reference per publish — identity must be stable.
		expect(Object.is(a, b)).toBe(true);
	});

	// Round-4 Blocker B — the canonical ExtendScript probe
	// `tyPlusProbeOnlineState` reads `$.global.tyPlusOnlineState`.
	// Without a producer side the probe returned undefined.  This
	// test pins the writer→probe contract: every publishGatewayHealth
	// transition forwards the mapped value (`live` → "online",
	// `degraded` → "degraded", `offline` → "offline") to the
	// registered host-state publisher.
	describe("round-4 Blocker B: host-state publisher", () => {
		it("publishes 'online' when the gateway reaches the live state", () => {
			const writes: string[] = [];
			setHostOnlineStatePublisher((state) => {
				writes.push(state);
			});
			publishGatewayHealth({ state: "live" });
			expect(writes).toEqual(["online"]);
			expect(readHostOnlineState()).toBe("online");
		});

		it("publishes 'degraded' with the failure payload", () => {
			const writes: string[] = [];
			setHostOnlineStatePublisher((state) => {
				writes.push(state);
			});
			publishGatewayHealth({
				state: "degraded",
				failure: {
					reason: "worker-runtime-failed",
					message: "boom",
				},
			});
			expect(writes).toEqual(["degraded"]);
			expect(readHostOnlineState()).toBe("degraded");
		});

		it("publishes 'offline' as the canonical default state", () => {
			const writes: string[] = [];
			setHostOnlineStatePublisher((state) => {
				writes.push(state);
			});
			markGatewayNotBooted();
			expect(writes).toEqual(["offline"]);
			expect(readHostOnlineState()).toBe("offline");
		});

		it("does NOT publish when no host-state publisher is registered", () => {
			// Sanity: publishers are optional.  Without a registered
			// publisher `publishGatewayHealth` must not throw.
			setHostOnlineStatePublisher(null);
			expect(() => publishGatewayHealth({ state: "live" })).not.toThrow();
			expect(readHostOnlineState()).toBe("online");
		});

		it("write→probe contract: the published value matches what tyPlusProbeOnlineState reads", () => {
			// Simulate the host bundle: a fake `$.global` the probe
			// would read.  The publisher writes through to that fake
			// global via a side-effect callback, then the probe
			// reads it back.  This is the contract the real
			// ExtendScript probe enforces via `runCepEvalScript` in
			// `cloud-gateway-boot.ts`.
			const fakeGlobal: { tyPlusOnlineState?: string } = {};
			setHostOnlineStatePublisher((state) => {
				fakeGlobal.tyPlusOnlineState = state;
			});

			publishGatewayHealth({ state: "live" });
			// Probe semantics: read the flag, default to "offline".
			const readProbe = (g: { tyPlusOnlineState?: string }): string =>
				typeof g.tyPlusOnlineState === "string"
					? g.tyPlusOnlineState
					: "offline";
			expect(readProbe(fakeGlobal)).toBe("online");

			publishGatewayHealth({
				state: "degraded",
				failure: {
					reason: "worker-runtime-failed",
					message: "x",
				},
			});
			expect(readProbe(fakeGlobal)).toBe("degraded");

			publishGatewayHealth({ state: "offline", reason: "r" });
			expect(readProbe(fakeGlobal)).toBe("offline");
		});
	});
});
