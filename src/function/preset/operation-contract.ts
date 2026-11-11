/**
 * Execution-ownership contract — Wave 0 C0
 *
 * Each preset type in `function/preset/<type>` owns the operation (which host call and how).
 * Management owns the bridge (HostAdapter) and IO (file read/write).
 * There is no centralized execution Runtime/ExecutionRequest ceremony.
 *
 * Read from: management/ae/host/contract.ts (HostAdapter)
 * Owns: src/function/preset/operation-contract.ts, src/function/preset/operations/index.ts
 */

import type { HostAdapter } from "@/management/ae/host/contract";
import type { PresetType } from "@/management/preset/contract";

/**
 * Result of executing a preset operation.
 * The `action` string describes what was done for history/logging purposes.
 */
export type PresetOperationResult<TAction extends string = string> = {
	action: TAction;
};

/**
 * A preset operation is a function that:
 * - Takes the host bridge and a preset descriptor (type + filePath)
 * - Calls the appropriate HostAdapter method(s) for that preset type
 * - Returns the action label + any additional result data
 *
 * Each preset type in `src/function/preset/<type>/` implements its own operation.
 * Management never classifies by verb/action — it only provides the HostAdapter capability.
 */
export type PresetOperation<THost extends HostAdapter = HostAdapter> = (
	host: THost,
	preset: { type: PresetType; filePath: string },
) => Promise<PresetOperationResult>;

/**
 * Starts EMPTY on purpose. Until a preset type registers its real operation
 * (Wave 1 C1-C4), dispatch FAILS LOUDLY rather than reporting a fake success
 * (which would "execute" a preset without touching the host).
 */
const registry: Partial<Record<PresetType, PresetOperation>> = {};

/**
 * Register a preset operation for a given type.
 * Called by each `src/function/preset/<type>/operation.ts` via `definePresetOperation`.
 */
export function definePresetOperation(
	type: PresetType,
	op: PresetOperation,
): void {
	registry[type] = op;
}

/**
 * Retrieve the registered operation for a preset type.
 * Returns a throwing operation if none is registered (no silent no-op execution).
 */
export function getPresetOperation(type: PresetType): PresetOperation {
	const op = registry[type];
	if (!op) {
		return async () => {
			throw new Error(`No preset operation registered for type: ${type}`);
		};
	}
	return op;
}
