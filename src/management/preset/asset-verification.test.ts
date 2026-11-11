// @vitest-environment happy-dom

/**
 * Tests for the preset asset verification helpers (Issue #130 and #131).
 *
 * Tri-state contract:
 *
 * - `verifyPresetAsset` returns `state: "exists" | "missing" | "unverifiable"`.
 * - A host transport failure MUST surface as `unverifiable`, not `missing`.
 *   Conflating the two would cause the execute pipeline to disable
 *   every local record whenever the panel is offline — the regression
 *   this whole surface exists to prevent.
 * - `assertPresetAssetPresent` (post-write flow) blocks `upsertLocalPreset`
 *   on both `missing` and `unverifiable`, but the thrown error carries
 *   the `observedState` so the UI can render distinct copy ("file gone"
 *   vs "could not verify after write").
 * - `verifySinglePresetAsset` is the pre-execute gate used by the
 *   execute pipeline (replaces the boot-time full scan removed in #131).
 *
 * Issue #131: there is NO `scanPresetsForMissingAssets` and NO
 * `runStartupPresetAssetScan`. Boot-time fan-out against the AE host
 * is not used; cancellation was not real (`Promise.race(timeout)` only
 * ignored results — the evalScript kept running on the host thread).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as loggerModule from "@/management/debug/logger";
import {
	assertPresetAssetPresent,
	PresetAssetMissingError,
	verifyPresetAsset,
	verifySinglePresetAsset,
} from "@/management/preset/asset-verification";
import type { Preset } from "@/management/preset/contract";

const hostState = vi.hoisted(() => {
	const state: {
		caller:
			| ((
					method: string,
					args: readonly unknown[],
			  ) => Promise<{ value: unknown }>)
			| null;
	} = { caller: null };
	return state;
});

vi.mock("@/management/ae/cep/host-executor", () => ({
	createCepHostExecutor:
		() => async (method: string, args: readonly unknown[]) => {
			const caller = hostState.caller;
			if (!caller) {
				throw new Error(`No host mock installed for ${method}`);
			}
			return caller(method, args);
		},
}));

beforeEach(() => {
	hostState.caller = null;
	loggerModule.clearEntries();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("preset asset verification — tri-state (Issue #130, #131)", () => {
	it("returns unverifiable for an empty path without invoking the host", async () => {
		hostState.caller = vi.fn();

		const result = await verifyPresetAsset(window, "");

		expect(result).toEqual({ state: "unverifiable", path: "" });
	});

	it("forwards the recorded path to the host and unwraps the result", async () => {
		const caller = vi.fn(async (method: string) => {
			if (method === "verifyPresetAsset") {
				return { value: { exists: true, path: "C:/real/preset.jsx" } };
			}
			return { value: undefined };
		});
		hostState.caller = caller;

		const result = await verifyPresetAsset(window, "C:/real/preset.jsx");

		expect(result).toEqual({ state: "exists", path: "C:/real/preset.jsx" });
		expect(caller).toHaveBeenCalledWith("verifyPresetAsset", [
			"C:/real/preset.jsx",
		]);
	});

	it("returns missing when the host reports exists:false for a known path", async () => {
		hostState.caller = vi.fn(async (method: string) => {
			if (method === "verifyPresetAsset") {
				return { value: { exists: false, path: "C:/real/preset.jsx" } };
			}
			return { value: undefined };
		});

		const result = await verifyPresetAsset(window, "C:/real/preset.jsx");

		expect(result).toEqual({ state: "missing", path: "C:/real/preset.jsx" });
	});

	it("REGRESSION: returns unverifiable (NOT missing) when the host transport throws", async () => {
		hostState.caller = vi.fn(async () => {
			throw new Error("evalScript unavailable");
		});

		const result = await verifyPresetAsset(window, "C:/real/preset.jsx");

		// The whole point of the tri-state model: transport failure must
		// never be conflated with "file gone".
		expect(result).toEqual({
			state: "unverifiable",
			path: "C:/real/preset.jsx",
		});
	});

	it("returns unverifiable when the host returns a value without a path field", async () => {
		hostState.caller = vi.fn(async () => ({
			value: { exists: undefined } as unknown,
		}));

		const result = await verifyPresetAsset(window, "C:/real/preset.jsx");

		expect(result).toEqual({
			state: "unverifiable",
			path: "C:/real/preset.jsx",
		});
	});

	it("emits a warn entry through the canonical preset-execution logger on transport failure", async () => {
		hostState.caller = vi.fn(async () => {
			throw new Error("transport down");
		});

		const result = await verifyPresetAsset(window, "C:/real/preset.jsx");

		expect(result.state).toBe("unverifiable");
		const entries = loggerModule.getEntries().filter((e) => e.level === "warn");
		expect(
			entries.some(
				(e) =>
					e.source === "preset-execution" &&
					e.message.includes("verifyPresetAsset:host-error"),
			),
		).toBe(true);
	});

	it("assertPresetAssetPresent throws PRESET_ASSET_MISSING with observedState=missing when the host reports missing", async () => {
		hostState.caller = vi.fn(async (method: string) => {
			if (method === "verifyPresetAsset") {
				return { value: { exists: false, path: "C:/missing/preset.jsx" } };
			}
			return { value: undefined };
		});

		const thrown = await assertPresetAssetPresent({
			win: window,
			presetId: "preset-1",
			type: "script",
			filePath: "C:/missing/preset.jsx",
		}).then(
			() => null,
			(e: unknown) => e as PresetAssetMissingError,
		);

		expect(thrown).toBeInstanceOf(PresetAssetMissingError);
		expect(thrown).toMatchObject({
			presetId: "preset-1",
			type: "script",
			filePath: "C:/missing/preset.jsx",
			source: "post-write",
			observedState: "missing",
		});
	});

	it("assertPresetAssetPresent throws with observedState=unverifiable when the transport fails", async () => {
		hostState.caller = vi.fn(async () => {
			throw new Error("transport down");
		});

		const thrown = await assertPresetAssetPresent({
			win: window,
			presetId: "preset-2",
			type: "preset",
			filePath: "C:/just-wrote/preset.ffx",
		}).then(
			() => null,
			(e: unknown) => e as PresetAssetMissingError,
		);

		// Post-write: both missing AND unverifiable block the persist,
		// but the error must preserve the distinction so the UI can
		// render distinct copy.
		expect(thrown).toBeInstanceOf(PresetAssetMissingError);
		expect(thrown?.observedState).toBe("unverifiable");
		expect(thrown?.source).toBe("post-write");
	});

	it("assertPresetAssetPresent throws with observedState=unverifiable when the path is empty (no host call)", async () => {
		const caller = vi.fn();
		hostState.caller = caller;

		const thrown = await assertPresetAssetPresent({
			win: window,
			presetId: "preset-1",
			type: "script",
			filePath: "",
		}).then(
			() => null,
			(e: unknown) => e as PresetAssetMissingError,
		);

		expect(thrown).toBeInstanceOf(PresetAssetMissingError);
		expect(thrown?.observedState).toBe("unverifiable");
		expect(thrown?.filePath).toBe("");
		expect(caller).not.toHaveBeenCalled();
	});

	it("assertPresetAssetPresent returns the canonical path when the asset is present", async () => {
		hostState.caller = vi.fn(async (method: string) => {
			if (method === "verifyPresetAsset") {
				return {
					value: { exists: true, path: "C:/canonical/preset.jsx" },
				};
			}
			return { value: undefined };
		});

		const result = await assertPresetAssetPresent({
			win: window,
			presetId: "preset-1",
			type: "preset",
			filePath: "C:/canonical/preset.jsx",
		});

		expect(result).toEqual({
			state: "exists",
			path: "C:/canonical/preset.jsx",
		});
	});

	it("verifySinglePresetAsset skips cloud presets with empty filePath", async () => {
		const caller = vi.fn();
		hostState.caller = caller;

		const preset: Preset = {
			id: "cloud-1",
			type: "script",
			title: "Cloud",
			filePath: "",
		};

		const result = await verifySinglePresetAsset(window, preset);

		expect(result).toEqual({ state: "unverifiable", path: "" });
		expect(caller).not.toHaveBeenCalled();
	});

	it("verifySinglePresetAsset delegates to verifyPresetAsset for a real path", async () => {
		hostState.caller = vi.fn(
			async (method: string, args: readonly unknown[]) => {
				if (method === "verifyPresetAsset") {
					return {
						value: { exists: true, path: String(args[0] ?? "") },
					};
				}
				return { value: undefined };
			},
		);

		const preset: Preset = {
			id: "ok-ffx",
			type: "preset",
			title: "ok",
			filePath: "C:/present/animation.ffx",
		};

		const result = await verifySinglePresetAsset(window, preset);

		expect(result).toEqual({
			state: "exists",
			path: "C:/present/animation.ffx",
		});
	});

	// Issue #130: assertPresetAssetPresent must surface the entryPoint
	// the caller attached to it on the `preset.save.verify` trace event
	// so the lifecycle log ties verify failures back to the originating
	// surface (tool-shell dialog, path-dialog).
	it("emits a preset.save.verify trace event carrying entryPoint when the host reports exists", async () => {
		hostState.caller = vi.fn(async (method: string) => {
			if (method === "verifyPresetAsset") {
				return { value: { exists: true, path: "C:/canonical/preset.jsx" } };
			}
			return { value: undefined };
		});

		await assertPresetAssetPresent({
			win: window,
			presetId: "preset-tool-shell",
			type: "script",
			filePath: "C:/canonical/preset.jsx",
			entryPoint: "tool-shell:easing",
		});

		const verifyEntry = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.save.verify");
		expect(verifyEntry).toBeDefined();
		expect(verifyEntry?.context).toMatchObject({
			eventKind: "preset.save.verify",
			entryPoint: "tool-shell:easing",
			presetId: "preset-tool-shell",
			state: "exists",
			canonicalPath: "C:/canonical/preset.jsx",
		});
	});

	it("emits a preset.save.verify trace event with the path-dialog entryPoint on missing", async () => {
		hostState.caller = vi.fn(async (method: string) => {
			if (method === "verifyPresetAsset") {
				return { value: { exists: false, path: "C:/missing/preset.jsx" } };
			}
			return { value: undefined };
		});

		await assertPresetAssetPresent({
			win: window,
			presetId: "preset-path",
			type: "preset",
			filePath: "C:/missing/preset.jsx",
			entryPoint: "path-dialog",
		}).then(
			() => null,
			() => null,
		);

		const verifyEntry = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.save.verify");
		expect(verifyEntry?.context).toMatchObject({
			eventKind: "preset.save.verify",
			entryPoint: "path-dialog",
			state: "missing",
		});
	});
});
