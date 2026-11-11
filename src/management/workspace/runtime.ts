/**
 * Host execution module — CEP executor, preset execution, ExtendScript calls.
 *
 * F3: extracted from hook.ts
 */

import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import type { HostId } from "@/management/ae/host/contract";
import { createAdapter } from "@/management/ae/host-bridge";
import type { Preset } from "@/management/preset/contract";
import { executePresetOnHost } from "@/management/preset/execution/pipeline";

const hostIdFromCepCode = (_hostCode: string): HostId => "after-effects";

/**
 * Executes a preset for a window.
 */
export const executeWorkspacePresetForWindow = async (
	_window: Window,
	_hostCode: string,
	preset: Pick<Preset, "id" | "type" | "filePath">,
): Promise<{ action: string }> => {
	const hostId = hostIdFromCepCode(_hostCode);
	const caller = createCepHostExecutor(_window, hostId);
	const host = createAdapter({ caller });
	const execution = await executePresetOnHost(host, preset);
	return { action: execution.action };
};
