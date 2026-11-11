/**
 * Execution pipeline - CEP implementation
 * Owns the bridge between preset operations and the host adapter.
 * The operation ownership contract (INV-5) lives in function/preset/operation-contract.ts.
 */

import { getPresetOperation } from "@/function/preset/operations";
import type { HostAdapter } from "@/management/ae/host/contract";
import type { Preset } from "@/management/preset/contract";

/**
 * Maps a preset descriptor to its corresponding action string.
 * This is a pure synchronous mapping - it does NOT execute the preset.
 */
export const presetActionForRecord = (
	preset: Pick<Preset, "type" | "filePath">,
): string => {
	switch (preset.type) {
		case "script":
			return "runScriptFile";
		case "preset":
			return "applyPreset";
		case "plugin":
			return "applyEffectByMatchName";
		case "footage":
			return "addFootage";
		default:
			return "unknown";
	}
};

/**
 * Executes a preset via the function-owned preset operation.
 * Each preset type in function/preset/<type>/operation.ts owns the host call.
 */
export const executePresetOnHost = async (
	host: HostAdapter,
	preset: Pick<Preset, "type" | "filePath">,
): Promise<{ hostId: HostAdapter["id"]; action: string }> => {
	const result = await getPresetOperation(preset.type)(host, preset);
	return { hostId: host.id, action: result.action };
};
