/**
 * Quick Bar / Quick Actions preset dispatcher — Issue #130.
 *
 * Routes a palette preset-row click through the canonical execute
 * pipeline (`executeWorkspacePresetForWindow`) so Quick Bar reaches the
 * same call surface as the workspace tile, Directory Browser, Catalog
 * Browser, and Edit Dialog.
 *
 * Trace entry-point discriminator is `"quick-bar"` — picked up by the
 * `preset.execute.*` lifecycle events emitted through `traceExecute`.
 */
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import { traceExecute } from "@/management/preset/execution/lifecycle-trace";
import { getPreset } from "@/management/preset/use-cases";
import { executeWorkspacePresetForWindow } from "@/management/workspace/runtime";

export const executeQuickActionPreset = async (
	win: Window,
	presetId: string,
): Promise<void> => {
	const preset = await getPreset(presetId);
	if (!preset) {
		return;
	}
	await traceExecute(preset, "quick-bar", () =>
		executeWorkspacePresetForWindow(win, detectCepHostCode(), preset),
	);
};
