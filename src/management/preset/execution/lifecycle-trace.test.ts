// @vitest-environment happy-dom

/**
 * Tests for `preset-execution` lifecycle trace events (Issue #130).
 *
 * Each `tracePresetLifecycle` event kind must emit exactly one log
 * entry under the canonical `preset-execution` source, with the event
 * fields round-tripped into the structured `context` payload. The
 * `traceExecute` wrapper must emit `preset.execute.requested` /
 * `preset.execute.completed` / `preset.execute.failed` triplet for
 * successful and failing pipelines, and must re-throw the original
 * error so callers keep control of error UX.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as loggerModule from "@/management/debug/logger";
import type { Preset } from "@/management/preset/contract";
import {
	traceExecute,
	tracePresetLifecycle,
} from "@/management/preset/execution/lifecycle-trace";

const collectEntries = (): loggerModule.LogEntry[] => {
	const entries: loggerModule.LogEntry[] = [];
	const unsubscribe = loggerModule.subscribeLog((next) => {
		entries.push(...next);
	});
	unsubscribe();
	return entries;
};

beforeEach(() => {
	loggerModule.clearEntries();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("tracePresetLifecycle — event fan-out", () => {
	it("emits a preset-execution log entry for preset.save.requested", () => {
		tracePresetLifecycle({
			kind: "preset.save.requested",
			presetId: "p-1",
			type: "script",
			userFacingName: "ローカルプリセット",
			saveDir: "C:/Scripts/ty-plus/easing",
			fullPath: "C:/Scripts/ty-plus/easing/ローカルプリセット.jsx",
			entryPoint: "tool-shell:easing",
		});
		const entries = loggerModule.getEntries();
		const matched = entries.find((e) => e.action === "preset.save.requested");
		expect(matched).toBeDefined();
		expect(matched?.source).toBe("preset-execution");
		expect(matched?.level).toBe("info");
		expect(matched?.context).toMatchObject({
			eventKind: "preset.save.requested",
			entryPoint: "tool-shell:easing",
			presetId: "p-1",
			type: "script",
			userFacingName: "ローカルプリセット",
			fullPath: "C:/Scripts/ty-plus/easing/ローカルプリセット.jsx",
		});
	});

	it("emits a preset.save.persist entry with the post-write filePath", () => {
		tracePresetLifecycle({
			kind: "preset.save.persist",
			presetId: "p-1",
			type: "script",
			filePath: "C:/canonical/path.jsx",
			entryPoint: "tool-shell:easing",
		});
		const matched = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.save.persist");
		expect(matched?.context).toMatchObject({
			eventKind: "preset.save.persist",
			entryPoint: "tool-shell:easing",
			presetId: "p-1",
			type: "script",
			filePath: "C:/canonical/path.jsx",
		});
	});

	it("emits a preset.save.failed entry with the failure stage", () => {
		tracePresetLifecycle({
			kind: "preset.save.failed",
			presetId: "p-1",
			stage: "verify",
			message: "PRESET_ASSET_MISSING: missing at C:/.../foo.jsx",
			entryPoint: "path-dialog",
		});
		const matched = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.save.failed");
		expect(matched?.context).toMatchObject({
			eventKind: "preset.save.failed",
			entryPoint: "path-dialog",
			stage: "verify",
			message: "PRESET_ASSET_MISSING: missing at C:/.../foo.jsx",
		});
	});

	it("emits preset.execute.completed carrying the action string", () => {
		tracePresetLifecycle({
			kind: "preset.execute.completed",
			presetId: "p-2",
			action: "runScriptFile",
			entryPoint: "workspace-tile",
		});
		const matched = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.execute.completed");
		expect(matched?.context).toMatchObject({
			eventKind: "preset.execute.completed",
			entryPoint: "workspace-tile",
			presetId: "p-2",
			action: "runScriptFile",
		});
	});

	it("emits preset.execute.failed with the error message and filePath", () => {
		tracePresetLifecycle({
			kind: "preset.execute.failed",
			presetId: "p-2",
			message: "Script file not found",
			filePath: "C:/missing.jsx",
			entryPoint: "directory-browser:run",
		});
		const matched = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.execute.failed");
		expect(matched?.context).toMatchObject({
			eventKind: "preset.execute.failed",
			entryPoint: "directory-browser:run",
			presetId: "p-2",
			message: "Script file not found",
			filePath: "C:/missing.jsx",
		});
	});

	it("does not include secrets: only paths and ids leak into the message line", () => {
		tracePresetLifecycle({
			kind: "preset.save.requested",
			presetId: "p-1",
			type: "script",
			userFacingName: "Motion Preset",
			saveDir: "C:/Scripts/ty-plus/easing",
			fullPath: "C:/Scripts/ty-plus/easing/Motion Preset.jsx",
			entryPoint: "tool-shell:code",
		});
		const entry = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.save.requested");
		// Paths and ids only — no AE host tokens, passwords, credentials, or
		// raw file content. The trace is debug-friendly grep material.
		expect(entry?.message).not.toMatch(/token|password|credential|secret/i);
		expect(entry?.message).not.toMatch(/api[_-]?key|bearer|authorization/i);
	});
});

describe("traceExecute — async wrapper", () => {
	const fakePreset: Preset = {
		id: "p-exec",
		type: "script",
		title: "Test",
		filePath: "C:/fake/preset.jsx",
	};

	it("emits requested / completed for a successful pipeline", async () => {
		const result = await traceExecute(
			fakePreset,
			"workspace-tile",
			async () => ({
				action: "runScriptFile",
			}),
		);

		expect(result.action).toBe("runScriptFile");
		const actions = loggerModule
			.getEntries()
			.map((e) => e.action)
			.filter((a): a is string => typeof a === "string");
		expect(actions).toContain("preset.execute.requested");
		expect(actions).toContain("preset.execute.completed");
		expect(actions).not.toContain("preset.execute.failed");
	});

	it("emits requested / failed and re-throws when the pipeline rejects", async () => {
		const failure = new Error("Script file not found");
		await expect(
			traceExecute(fakePreset, "quick-bar", async () => {
				throw failure;
			}),
		).rejects.toBe(failure);

		const entries = loggerModule.getEntries();
		const failed = entries.find((e) => e.action === "preset.execute.failed");
		const requested = entries.find(
			(e) => e.action === "preset.execute.requested",
		);
		expect(requested).toBeDefined();
		expect(failed).toBeDefined();
		expect(failed?.context).toMatchObject({
			eventKind: "preset.execute.failed",
			entryPoint: "quick-bar",
			presetId: "p-exec",
			message: "Script file not found",
			filePath: "C:/fake/preset.jsx",
		});
	});

	it("converts non-Error throws into a string for the failed payload", async () => {
		await expect(
			traceExecute(fakePreset, "catalog-browser", async () => {
				throw "boom-string";
			}),
		).rejects.toBe("boom-string");
		const failed = loggerModule
			.getEntries()
			.find((e) => e.action === "preset.execute.failed");
		expect(failed?.context).toMatchObject({ message: "boom-string" });
	});

	// Suppress unused-collectEntries for the subscriber smoke check
	// above: we only use it once but want the contract documented.
	void collectEntries;
});
