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

import { definePresetOperation } from "../operation-contract";

definePresetOperation("footage", async (host, preset) => {
	await host.addFootage({ filePath: preset.filePath, toComp: true });
	return { action: "addFootage" };
});
