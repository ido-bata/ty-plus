/**
 * Plugin (.aex) preset operation — Wave 1 C4
 *
 * Owns the host call for plugin type.
 * Archive behavior applies the file-stem effect id directly.
 *
 * Read from: management/ae/host/contract.ts (HostAdapter)
 * Owns: src/function/preset/layer-comp/operation.ts
 */

import { i18n } from "@/management/i18n/index";
import { fileStemFromPath } from "@/shared/util/path";
import { definePresetOperation } from "../operation-contract";

definePresetOperation("plugin", async (host, preset) => {
	const effectId = fileStemFromPath(preset.filePath).trim();
	if (!effectId) {
		throw new Error(`effectId is required for plugin: ${preset.filePath}`); // i18n-exempt: internal diagnostic — not rendered as UI copy
	}
	await host.applyEffectByMatchName(effectId, {
		undoGroupName: i18n.t(
			"widgets:directoryBrowser.actions.undoGroup.applyEffect",
			{ defaultValue: "Ty Plus: Apply effect" },
		),
	});
	return { action: "applyEffectByMatchName" };
});
