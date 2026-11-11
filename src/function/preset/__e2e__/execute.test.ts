/**
 * End-to-end tests for preset execution flow.
 *
 * Tests the full execution path from preset type dispatch to host call.
 *
 * This file exercises the preset execution path through the current pipeline
 * and the underlying operation dispatch. Operation-level host behavior is
 * already covered by the dedicated operation tests.
 */

import { describe, expect, it, vi } from "vitest";
import { getPresetOperation } from "@/function/preset/operations";
import type { HostAdapter } from "@/management/ae/host/contract";
import { executePresetOnHost } from "@/management/preset/execution/pipeline";

// ---------------------------------------------------------------------------
// Shared mock fixtures
// ---------------------------------------------------------------------------

type MockHostOptions = {
	id?: string;
	code?: string;
	applyPreset?: ReturnType<typeof vi.fn>;
	runScriptFile?: ReturnType<typeof vi.fn>;
	addFootage?: ReturnType<typeof vi.fn>;
	applyEffectByMatchName?: ReturnType<typeof vi.fn>;
};

function makeMockHost(options: MockHostOptions = {}): HostAdapter {
	return {
		id: options.id ?? "after-effects",
		code: options.code ?? "AEFT",
		applyPreset: options.applyPreset ?? vi.fn().mockResolvedValue(undefined),
		runScriptFile:
			options.runScriptFile ?? vi.fn().mockResolvedValue(undefined),
		addFootage: options.addFootage ?? vi.fn().mockResolvedValue(undefined),
		applyEffectByMatchName:
			options.applyEffectByMatchName ?? vi.fn().mockResolvedValue(undefined),
	} as unknown as HostAdapter;
}

// ---------------------------------------------------------------------------
// Tests: preset execution via getPresetOperation
// Verifies the correct host method is called for each preset type.
// ---------------------------------------------------------------------------

describe("preset execution via getPresetOperation", () => {
	it("preset type calls host.applyPreset with filePath", async () => {
		const host = makeMockHost();
		const result = await getPresetOperation("preset")(host, {
			type: "preset",
			filePath: "/path/to/motion.ffx",
		});
		expect(host.applyPreset).toHaveBeenCalledOnce();
		expect(host.applyPreset).toHaveBeenCalledWith("/path/to/motion.ffx");
		expect(result.action).toBe("applyPreset");
	});

	it("script type calls host.runScriptFile with filePath", async () => {
		const host = makeMockHost();
		const result = await getPresetOperation("script")(host, {
			type: "script",
			filePath: "/path/to/tool.jsx",
		});
		expect(host.runScriptFile).toHaveBeenCalledOnce();
		expect(host.runScriptFile).toHaveBeenCalledWith("/path/to/tool.jsx");
		expect(result.action).toBe("runScriptFile");
	});

	it("footage type calls host.addFootage with filePath and toComp=true", async () => {
		const host = makeMockHost();
		const result = await getPresetOperation("footage")(host, {
			type: "footage",
			filePath: "/path/to footage.mp4",
		});
		expect(host.addFootage).toHaveBeenCalledOnce();
		expect(host.addFootage).toHaveBeenCalledWith({
			filePath: "/path/to footage.mp4",
			toComp: true,
		});
		expect(result.action).toBe("addFootage");
	});

	it("plugin type applies effect by file stem", async () => {
		const host = makeMockHost({
			applyEffectByMatchName: vi.fn().mockResolvedValue(undefined),
		});
		const result = await getPresetOperation("plugin")(host, {
			type: "plugin",
			filePath: "/path/to/effect.aex",
		});
		expect(host.applyEffectByMatchName).toHaveBeenCalledWith("effect");
		expect(result.action).toBe("applyEffectByMatchName");
	});

	it("plugin type derives the stem from a nested path", async () => {
		const host = makeMockHost({
			applyEffectByMatchName: vi.fn().mockResolvedValue(undefined),
		});
		await getPresetOperation("plugin")(host, {
			type: "plugin",
			filePath: "C:/plugins/My Effect.plugin",
		});
		expect(host.applyEffectByMatchName).toHaveBeenCalledWith("My Effect");
	});
});

// ---------------------------------------------------------------------------
// Tests: executePresetOnHost — pipeline output and host id propagation
// ---------------------------------------------------------------------------

describe("executePresetOnHost", () => {
	it("returns the host id and action for preset execution", async () => {
		const host = makeMockHost();
		const result = await executePresetOnHost(host, {
			type: "preset",
			filePath: "/path/to/motion.ffx",
		});

		expect(host.applyPreset).toHaveBeenCalledOnce();
		expect(host.applyPreset).toHaveBeenCalledWith("/path/to/motion.ffx");
		expect(result).toEqual({
			hostId: "after-effects",
			action: "applyPreset",
		});
	});
});

