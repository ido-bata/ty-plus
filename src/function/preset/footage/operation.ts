/**
 * Footage preset operation — Wave 1 C3
 *
 * Owns the host call for footage type:
 * - Calls host.addFootage({ filePath, toComp: true })
 * - Returns { action: "addFootage" }
 *
 * Read from: management/ae/host/contract.ts (HostAdapter)
 * Owns: src/function/preset/footage/operation.ts
 */

import { i18n } from "@/management/i18n/index";
import { definePresetOperation } from "../operation-contract";

definePresetOperation("footage", async (host, preset) => {
	await host.addFootage({
		filePath: preset.filePath,
		toComp: true,
		undoGroupName: i18n.t(
			"widgets:directoryBrowser.actions.undoGroup.addFootage",
			{ defaultValue: "Ty Plus: Add Footage" },
		),
	});
	return { action: "addFootage" };
});
