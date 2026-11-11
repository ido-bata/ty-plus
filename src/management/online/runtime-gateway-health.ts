/**
 * Gateway health surface state.
 *
 * The panel and dialog surfaces need to react to whether the live
 * Rust-backed cloud gateway was wired at boot. Three states are
 * possible:
 *
 *   - `live`     the Rust worker transport is connected; preset catalog
 *                and notifications come from the runtime.
 *   - `degraded` the boot attempt was classified but failed (see
 *                `GatewayBootFailure`); UI must surface the reason.
 *   - `offline`  the gateway was not built and never will be (the
 *                boot path did not run or the runtime was deliberately
 *                bypassed for a debug-only fixture path).
 *
 * This module is a tiny pub/sub store rather than a hook so the
 * boot-time side effect (`tryBuildCloudGateway`) can publish without
 * owning a React tree. UI surfaces subscribe via the React-side hook
 * (`useGatewayHealth`) to drive badge / empty-state copy.
 *
 * Snapshot contract (Issue #131):
 *
 * `useSyncExternalStore` requires that `getSnapshot()` returns the same
 * reference for unchanged state; cloning on every read produced
 * "The result of getSnapshot should be cached" /
 * "Maximum update depth exceeded" warnings that crashed panel boot.
 * The store now holds a single immutable snapshot object per publish
 * and returns it directly.
 */

import type { GatewayBootFailure } from "@/management/panel/cloud-gateway-boot";

export type GatewayHealth =
	| { readonly state: "live" }
	| {
			readonly state: "degraded";
			readonly failure: GatewayBootFailure;
	  }
	| { readonly state: "offline"; readonly reason: string };

const OFFLINE_REASON_NO_BOOT = "gateway boot was not invoked";

type Listener = (health: GatewayHealth) => void;

/**
 * Round-4 Blocker B — host-state publisher.
 *
 * `$.global.tyPlusOnlineState` is the flag the canonical
 * `tyPlusProbeOnlineState` ExtendScript probe reads out of
 * `$.global` (see `host-bundle.ext.ts`).  Round-3 shipped the reader
 * but never wrote to the flag from production, so the probe always
 * returned `undefined` and silently passed with a stale value.  This
 * module now publishes the canonical online state to whichever writer
 * the panel registers.  In CEP, the registered function calls
 * `runCepEvalScript(window, '$.global.tyPlusOnlineState = "<s>";')`
 * via the host bridge.  In Vite preview / tests, no publisher is
 * registered and the side-effect is a no-op — the in-memory snapshot
 * still updates and React subscribers still fire.
 */
export type HostOnlineStateValue = "online" | "degraded" | "offline";
export type HostOnlineStatePublisher = (state: HostOnlineStateValue) => void;

const mapHealthToHostOnlineState = (h: GatewayHealth): HostOnlineStateValue => {
	switch (h.state) {
		case "live":
			return "online";
		case "degraded":
			return "degraded";
		case "offline":
			return "offline";
	}
};

let _current: GatewayHealth = {
	state: "offline",
	reason: OFFLINE_REASON_NO_BOOT,
};
const _listeners = new Set<Listener>();
let _hostPublisher: HostOnlineStatePublisher | null = null;

/**
 * Build the next snapshot. New object identity — the only place that
 * allocates new `GatewayHealth` references after construction.
 */
const buildSnapshot = (next: GatewayHealth): GatewayHealth => {
	if (next.state === "live") return { state: "live" };
	if (next.state === "degraded") {
		return {
			state: "degraded",
			failure: {
				reason: next.failure.reason,
				message: next.failure.message,
				...(next.failure.cause !== undefined
					? { cause: next.failure.cause }
					: {}),
			},
		};
	}
	return { state: "offline", reason: next.reason };
};

/**
 * Replace the current gateway health and notify listeners. Builds ONE
 * new snapshot object; subsequent `readGatewayHealth` calls return that
 * same reference until the next publish.
 *
 * Round-4 Blocker B: when a host-state publisher is set via
 * `setHostOnlineStatePublisher`, this also forwards the mapped value
 * (`live` → `"online"`, `degraded` → `"degraded"`, `offline` →
 * `"offline"`) so `$.global.tyPlusOnlineState` always tracks the
 * production state machine.
 */
export const publishGatewayHealth = (next: GatewayHealth): void => {
	_current = buildSnapshot(next);
	for (const listener of _listeners) {
		listener(_current);
	}
	if (_hostPublisher !== null) {
		_hostPublisher(mapHealthToHostOnlineState(_current));
	}
};

/**
 * Register (or clear, when `null`) the host-state publisher that
 * `publishGatewayHealth` forwards the canonical online state to.
 * Called once at panel boot from `cloud-gateway-boot.ts` so the
 * canonical ExtendScript probe reads what production actually writes.
 *
 * Calling this with `null` is the test escape hatch (round-4
 * Blocker B unit test uses it to assert the publish hook fires
 * without needing `$.evalScript`).
 */
export const setHostOnlineStatePublisher = (
	publisher: HostOnlineStatePublisher | null,
): void => {
	_hostPublisher = publisher;
};

/**
 * Read the current mapped host-online-state value.  Exposed for the
 * probe-writer unit test (round-4 Blocker B): the test registers a
 * mock publisher, calls `publishGatewayHealth`, and asserts the
 * mapped value matches.
 */
export const readHostOnlineState = (): HostOnlineStateValue =>
	mapHealthToHostOnlineState(_current);

/**
 * Returns the current gateway health snapshot by reference.
 *
 * Identity-stable for `useSyncExternalStore`. Repeated calls without
 * an intervening `publishGatewayHealth` MUST return the same object.
 */
export const readGatewayHealth = (): GatewayHealth => _current;

/**
 * Mark the gateway as never booted. Called by `services.getDataServices`
 * when no runtime gateway was registered (and no explicit fixture
 * path was requested) so the panel does not silently render an offline
 * UI as if it were a successful boot.
 */
export const markGatewayNotBooted = (): void => {
	if (_current.state === "live") return;
	publishGatewayHealth({
		state: "offline",
		reason: OFFLINE_REASON_NO_BOOT,
	});
};

/**
 * Subscribe to gateway health updates. Returns an unsubscribe function.
 *
 * The listener is NOT invoked synchronously on subscribe (the previous
 * contract fired `listener(clone(_current))` immediately, which on
 * every `useGatewayHealth` mount would push a fresh snapshot into the
 * React render loop). `useSyncExternalStore` reads its initial value
 * from `getSnapshot()` and we only fire on publish.
 */
export const subscribeGatewayHealth = (listener: Listener): (() => void) => {
	_listeners.add(listener);
	return () => {
		_listeners.delete(listener);
	};
};

/** Test-only: replace internal state without firing listeners. */
export const __resetGatewayHealthForTests = (): void => {
	_current = { state: "offline", reason: OFFLINE_REASON_NO_BOOT };
	_listeners.clear();
	_hostPublisher = null;
};