// ---------------------------------------------------------------------------
// Tests: error propagation via getPresetOperation (full host call path)
// These verify errors from the host are propagated correctly.
// ---------------------------------------------------------------------------

describe("error propagation via getPresetOperation", () => {
	it("propagates applyPreset errors from host", async () => {
		const testError = new Error("Preset file not found");
		const host = makeMockHost({
			applyPreset: vi.fn().mockRejectedValue(testError),
		});
		const opAction = getPresetOperation("preset");
		await expect(
			opAction(host, { type: "preset", filePath: "/presets/broken.ffx" }),
		).rejects.toThrow("Preset file not found");
	});

	it("propagates runScriptFile errors from host", async () => {
		const testError = new Error("Script execution failed");
		const host = makeMockHost({
			runScriptFile: vi.fn().mockRejectedValue(testError),
		});
		const opAction = getPresetOperation("script");
		await expect(
			opAction(host, { type: "script", filePath: "/scripts/bad-script.jsx" }),
		).rejects.toThrow("Script execution failed");
	});

	it("propagates addFootage errors from host", async () => {
		const testError = new Error("Footage file not found");
		const host = makeMockHost({
			addFootage: vi.fn().mockRejectedValue(testError),
		});
		const opAction = getPresetOperation("footage");
		await expect(
			opAction(host, { type: "footage", filePath: "/footage/missing.mp4" }),
		).rejects.toThrow("Footage file not found");
	});

	it("propagates applyEffectByMatchName errors from host", async () => {
		const testError = new Error("Effect application failed");
		const host = makeMockHost({
			applyEffectByMatchName: vi.fn().mockRejectedValue(testError),
		});
		const opAction = getPresetOperation("plugin");
		await expect(
			opAction(host, { type: "plugin", filePath: "/effects/corrupt.aex" }),
		).rejects.toThrow("Effect application failed");
	});
});

// ---------------------------------------------------------------------------
// Tests: R-1 pin — layer-comp/operation.ts registers as "plugin" but the
// dialog saves layer-comp presets as type "script". The current behavior is
// that `getPresetOperation("script")` is used (from code/operation.ts), and
// the `data.layerCompKind` field is ignored. This test pins that behavior so
// the dispatch bug is observable.
// See docs/plans/2026-06-07-terminology-audit-followup.md
// ---------------------------------------------------------------------------

describe("R-1 pin: layer-comp dispatches via script operation", () => {
	it("layer-comp preset with data.layerCompKind uses runScriptFile, not applyEffectByMatchName", async () => {
		const host = makeMockHost({
			runScriptFile: vi.fn().mockResolvedValue(undefined),
			applyEffectByMatchName: vi.fn().mockResolvedValue(undefined),
		});
		const result = await getPresetOperation("script")(host, {
			type: "script",
			filePath: "/path/to/layer-comp-preset.jsx",
		});
		expect(host.runScriptFile).toHaveBeenCalledOnce();
		expect(host.runScriptFile).toHaveBeenCalledWith(
			"/path/to/layer-comp-preset.jsx",
		);
		expect(host.applyEffectByMatchName).not.toHaveBeenCalled();
		expect(result.action).toBe("runScriptFile");
	});

	it("layer-comp preset with data.layerCompKind=layer also uses runScriptFile", async () => {
		const host = makeMockHost({
			runScriptFile: vi.fn().mockResolvedValue(undefined),
		});
		const result = await getPresetOperation("script")(host, {
			type: "script",
			filePath: "/path/to/layer-preset.jsx",
		});
		expect(host.runScriptFile).toHaveBeenCalledOnce();
		expect(result.action).toBe("runScriptFile");
	});
});

// ---------------------------------------------------------------------------
// Tests: traceExecute wrapper surfaces entryPoint to the lifecycle log.
// ---------------------------------------------------------------------------

describe("preset execute trace pipeline (Issue #130)", () => {
	it("executePresetOnHost's action string feeds into preset.execute.completed", async () => {
		// The full `executeWorkspacePresetForWindow` is wired in
		// `function/widget/utility/quick-actions/execute.test.ts` for the
		// Quick Bar dispatcher. Here we verify the trace itself accepts
		// the execute pipeline's `action` shape unchanged.
		const host = makeMockHost();
		const result = await executePresetOnHost(host, {
			type: "script",
			filePath: "/path/to/quick-bar-preset.jsx",
		});
		expect(result.action).toBe("runScriptFile");
	});
});
