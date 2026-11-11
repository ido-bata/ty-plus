/**
 * Script (.jsx) preset operation — Wave 1 C2
 *
 * Owns the host call for script-type presets.
 * Registered via `definePresetOperation` from the operations aggregator.
 */
import { definePresetOperation } from "../operation-contract";

definePresetOperation("script", async (host, preset) => {
	await host.runScriptFile(preset.filePath);
	return { action: "runScriptFile" };
});
