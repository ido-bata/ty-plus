/**
 * Host execution module — CEP executor, preset execution, ExtendScript calls.
 *
 * F3: extracted from hook.ts
 */

import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import type { HostId } from "@/management/ae/host/contract";
import { createAdapter } from "@/management/ae/host-bridge";
import { notificationStore } from "@/management/online/notification/service";
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
	try {
		const execution = await executePresetOnHost(host, preset);
		return { action: execution.action };
	} catch (error) {
		// Issue #126: preset run failures used to surface only through
		// `SurfaceState.statusMessage`, which no component renders — the
		// failure was silent for the user. Every preset entry point
		// (workspace tile, catalog, directory browser, edit dialog, quick
		// actions) funnels through this function, so the error toast is
		// emitted here once. The error is re-thrown so callers keep their
		// existing statusMessage / logging behavior.
		const message = error instanceof Error ? error.message : String(error);
		notificationStore.add(`Preset failed: ${message}`, "error", {
			duration: 8000,
		});
		throw error;
	}
};
