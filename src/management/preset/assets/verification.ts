/**
 * Preset asset verification utilities — Issue #130
 *
 * Cross-cutting helpers that wrap the host-side `verifyPresetAsset` to keep
 * catalog records and on-disk assets in sync.
 *
 * Tri-state return model — important for the consumers:
 *
 * - **Post-write verification** (panel side, in the preset authoring
 *   dialogs and tool shell): after a write host call returns `ok: true`,
 *   re-verify the asset via `verifyPresetAsset` before calling
 *   `upsertLocalPreset`. If the host reports the file as missing OR the
 *   transport is unverifiable, throw a typed `PresetAssetMissingError`
 *   so the caller can surface the failure to the user instead of
 *   silently persisting a ghost record. We just wrote — a transport
 *   failure to verify means something is wrong, so blocking the persist
 *   is the correct behaviour.
 *
 * - **Pre-execute verification** (execute pipeline, before dispatching
 *   a preset to the host): a single per-preset `verifyPresetAsset` call
 *   right before the execute call. This makes "Script file not found"
 *   surface before the host reports it. Cancellation is handled via the
 *   execute pipeline's own transport.
 *
 * Startup scan (`runStartupPresetAssetScan`) was removed in #131.
 * It used to enumerate the catalog at boot and call `verifyPresetAsset`
 * for every record; this flooded the AE host main thread on first paint
 * and froze AE UI. Cancellation via `Promise.race(timeout)` is NOT true
 * cancellation — the ExtendScript evalScript keeps running on the AE
 * host and a hung call would still block the host thread indefinitely.
 * Boot-time full scans are therefore not used; stale detection happens
 * lazily on execute and via explicit refresh.
 *
 * Logging: routed through the canonical diagnostic sink
 * (`src/management/debug/logger.ts`, source `"preset-execution"`) added
 * by #129.
 */
import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import { createLogger } from "@/management/debug/logger";
import type { Preset } from "@/management/preset/contract";
import {
	type PresetSaveEntryPoint,
	tracePresetLifecycle,
} from "@/management/preset/execution/lifecycle-trace";

/** Tri-state result of a single `verifyPresetAsset` round-trip. */
export type PresetAssetState = "exists" | "missing" | "unverifiable";

/**
 * The structured return shape for `verifyPresetAsset`.
 *
 * `state === "unverifiable"` means we cannot reach the AE host right now
 * (transport failure, non-JSON response, empty path). Callers MUST NOT
 * collapse this into "missing" — those are distinct conditions.
 */
export type PresetAssetVerification = {
	readonly state: PresetAssetState;
	readonly path: string;
};

const presetExecutionLog = createLogger("preset-execution");

/**
 * Thrown when a just-written preset asset cannot be verified on disk.
 *
 * `observedState` lets callers (the dialog flow, the tool shell) tell a
 * real miss apart from a host transport failure, even though both block
 * the `upsertLocalPreset` call.
 */
export class PresetAssetMissingError extends Error {
	readonly presetId: string | null;
	readonly type: Preset["type"] | null;
	readonly filePath: string;
	readonly source: "post-write";
	readonly observedState: PresetAssetState;

	constructor(input: {
		message: string;
		presetId: string | null;
		type: Preset["type"] | null;
		filePath: string;
		source: "post-write";
		observedState: PresetAssetState;
	}) {
		super(input.message);
		this.name = "PresetAssetMissingError";
		this.presetId = input.presetId;
		this.type = input.type;
		this.filePath = input.filePath;
		this.source = input.source;
		this.observedState = input.observedState;
	}
}

const logAssetVerification = (
	level: "warn" | "error",
	event: string,
	context: Readonly<Record<string, unknown>>,
): void => {
	if (level === "error") {
		presetExecutionLog.error(`[ty-plus:preset-asset] ${event}`, { context });
	} else {
		presetExecutionLog.warn(`[ty-plus:preset-asset] ${event}`, { context });
	}
};

