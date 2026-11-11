/**
 * React hook that subscribes to the preset asset health store.
 *
 * Wraps `subscribePresetAssetHealth` with `useSyncExternalStore` so
 * components re-render on the next paint when lazy verification
 * (`verifySinglePresetAsset`) publishes a transition. Used by the
 * catalog row, icon tile, and quick-action row to disable the run
 * affordance on `missing` and badge `unverifiable` without conflating
 * the two states.
 */

import { useSyncExternalStore } from "react";

import {
	isPresetAssetMissing,
	isPresetAssetUnverifiable,
	type PresetAssetHealth,
	readPresetAssetHealth,
	subscribePresetAssetHealth,
} from "@/management/preset/asset-health";

const subscribe = (listener: () => void): (() => void) =>
	subscribePresetAssetHealth(() => {
		listener();
	});

const getSnapshot = (): PresetAssetHealth => readPresetAssetHealth();

const usePresetAssetHealth = (): PresetAssetHealth =>
	useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** Convenience selector: is this preset ID flagged as missing-on-disk? */
export const useIsPresetAssetMissing = (presetId: string): boolean => {
	usePresetAssetHealth();
	return isPresetAssetMissing(presetId);
};

/** Convenience selector: was the host transport unavailable for this ID? */
export const useIsPresetAssetUnverifiable = (presetId: string): boolean => {
	usePresetAssetHealth();
	return isPresetAssetUnverifiable(presetId);
};
