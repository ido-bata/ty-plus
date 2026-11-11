/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import type { PresetRecord } from "../../management/preset/contract";

import {
	resolveOnboardingProjectedPresetIds,
	resolveOnboardingWorkspacePanelRefIds,
} from "./onboarding-import";

describe("onboarding-import preset id resolution", () => {
	it("resolveOnboardingProjectedPresetIds matches catalog rows by filePath", () => {
		const filePreset: PresetRecord = {
			id: "local-file-1",
			type: "preset",
			title: "X",
			filePath: "C:/Ae/Presets/X.ffx",
		};
		const fixtureSansPayload: PresetRecord = {
			id: "preset.control.example",
			type: "script",
			title: "Control example",
			filePath: "C:/Ae/Scripts/center.jsx",
		};

		const ids = resolveOnboardingProjectedPresetIds({
			candidateFilePaths: ["C:/Ae/Presets/X.ffx"],
			allPresets: [fixtureSansPayload, filePreset],
			addedPresetIds: ["local-file-1"],
		});

		expect(ids).toContain("local-file-1");
	});

	it("resolveOnboardingWorkspacePanelRefIds matches candidates by filePath", () => {
		const filePreset: PresetRecord = {
			id: "local-file-1",
			type: "preset",
			title: "X",
			filePath: "C:/Ae/Presets/X.ffx",
		};
		const fixtureSansPayload: PresetRecord = {
			id: "preset.control.other",
			type: "script",
			title: "Cleanup",
			filePath: "C:/Ae/Scripts/cleanup.jsx",
		};

		const panelIds = resolveOnboardingWorkspacePanelRefIds({
			candidates: [
				{
					filePath: "C:/Ae/Presets/X.ffx",
					title: "X",
					type: "preset",
				},
			],
			allPresets: [fixtureSansPayload, filePreset],
		});

		expect(panelIds).toContain("local-file-1");
	});
});
