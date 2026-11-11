/**
 * Per-preset asset verification state — Issue #130, #131.
 *
 * Issue #131 hardening removed the boot-time `runStartupPresetAssetScan`
 * entirely (`Promise.race(timeout)` was not true cancellation; with
 * `concurrency: 1` a hung host call would still let outstanding
 * ExtendScript evalScripts accumulate on the AE host thread). The store
 * is now populated lazily by `verifySinglePresetAsset` (the pre-execute
 * gate) and explicit refresh actions; it starts in the `idle` state
 * meaning no scan has run yet. UI surfaces (catalog row, quick-action
 * row, context-menu handler) subscribe via `usePresetAssetHealth` and:
 *
 * - **disable the run affordance** for any preset ID present in
 *   `missingIds`, and
 * - **leave it enabled but render an "unknown / retry" badge** for any
 *   ID in `unverifiableIds` (transport was unavailable; the file may
 *   still exist — we just couldn't reach the host to confirm).
 *
 * `unverifiable` must NEVER be conflated with `missing`: the user-facing
 * difference is "this file is gone" vs "we couldn't verify right now".
 * Treating `unverifiable` as missing would disable every local preset
 * whenever the panel is offline (the regression this whole surface
 * exists to prevent).
 *
 * Module-shape mirrors `runtime-gateway-health.ts` so non-React
 * publishers (lazy verification) can publish without owning a React
 * tree.
 *
 * Snapshot contract (Issue #131):
 *
 * `useSyncExternalStore` requires that `getSnapshot()` returns the same
 * reference for unchanged state, otherwise React detects the value
 * changed on every render and reports
 * "The result of getSnapshot should be cached" / "Maximum update depth
 * exceeded". We hold a single immutable snapshot object per state and
 * return it directly; only `publish*` constructs a new snapshot.
 * Defensive cloning belongs to callers that need it.
 */

export type PresetAssetHealth =
	| {
			readonly state: "idle";
	  }
	| {
			readonly state: "ready";
			readonly catalogCount: number;
			readonly missingIds: ReadonlySet<string>;
			readonly unverifiableIds: ReadonlySet<string>;
			readonly scannedAt: number;
	  };

const IDLE: PresetAssetHealth = { state: "idle" };

type Listener = (health: PresetAssetHealth) => void;

let _current: PresetAssetHealth = IDLE;
const _listeners = new Set<Listener>();

/** Snapshot payload accepted by `publishPresetAssetHealth`. */
export type PresetAssetHealthSnapshot = {
	readonly catalogCount: number;
	readonly missingIds: ReadonlySet<string>;
	readonly unverifiableIds: ReadonlySet<string>;
	readonly scannedAt: number;
};

/**
 * Replace the current asset-health snapshot and notify listeners.
 * Builds ONE new snapshot object; subsequent `readPresetAssetHealth`
 * calls return that same reference until the next publish.
 */
export const publishPresetAssetHealth = (
	next: PresetAssetHealthSnapshot,
): void => {
	const snapshot: PresetAssetHealth = {
		state: "ready",
		catalogCount: next.catalogCount,
		missingIds: new Set(next.missingIds),
		unverifiableIds: new Set(next.unverifiableIds),
		scannedAt: next.scannedAt,
	};
	_current = snapshot;
	for (const listener of _listeners) {
		listener(_current);
	}
};

/**
 * Returns the current asset health snapshot by reference.
 *
 * Identity-stable for `useSyncExternalStore` — repeated calls without
 * an intervening `publishPresetAssetHealth` MUST return the same
 * object (`Object.is(readPresetAssetHealth(), readPresetAssetHealth())
 * === true`). Define a `cloneForExternalUse` if you need an isolated
 * copy.
 */
export const readPresetAssetHealth = (): PresetAssetHealth => _current;

/**
 * Subscribe to asset-health updates. Returns an unsubscribe function.
 *
 * Unlike the previous (broken) contract, the listener is NOT invoked
 * synchronously on subscribe — `useSyncExternalStore` reads the initial
 * value from `getSnapshot()` itself and we only fire on publish. This
 * prevents re-entrancy where every subscriber immediately triggers a
 * publish-style notification cascade.
 */
export const subscribePresetAssetHealth = (
	listener: Listener,
): (() => void) => {
	_listeners.add(listener);
	return () => {
		_listeners.delete(listener);
	};
};

/**
 * Returns `true` if the given preset ID has been observed as missing
 * on disk in the latest scan. `false` means either the preset was
 * observed as `exists`, or no scan has run yet (state === "idle").
 * Callers should treat `false` as "run affordance enabled" until a
 * scan actually completes.
 */
export const isPresetAssetMissing = (presetId: string): boolean => {
	if (_current.state !== "ready") return false;
	return _current.missingIds.has(presetId);
};

/**
 * Returns `true` if the host transport was unreachable when scanning
 * this preset. UI should keep the run affordance enabled but show a
 * "unknown / retry" badge; never collapse this into "missing".
 */
export const isPresetAssetUnverifiable = (presetId: string): boolean => {
	if (_current.state !== "ready") return false;
	return _current.unverifiableIds.has(presetId);
};

/** Test-only: replace internal state without firing listeners. */
export const __resetPresetAssetHealthForTests = (): void => {
	_current = IDLE;
	_listeners.clear();
};
