/**
 * Unit tests for `mergeOwnerLayoutWithDisk` (Issue #200, ADR-0006 §4).
 *
 * The merge is what lets the owning panel persist its own state without
 * resurrecting user deletions or dropping external writers' additions:
 *
 *   - external add     = on disk, in neither `lastPersistedIds` nor state
 *                        → adopted into the write AND into state
 *   - external remove  = in `lastPersistedIds`, absent on disk
 *                        → dropped from the write and from state
 *   - owner delete     = in `lastPersistedIds` + disk, absent from state
 *                        → simply not written (no resurrection)
 *   - owner edit       = in all three → state wins (geometry included)
 */

import { describe, expect, it } from "vitest";
import type { LayoutItem } from "@/management/workspace/layout/grid-document";
import { mergeOwnerLayoutWithDisk, tileIdsOf } from "./external-layout-merge";

const cell = (id: string, x = 0, y = 0): LayoutItem => ({
	id,
	x,
	y,
	width: 2,
	height: 2,
});

const ids = (tiles: readonly { id: string }[]): string[] =>
	tiles.map((t) => t.id);

describe("mergeOwnerLayoutWithDisk", () => {
	it("adopts tiles an external writer added to disk", () => {
		const merge = mergeOwnerLayoutWithDisk({
			diskCells: [cell("own-a"), cell("ext-b", 4)],
			lastPersistedIds: new Set(["own-a"]),
			stateTiles: [cell("own-a")],
		});
		expect(ids(merge.tilesToWrite)).toEqual(["own-a", "ext-b"]);
		expect(ids(merge.adoptedTiles)).toEqual(["ext-b"]);
		expect(merge.removedTileIds).toEqual([]);
		expect([...merge.nextLastPersistedIds].sort()).toEqual(["ext-b", "own-a"]);
	});

	it("does not resurrect a tile the owner deleted", () => {
		const merge = mergeOwnerLayoutWithDisk({
			diskCells: [cell("own-a"), cell("own-b")],
			lastPersistedIds: new Set(["own-a", "own-b"]),
			// The user removed own-b in state; it is still on disk because
			// this merge runs BEFORE the write.
			stateTiles: [cell("own-a")],
		});
		expect(ids(merge.tilesToWrite)).toEqual(["own-a"]);
		expect(merge.adoptedTiles).toEqual([]);
		expect(merge.removedTileIds).toEqual([]);
	});

	it("honours an external removal of a tile still in state", () => {
		const merge = mergeOwnerLayoutWithDisk({
			diskCells: [cell("own-a")],
			lastPersistedIds: new Set(["own-a", "own-b"]),
			stateTiles: [cell("own-a"), cell("own-b", 4)],
		});
		// own-b was on disk last persist, is gone now → external removal:
		// it must NOT be rewritten and must leave state.
		expect(ids(merge.tilesToWrite)).toEqual(["own-a"]);
		expect(merge.removedTileIds).toEqual(["own-b"]);
	});

	it("lets state win geometry for tiles present on both sides", () => {
		const merge = mergeOwnerLayoutWithDisk({
			diskCells: [cell("own-a", 0, 0)],
			lastPersistedIds: new Set(["own-a"]),
			stateTiles: [cell("own-a", 9, 9)],
		});
		expect(merge.tilesToWrite[0]).toMatchObject({ x: 9, y: 9 });
		expect(merge.adoptedTiles).toEqual([]);
	});

	it("keeps an owner-new tile that is not yet on disk", () => {
		const merge = mergeOwnerLayoutWithDisk({
			diskCells: [cell("own-a")],
			lastPersistedIds: new Set(["own-a"]),
			stateTiles: [cell("own-a"), cell("own-new", 8)],
		});
		expect(ids(merge.tilesToWrite)).toEqual(["own-a", "own-new"]);
		expect(merge.adoptedTiles).toEqual([]);
	});

	it("adopts every unknown disk tile when the baseline is empty", () => {
		// First persist after a restore that saw no prior writes: anything
		// on disk that state does not know is treated as external.
		const merge = mergeOwnerLayoutWithDisk({
			diskCells: [cell("disk-only")],
			lastPersistedIds: new Set(),
			stateTiles: [],
		});
		expect(ids(merge.tilesToWrite)).toEqual(["disk-only"]);
		expect(ids(merge.adoptedTiles)).toEqual(["disk-only"]);
	});

	it("dedupes repeated disk ids", () => {
		const merge = mergeOwnerLayoutWithDisk({
			diskCells: [cell("dup"), cell("dup", 4)],
			lastPersistedIds: new Set(),
			stateTiles: [],
		});
		expect(ids(merge.tilesToWrite)).toEqual(["dup"]);
	});
});

describe("tileIdsOf", () => {
	it("collects trimmed non-empty ids", () => {
		expect([...tileIdsOf([cell(" a "), cell(""), cell("b")])].sort()).toEqual([
			"a",
			"b",
		]);
	});
});
