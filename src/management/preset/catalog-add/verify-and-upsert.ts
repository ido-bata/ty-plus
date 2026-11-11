/**
 * Shared post-write verify + local upsert helper.
 *
 * Issue #130 (review #148): `PathDialog.handleAdd` and the tool-shell
 * `Dialog.tsx` save path both gate `upsertLocalPreset` on
 * `assertPresetAssetPresent`, but each rebuilt the call sequence inline.
 * A drift between them meant a future fix to the post-write verify step
 * could land in one surface and miss the other. This module centralizes
 * the verify-then-upsert sequence so both call sites share the same
 * contract.
 *
 * TODO: migrate `src/management/preset/tool-shell/Dialog.tsx` to call
 * this helper instead of inlining `assertPresetAssetPresent` →
 * `upsertLocalPreset`. Until that migration lands, the two surfaces
 * remain manually synchronized; if you change the verify contract here,
 * mirror the change in `Dialog.tsx`.
 */
import { assertPresetAssetPresent } from "@/management/preset/asset-verification";
import type { Preset } from "@/management/preset/contract";
import type { PresetSaveEntryPoint } from "@/management/preset/execution/lifecycle-trace";
import { upsertLocalPreset } from "@/management/preset/use-cases";

/**
 * Verify the asset backing `record` is present on disk, then upsert
 * the local preset. Mirrors the post-write verify step used by
 * `Dialog.tsx` (tool-shell): a missing or unverifiable asset throws
 * before any catalog/workspace record is created, blocking the
 * "ghost preset pointing at a missing path" failure mode.
 */
export const verifyAndUpsertPreset = async (input: {
	win: Window;
	presetId: string;
	record: Preset;
	filePath: string;
	entryPoint: PresetSaveEntryPoint;
}): Promise<void> => {
	await assertPresetAssetPresent({
		win: input.win,
		presetId: input.presetId,
		type: input.record.type,
		filePath: input.filePath,
		entryPoint: input.entryPoint,
	});
	await upsertLocalPreset(input.record);
};
