/**
 * Multiple "Add preset" tool surfaces share one HTML bundle but need distinct
 * CEP Extension Ids so several modeless windows can exist at once.
 *
 * @see cep.config.ts panels `dialog-preset-add`, `dialog-preset-add-2`, …
 */

/** Includes `dialog-preset-add` (slot 1) and `dialog-preset-add-2` … (manifest names). */
const PRESET_ADD_DIALOG_POOL_SIZE = 8 as const;

const BASE_EXTENSION_ID = "app.ty-plus.dialog-preset-add";

export const PRESET_ADD_TOOL_POOL_EXTENSION_IDS: readonly string[] = (() => {
	const ids: string[] = [BASE_EXTENSION_ID];
	for (let i = 2; i <= PRESET_ADD_DIALOG_POOL_SIZE; i += 1) {
		ids.push(`${BASE_EXTENSION_ID}-${i}`);
	}
	return ids;
})();

let nextPresetAddSlot = 0;

/** Round-robin across manifest slots so repeated opens get new windows until the pool wraps. */
export function allocatePresetAddToolExtensionId(): string {
	const pool = PRESET_ADD_TOOL_POOL_EXTENSION_IDS;
	const id = pool[nextPresetAddSlot % pool.length] ?? pool[0];
	nextPresetAddSlot += 1;
	return id;
}

export function isPresetAddPoolExtensionId(extensionId: string): boolean {
	return PRESET_ADD_TOOL_POOL_EXTENSION_IDS.includes(extensionId);
}
