import { describe, expect, it } from "vitest";

import { presetActionForRecord } from "./pipeline";

describe("presetActionForRecord", () => {
	it("maps script presets to the ExtendScript function name", () => {
		expect(
			presetActionForRecord({
				type: "script",
				filePath: "C:\\demo\\tool.jsx",
			}),
		).toBe("runScriptFile");
	});

	it("maps ffx presets to the ExtendScript function name", () => {
		expect(
			presetActionForRecord({
				type: "preset",
				filePath: "C:\\demo\\move.ffx",
			}),
		).toBe("applyPreset");
	});

	it("maps plugin presets to effect application", () => {
		expect(
			presetActionForRecord({
				type: "plugin",
				filePath:
					"/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/My.plugin",
			}),
		).toBe("applyEffectByMatchName");
	});
});
