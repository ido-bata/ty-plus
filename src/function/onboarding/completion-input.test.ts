/**
 * Unit tests for onboarding completion input helpers.
 *
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from "vitest";
import {
	buildPresetCandidates,
	buildSelectedFolderPaths,
	type CompletionInput,
} from "./completion-input";

describe("buildSelectedFolderPaths", () => {
	it("returns empty set when all selections are empty", () => {
		const selectedFolders = {
			presets: new Set<string>(),
			scripts: new Set<string>(),
			plugins: new Set<string>(),
		};
		const result = buildSelectedFolderPaths(selectedFolders);
		expect(result.size).toBe(0);
	});

	it("collects paths from all three categories", () => {
		const selectedFolders = {
			presets: new Set(["C:/Ae/Presets"]),
			scripts: new Set(["C:/Ae/Scripts"]),
			plugins: new Set(["C:/Ae/Plug-ins"]),
		};
		const result = buildSelectedFolderPaths(selectedFolders);
		expect(result.size).toBe(3);
		expect(result.has("C:/Ae/Presets")).toBe(true);
		expect(result.has("C:/Ae/Scripts")).toBe(true);
		expect(result.has("C:/Ae/Plug-ins")).toBe(true);
	});

	it("merges duplicate paths", () => {
		const selectedFolders = {
			presets: new Set(["C:/Ae/Presets", "C:/Shared"]),
			scripts: new Set(["C:/Shared"]),
			plugins: new Set<string>(),
		};
		const result = buildSelectedFolderPaths(selectedFolders);
		expect(result.size).toBe(2);
	});
});

describe("buildPresetCandidates", () => {
	it("returns candidates without scanning when canScanFolders is false", async () => {
		const input: CompletionInput = {
			locale: "en",
			supportRoot: "C:/Ae",
			subfolders: {
				presetRoot: "C:/Ae/Presets",
				scriptRoot: "C:/Ae/Scripts",
				pluginRoot: "C:/Ae/Plug-ins",
			},
			selectedFiles: {
				presets: new Set(["C:/Ae/Presets/MyPreset.ffx"]),
				scripts: new Set<string>(),
				plugins: new Set<string>(),
			},
			selectedFolders: {
				presets: new Set<string>(),
				scripts: new Set<string>(),
				plugins: new Set<string>(),
			},
			canScanFolders: false,
		};

		const candidates = await buildPresetCandidates(input, async () => []);

		expect(candidates.length).toBe(1);
		expect(candidates[0].filePath).toBe("C:/Ae/Presets/MyPreset.ffx");
	});

	it("returns folder candidates when folders are selected without scanning", async () => {
		const input: CompletionInput = {
			locale: "en",
			supportRoot: "C:/Ae",
			subfolders: {
				presetRoot: "C:/Ae/Presets",
				scriptRoot: "C:/Ae/Scripts",
				pluginRoot: "C:/Ae/Plug-ins",
			},
			selectedFiles: {
				presets: new Set<string>(),
				scripts: new Set<string>(),
				plugins: new Set<string>(),
			},
			selectedFolders: {
				presets: new Set(["C:/Ae/Presets/Folder"]),
				scripts: new Set<string>(),
				plugins: new Set<string>(),
			},
			canScanFolders: false,
		};

		const candidates = await buildPresetCandidates(input, async () => []);

		expect(candidates.length).toBe(1);
		expect(candidates[0].type).toBe("group");
		expect(candidates[0].filePath).toBe("C:/Ae/Presets/Folder");
	});
});