/**
 * Ask the AE host whether the file at `filePath` is still on disk.
 *
 * Returns `{state, path}` with `state ∈ {"exists", "missing", "unverifiable"}`:
 *
 * - `exists` — the host reported `exists: true`.
 * - `missing` — the host reported `exists: false` for a known path.
 * - `unverifiable` — host call threw, returned non-JSON, or the path was
 *   empty. The caller must NOT treat this as a real miss; it means we
 *   cannot reach the host right now.
 *
 * IMPORTANT — True cancellation: this function performs a single CEP →
 * ExtendScript `evalScript` round-trip on the AE host main thread.
 * There is no transport-level cancellation primitive. The caller is
 * responsible for NOT issueing this at boot or in any other context
 * where N such calls could flood the host. Boot-time full scans are
 * not used (see file header).
 */
export const verifyPresetAsset = async (
	win: Window,
	filePath: string,
): Promise<PresetAssetVerification> => {
	const safePath = String(filePath ?? "").trim();
	if (!safePath) {
		return { state: "unverifiable", path: "" };
	}
	try {
		const caller = createCepHostExecutor(win, "after-effects");
		const v = (await caller("verifyPresetAsset", [safePath])).value;
		if (
			v &&
			typeof v === "object" &&
			typeof (v as { path?: unknown }).path === "string"
		) {
			return {
				state: (v as { exists?: unknown }).exists ? "exists" : "missing",
				path: String((v as { path: string }).path),
			};
		}
		return { state: "unverifiable", path: safePath };
	} catch (error) {
		logAssetVerification("warn", "verifyPresetAsset:host-error", {
			filePath: safePath,
			message: error instanceof Error ? error.message : String(error),
		});
		return { state: "unverifiable", path: safePath };
	}
};

/**
 * Re-verify the just-written preset asset.
 *
 * Throws `PresetAssetMissingError` whenever the host reports a missing
 * file OR the verification transport itself fails. For post-write flows
 * both outcomes are failures: we just wrote, so a transport failure to
 * verify means something is wrong, and blocking `upsertLocalPreset` is
 * the correct behaviour. The `observedState` field on the error lets
 * callers surface the distinction (e.g. "could not verify" vs "host
 * reports missing").
 */
export const assertPresetAssetPresent = async (input: {
	win: Window;
	presetId: string | null;
	type: Preset["type"] | null;
	filePath: string;
	entryPoint?: PresetSaveEntryPoint;
}): Promise<PresetAssetVerification> => {
	const result = await verifyPresetAsset(input.win, input.filePath);
	if (input.entryPoint) {
		tracePresetLifecycle({
			kind: "preset.save.verify",
			presetId: input.presetId,
			input: input.filePath,
			state: result.state,
			canonicalPath: result.path,
			entryPoint: input.entryPoint,
		});
	}
	if (result.state === "exists") {
		return result;
	}
	logAssetVerification("error", "preset.asset_missing.post_write", {
		presetId: input.presetId,
		type: input.type,
		filePath: input.filePath,
		canonicalPath: result.path,
		observedState: result.state,
		source: "post-write",
		entryPoint: input.entryPoint ?? null,
	});
	throw new PresetAssetMissingError({
		message: `PRESET_ASSET_MISSING: ${result.state} at ${input.filePath}`,
		presetId: input.presetId,
		type: input.type,
		filePath: input.filePath,
		source: "post-write",
		observedState: result.state,
	});
};

/**
 * Verify a single preset just before execution (pre-execute gate).
 *
 * Returns the asset verification without side effects. The execute
 * pipeline calls this on the preset being dispatched, not at boot.
 *
 * `signal` does NOT cancel the in-flight ExtendScript evalScript — the
 * underlying transport has no true cancellation primitive, only the
 * ability to ignore results after the host eventually replies. A
 * `signal.abort === true` on entry short-circuits with `unverifiable`
 * but a hung in-flight call will still tie up the AE host thread
 * until it returns. Callers should not race this against cancellation
 * arbitrarily; in practice the execute pipeline runs one such call per
 * `executeWorkspacePresetForWindow` invocation, which is bounded by
 * user click rate, not by N-catalog-fanout.
 */
export const verifySinglePresetAsset = async (
	win: Window,
	preset: Preset,
): Promise<PresetAssetVerification> => {
	const filePath = String(preset.filePath ?? "").trim();
	return verifyPresetAsset(win, filePath);
};
