/**
 * Preset (.ffx) operation — Wave 1 C1
 *
 * Owns the execution logic for .ffx/preset type presets.
 * Encodes the host call for applying a preset file to the After Effects timeline.
 *
 * Owned path: src/function/preset/animation/operation.ts
 * Registered via: src/function/preset/operations/index.ts (append-only)
 */

import type { PresetOperationResult } from "../operation-contract";
import { definePresetOperation } from "../operation-contract";

definePresetOperation("preset", async (host, preset) => {
	await host.applyPreset(preset.filePath);
	const result: PresetOperationResult<"applyPreset"> = {
		action: "applyPreset",
	};
	return result;
});
