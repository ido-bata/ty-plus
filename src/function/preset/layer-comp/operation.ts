/**
 * Plugin (.aex/.plugin) preset operation — Wave 1 C4
 *
 * Owns the host call for plugin type.
 *
 * The matchName is resolved from the candidates cache (PICA resource),
 * never from the filename stem — After Effects stores the true matchName
 * in the plugin resource and a stem-derived id raises a PropertyGroup
 * error or silently no-ops (issue #191 audit).
 *
 * Read from: management/ae/host/contract.ts (HostAdapter)
 * Owns: src/function/preset/layer-comp/operation.ts
 */

import { resolveEffectMatchName } from "@/management/storage/candidates-cache/plugin-match-name";
import { getCandidatesSnapshot } from "@/management/storage/candidates-cache/runtime";
import { definePresetOperation } from "../operation-contract";

definePresetOperation("plugin", async (host, preset) => {
	const snapshot = getCandidatesSnapshot();
	const matchName = resolveEffectMatchName(
		preset.filePath,
		snapshot?.pluginEffects ?? [],
	);
	await host.applyEffectByMatchName(matchName);
	return { action: "applyEffectByMatchName" };
});
