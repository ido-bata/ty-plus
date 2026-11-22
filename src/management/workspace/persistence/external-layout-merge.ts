/**
 * Owner-panel layout merge for `workspace-N.json` (Issue #200, ADR-0006 §4).
 *
 * The panel that owns `workspace-N.json` is the authority for the tiles in
 * its own state, but external writers (dialog appends, preset/group
 * removal, inter-panel moves, restores) may have added or removed tiles
 * on disk while this panel's state was stale. A bare `serialize(state)`
 * overwrite loses those external changes; this module computes the merge
 * inside the persistence lock:
 *
 *   - adopted        = on disk, absent from `lastPersistedIds` and state
 *                      → external addition; kept and reflected into state
 *   - externallyRemoved = in `lastPersistedIds`, absent on disk
 *                      → external removal; dropped from the write and,
 *                        when still present in state, from state too
 *   - everything else → state wins (the owner is authoritative for its
 *                      own tiles' membership and geometry)
 *
 * `lastPersistedIds` is the id set this panel actually wrote on its last
 * successful persist (or loaded at boot). It is what makes "the user
 * deleted this tile" distinguishable from "someone else removed it": a
 * locally deleted tile is absent from state but still on disk, so it is
 * neither adopted nor externally removed — it simply is not written.
 */

import type { LayoutItem } from "@/management/workspace/layout/grid-document";
import type { Tile } from "@/management/workspace/surface/tiles";

export type ExternalLayoutMerge = {
	/** Tiles to serialize into `workspace-N.json`. */
	readonly tilesToWrite: Tile[];
	/** Tiles adopted from disk (external additions), in disk order. */
	readonly adoptedTiles: Tile[];
	/** Ids removed externally that were still present in state. */
	readonly removedTileIds: string[];
	/** Id set to record as `lastPersistedIds` after a successful write. */
	readonly nextLastPersistedIds: ReadonlySet<string>;
};

const cellToTile = (cell: LayoutItem): Tile | null => {
	const id = String(cell.id ?? "").trim();
	if (!id) return null;
	return {
		id,
		x: cell.x,
		y: cell.y,
		width: cell.width,
		height: cell.height,
	};
};

export const mergeOwnerLayoutWithDisk = (input: {
	/** `gridCells` freshly read from `workspace-N.json` inside the lock. */
	readonly diskCells: readonly LayoutItem[];
	/** Ids this panel wrote (or loaded) on its previous persist. */
	readonly lastPersistedIds: ReadonlySet<string>;
	/** Current in-memory surface tiles (the owner's authority). */
	readonly stateTiles: readonly Tile[];
}): ExternalLayoutMerge => {
	const diskTiles: Tile[] = [];
	const diskIds = new Set<string>();
	for (const cell of input.diskCells) {
		const tile = cellToTile(cell);
		if (!tile || diskIds.has(tile.id)) continue;
		diskIds.add(tile.id);
		diskTiles.push(tile);
	}

	const stateIds = new Set<string>();
	for (const tile of input.stateTiles) {
		const id = String(tile?.id ?? "").trim();
		if (id) stateIds.add(id);
	}

	const adoptedTiles: Tile[] = [];
	const adoptedIds = new Set<string>();
	for (const tile of diskTiles) {
		if (
			!input.lastPersistedIds.has(tile.id) &&
			!stateIds.has(tile.id) &&
			!adoptedIds.has(tile.id)
		) {
			adoptedIds.add(tile.id);
			adoptedTiles.push(tile);
		}
	}

	const externallyRemovedIds = new Set<string>();
	const removedTileIds: string[] = [];
	for (const id of input.lastPersistedIds) {
		if (diskIds.has(id)) continue;
		externallyRemovedIds.add(id);
		if (stateIds.has(id)) removedTileIds.push(id);
	}

	const tilesToWrite: Tile[] = [];
	const writtenIds = new Set<string>();
	for (const tile of input.stateTiles) {
		const id = String(tile?.id ?? "").trim();
		if (!id || externallyRemovedIds.has(id) || writtenIds.has(id)) continue;
		writtenIds.add(id);
		tilesToWrite.push(tile);
	}
	for (const tile of adoptedTiles) {
		if (writtenIds.has(tile.id)) continue;
		writtenIds.add(tile.id);
		tilesToWrite.push(tile);
	}

	return {
		tilesToWrite,
		adoptedTiles,
		removedTileIds,
		nextLastPersistedIds: writtenIds,
	};
};

/**
 * Ids present in `tiles` — used to seed `lastPersistedIds` at boot from
 * the layout the panel loaded, so the first persist already knows what
 * it "owns" on disk.
 */
export const tileIdsOf = (tiles: readonly Tile[]): ReadonlySet<string> => {
	const ids = new Set<string>();
	for (const tile of tiles) {
		const id = String(tile?.id ?? "").trim();
		if (id) ids.add(id);
	}
	return ids;
};
