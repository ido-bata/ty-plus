/**
 * Pure helpers for the right-click "Duplicate" preset handler in
 * `useWorkspaceRuntime`.
 *
 * The full hook is bound up in CEP, persistence, and bus side effects that are
 * impractical to mock end-to-end. This module isolates the deterministic
 * parts of the Duplicate handler so they can be unit / behavioral tested
 * without dragging in the entire workspace runtime.
 *
 * Public API:
 *
 * - {@link resolveDuplicateHit}: turn a context-menu hit into the source
 *   preset id, the source `Preset` row, and the optional drop placement.
 * - {@link computeNextPresetSelectedIds}: compute the next
 *   `presetSelectedIds` after the duplicate lands.
 * - {@link runDuplicatePreset}: orchestrate the duplicate step (duplicate
 *   → commit → persist → notify), with side effects injected so the test
 *   suite can verify the exact sequence and arguments.
 *
 * The handler in `hook.ts` (`case CTX_MENU_IDS.duplicatePreset`) is the only
 * caller; the orchestration helpers here are dependency-injected so the
 * same code path runs in production and in tests.
 */

import type { ContextHit } from "@/management/dialog/dialogs/unified-context-menu";
import type { Preset } from "@/management/preset/contract";
import type { SurfaceState } from "@/management/workspace/state";
import type { Tile } from "@/management/workspace/surface/tiles";

export type DuplicateDropPlacement = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type ResolveDuplicateHitResult = {
	catalogId: string;
	source: Preset;
	dropPlacement: DuplicateDropPlacement | undefined;
};

/**
 * Resolve the source preset id, the source `Preset` row, and the drop
 * placement from a context-menu hit.
 *
 * - For `workspace-placement` hits, the drop placement is the source tile's
 *   grid rectangle so the duplicate lands at the **same** grid cell.
 * - For `preset-row` hits, `dropPlacement` is `undefined` so the receiving
 *   panel auto-packs the duplicate into the next free cell.
 *
 * Returns `null` when the hit does not resolve to a known preset.
 */
export const resolveDuplicateHit = (
	hit: ContextHit,
	cur: Pick<SurfaceState, "presets" | "surfaceTiles">,
): ResolveDuplicateHitResult | null => {
	let catalogId = "";
	let placementIndex = -1;
	if (hit.zone === "preset-row") {
		catalogId = hit.presetId?.trim() ?? "";
	} else if (hit.zone === "workspace-placement") {
		placementIndex = Number.parseInt(hit.id?.trim() ?? "", 10);
		if (Number.isFinite(placementIndex) && placementIndex >= 0) {
			catalogId = cur.surfaceTiles[placementIndex]?.id?.trim() ?? "";
		}
	}
	if (!catalogId) return null;
	const source = cur.presets.find((p) => p.id === catalogId);
	if (!source) return null;
	let dropPlacement: DuplicateDropPlacement | undefined;
	if (hit.zone === "workspace-placement") {
		const t: Tile | undefined = cur.surfaceTiles[placementIndex];
		if (t) {
			dropPlacement = {
				x: t.x,
				y: t.y,
				width: t.width,
				height: t.height,
			};
		}
	}
	return { catalogId, source, dropPlacement };
};

/**
 * Compute the next `presetSelectedIds` after a Duplicate action.
 *
 * Issue body: the **original** preset keeps its selection highlight; the
 * **new** id becomes the active selection at the head of the list. Every
 * other selected id is preserved; only `newId` is deduplicated (in case the
 * caller had it pre-selected from a prior step).
 *
 * Pure: takes the current ids and the new id, returns a fresh array.
 */
export const computeNextPresetSelectedIds = (
	currentIds: readonly string[],
	newId: string,
): string[] => [newId, ...currentIds.filter((id) => id !== newId)];

export type RunDuplicatePresetDeps = {
	window: Window;
	panelId: string;
	source: Preset;
	newId: string;
	dropPlacement: DuplicateDropPlacement | undefined;
	currentPresetSelectedIds: readonly string[];
	duplicatePresetFn: (source: Preset, newId: string) => Promise<Preset>;
	notifyPanelsAfterPresetSaveFn: (
		win: Window,
		input: {
			sourceSurfaceId: string;
			catalogRefIds: readonly string[];
			dropPlacement?: DuplicateDropPlacement;
		},
	) => Promise<void>;
	commit: (next: { presetSelectedIds: string[] }) => void;
	persistSurfaceState: () => void;
};

/**
 * Run the Duplicate handler end-to-end with side effects injected.
 *
 * Sequence:
 *
 * 1. Call `duplicatePresetFn(source, newId)` to persist the new preset.
 * 2. Commit the next `presetSelectedIds` (new id at head, source id kept).
 * 3. `persistSurfaceState()` to write the workspace JSON.
 * 4. `notifyPanelsAfterPresetSaveFn` to broadcast the duplicate to other
 *    panels, with `dropPlacement` passed through for `workspace-placement`
 *    hits so the receiver honors the source tile's geometry.
 *
 * On any thrown error from step 1 the caller is expected to log; here we
 * just propagate so the caller can wrap with its own try/catch.
 */
export const runDuplicatePreset = async (
	deps: RunDuplicatePresetDeps,
): Promise<Preset> => {
	const created = await deps.duplicatePresetFn(deps.source, deps.newId);
	deps.commit({
		presetSelectedIds: computeNextPresetSelectedIds(
			deps.currentPresetSelectedIds,
			deps.newId,
		),
	});
	deps.persistSurfaceState();
	await deps.notifyPanelsAfterPresetSaveFn(deps.window, {
		sourceSurfaceId: deps.panelId,
		catalogRefIds: [created.id],
		dropPlacement: deps.dropPlacement,
	});
	return created;
};
