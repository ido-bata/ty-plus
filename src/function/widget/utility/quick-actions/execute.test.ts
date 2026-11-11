// @vitest-environment happy-dom

/**
 * Tests for the Quick Bar / Quick Actions preset dispatcher (Issue #130).
 *
 * Asserts that the canonical execute pipeline is invoked when the
 * palette preset row is clicked. Quick Bar must route through the same
 * `executeWorkspacePresetForWindow` call site as the workspace tile,
 * Directory Browser, Catalog Browser, and Edit Dialog — and emit
 * `preset.execute.*` trace events tagged with `entryPoint: "quick-bar"`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as loggerModule from "@/management/debug/logger";
import type { Preset } from "@/management/preset/contract";

const useCasesState = vi.hoisted(() => {
	return { getPreset: vi.fn() };
});

const runtimeState = vi.hoisted(() => {
	return { execute: vi.fn() };
});

const cepRuntimeState = vi.hoisted(() => {
	return { hostCode: "AEFT" };
});

vi.mock("@/management/preset/use-cases", () => ({
	getPreset: (id: string) => useCasesState.getPreset(id),
}));

vi.mock("@/management/workspace/runtime", () => ({
	executeWorkspacePresetForWindow: (
		win: Window,
		hostCode: string,
		preset: Preset,
	) => runtimeState.execute(win, hostCode, preset),
}));

vi.mock("@/management/ae/cep/runtime", () => ({
	detectCepHostCode: () => cepRuntimeState.hostCode,
}));

const { executeQuickActionPreset } = await import("./execute");

const fakePreset: Preset = {
	id: "p-quick-bar",
	type: "script",
	title: "Quick Bar Preset",
	filePath: "C:/scripts/quick-bar.jsx",
};

beforeEach(() => {
	useCasesState.getPreset = vi.fn(async (id: string) =>
		id === fakePreset.id ? fakePreset : undefined,
	);
	runtimeState.execute = vi.fn(async () => ({ action: "runScriptFile" }));
	cepRuntimeState.hostCode = "AEFT";
	loggerModule.clearEntries();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("executeQuickActionPreset — Quick Bar dispatcher", () => {
	it("looks up the preset by id and forwards to the canonical pipeline", async () => {
		await executeQuickActionPreset(window, fakePreset.id);

		expect(useCasesState.getPreset).toHaveBeenCalledWith(fakePreset.id);
		expect(runtimeState.execute).toHaveBeenCalledOnce();
		expect(runtimeState.execute).toHaveBeenCalledWith(
			window,
			"AEFT",
			fakePreset,
		);
	});

	it("no-ops when the preset cannot be resolved", async () => {
		useCasesState.getPreset = vi.fn(async () => undefined);

		await executeQuickActionPreset(window, "does-not-exist");

		expect(runtimeState.execute).not.toHaveBeenCalled();
	});

	it("emits preset.execute.requested and preset.execute.completed trace events tagged quick-bar", async () => {
		await executeQuickActionPreset(window, fakePreset.id);

		const actions = loggerModule
			.getEntries()
			.map((e) => e.action)
			.filter((a): a is string => typeof a === "string");

		expect(actions).toContain("preset.execute.requested");
		expect(actions).toContain("preset.execute.completed");

		const requested = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.execute.requested");
		expect(requested?.context).toMatchObject({
			eventKind: "preset.execute.requested",
			entryPoint: "quick-bar",
			presetId: fakePreset.id,
			type: "script",
			filePath: fakePreset.filePath,
		});

		const completed = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.execute.completed");
		expect(completed?.context).toMatchObject({
			eventKind: "preset.execute.completed",
			entryPoint: "quick-bar",
			presetId: fakePreset.id,
			action: "runScriptFile",
		});
	});

	it("emits preset.execute.failed when the pipeline rejects", async () => {
		const failure = new Error("Script file not found");
		runtimeState.execute = vi.fn(async () => {
			throw failure;
		});

		await expect(executeQuickActionPreset(window, fakePreset.id)).rejects.toBe(
			failure,
		);

		const failed = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.execute.failed");
		expect(failed?.context).toMatchObject({
			eventKind: "preset.execute.failed",
			entryPoint: "quick-bar",
			presetId: fakePreset.id,
			message: "Script file not found",
		});
	});
});
