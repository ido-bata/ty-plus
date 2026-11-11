import { describe, expect, it } from "vitest";

import {
	isPresetAddPoolExtensionId,
	PRESET_ADD_TOOL_POOL_EXTENSION_IDS,
} from "./add-dialog-pool";

describe("preset add dialog pool", () => {
	it("lists eight manifest extension ids", () => {
		expect(PRESET_ADD_TOOL_POOL_EXTENSION_IDS).toHaveLength(8);
		expect(PRESET_ADD_TOOL_POOL_EXTENSION_IDS[0]).toBe(
			"app.ty-plus.dialog-preset-add",
		);
		expect(PRESET_ADD_TOOL_POOL_EXTENSION_IDS[7]).toBe(
			"app.ty-plus.dialog-preset-add-8",
		);
	});

	it("detects pool extension ids", () => {
		expect(
			isPresetAddPoolExtensionId("app.ty-plus.dialog-preset-add"),
		).toBe(true);
		expect(
			isPresetAddPoolExtensionId("app.ty-plus.dialog-preset-add-3"),
		).toBe(true);
		expect(
			isPresetAddPoolExtensionId("app.ty-plus.dialog-presets"),
		).toBe(false);
	});
});
