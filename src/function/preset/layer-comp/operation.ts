/**
 * Plugin (.aex) preset operation — Wave 1 C4
 *
 * Owns the host call for plugin type.
 * Archive behavior applies the file-stem effect id directly.
 *
 * Read from: management/ae/host/contract.ts (HostAdapter)
 * Owns: src/function/preset/layer-comp/operation.ts
 */

import { fileStemFromPath } from "@/shared/util/path";
import { definePresetOperation } from "../operation-contract";

definePresetOperation("plugin", async (host, preset) => {
	const effectId = fileStemFromPath(preset.filePath).trim();
	if (!effectId) {
		throw new Error(`effectId is required for plugin: ${preset.filePath}`);
	}
	await host.applyEffectByMatchName(effectId);
	return { action: "applyEffectByMatchName" };
});
