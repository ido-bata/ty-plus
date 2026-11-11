// @vitest-environment happy-dom
/**
 * Behavioral coverage for the `releaseGroupPreset` helper (Issue #86).
 *
 * The helper is invoked from both the right-click menu
 * (`CTX_MENU_IDS.releaseGroupPreset`) and the group-tile drag-out path
 * (Direction C, wired in `workspace/hook.ts`). Spinning up the full
 * workspace runtime for these tests is impractical; instead the helper
 * is dependency-injected so we can verify the exact sequence of side
 * effects (remove → broadcast) without touching `groups.json` or the
 * CEP transport.
 */
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
	type ReleaseGroupDropPlacement,
	releaseDropPlacementFromState,
	releaseGroupPreset,
} from "@/management/preset/group/group-release";
import type { SurfaceState } from "@/management/workspace/state";

const baseState: Pick<SurfaceState, "surfaceTiles" | "groupCatalogEntries"> = {
	surfaceTiles: [
		{ id: "preset-a", x: 0, y: 0, width: 1, height: 1 },
		{ id: "preset-b", x: 1, y: 0, width: 1, height: 1 },
		{ id: "preset-c", x: 2, y: 0, width: 1, height: 1 },
		{
			id: "group-1",
			x: 10,
			y: 10,
			width: 3,
			height: 1,
		},
	],
	groupCatalogEntries: [
		{
			id: "group-1",
			title: "My Group",
			presetIds: ["preset-a", "preset-b", "preset-c"],
		},
	],
};

describe("releaseGroupPreset (orchestration)", () => {
	let removeGroupEntryMock: Mock<
		(win: Window, groupId: string) => Promise<void>
	>;
	let notifyMock: Mock<
		(
			win: Window,
			input: {
				sourceSurfaceId: string;
				catalogRefIds: readonly string[];
				dropPlacement?: ReleaseGroupDropPlacement;
			},
		) => Promise<void>
	>;
	let order: string[];

	beforeEach(() => {
		order = [];
		removeGroupEntryMock = vi.fn(async () => {
			order.push("removeGroupEntry");
		});
		notifyMock = vi.fn(async () => {
			order.push("notifyPanelsAfterPresetSave");
		});
	});

	it("removes the group entry before broadcasting, with members in source order", async () => {
		const result = await releaseGroupPreset(
			{
				window,
				panelId: "panel-1",
				removeGroupEntryFn: removeGroupEntryMock,
				notifyPanelsAfterPresetSaveFn: notifyMock,
			},
			{
				state: baseState,
				groupId: "group-1",
			},
		);

		expect(result).toEqual(["preset-a", "preset-b", "preset-c"]);
		expect(removeGroupEntryMock).toHaveBeenCalledTimes(1);
		expect(removeGroupEntryMock.mock.calls[0]?.[1]).toBe("group-1");
		expect(notifyMock).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["removeGroupEntry", "notifyPanelsAfterPresetSave"]);
	});

	it("forwards the group's tile rect as dropPlacement when provided", async () => {
		const dropPlacement: ReleaseGroupDropPlacement = {
			x: 10,
			y: 10,
			width: 3,
			height: 1,
		};
		await releaseGroupPreset(
			{
				window,
				panelId: "panel-1",
				removeGroupEntryFn: removeGroupEntryMock,
				notifyPanelsAfterPresetSaveFn: notifyMock,
			},
			{
				state: baseState,
				groupId: "group-1",
				dropPlacement,
			},
		);

		const call = notifyMock.mock.calls[0]?.[1] as {
			dropPlacement: ReleaseGroupDropPlacement;
		};
		expect(call.dropPlacement).toEqual({
			x: 10,
			y: 10,
			width: 3,
			height: 1,
		});
	});

	it("omits notify when the group has no members (e.g. a brand-new empty group)", async () => {
		const emptyGroupState: typeof baseState = {
			surfaceTiles: [{ id: "group-empty", x: 0, y: 0, width: 1, height: 1 }],
			groupCatalogEntries: [
				{ id: "group-empty", title: "Empty", presetIds: [] },
			],
		};
		const result = await releaseGroupPreset(
			{
				window,
				panelId: "panel-1",
				removeGroupEntryFn: removeGroupEntryMock,
				notifyPanelsAfterPresetSaveFn: notifyMock,
			},
			{ state: emptyGroupState, groupId: "group-empty" },
		);
		expect(result).toEqual([]);
		expect(removeGroupEntryMock).toHaveBeenCalledTimes(1);
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it("returns an empty list and skips both side effects when groupId is empty", async () => {
		const result = await releaseGroupPreset(
			{
				window,
				panelId: "panel-1",
				removeGroupEntryFn: removeGroupEntryMock,
				notifyPanelsAfterPresetSaveFn: notifyMock,
			},
			{ state: baseState, groupId: "   " },
		);
		expect(result).toEqual([]);
		expect(removeGroupEntryMock).not.toHaveBeenCalled();
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it("propagates persistence errors from removeGroupEntry and skips notify", async () => {
		const err = new Error("disk write failed");
		removeGroupEntryMock.mockRejectedValueOnce(err);
		await expect(
			releaseGroupPreset(
				{
					window,
					panelId: "panel-1",
					removeGroupEntryFn: removeGroupEntryMock,
					notifyPanelsAfterPresetSaveFn: notifyMock,
				},
				{ state: baseState, groupId: "group-1" },
			),
		).rejects.toBe(err);
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it("propagates broadcast errors from notifyPanelsAfterPresetSave", async () => {
		const err = new Error("transport failed");
		notifyMock.mockRejectedValueOnce(err);
		await expect(
			releaseGroupPreset(
				{
					window,
					panelId: "panel-1",
					removeGroupEntryFn: removeGroupEntryMock,
					notifyPanelsAfterPresetSaveFn: notifyMock,
				},
				{ state: baseState, groupId: "group-1" },
			),
		).rejects.toBe(err);
		// remove happened, then notify attempted
		expect(removeGroupEntryMock).toHaveBeenCalledTimes(1);
		expect(notifyMock).toHaveBeenCalledTimes(1);
	});

	it("deduplicates and trims member ids before broadcasting", async () => {
		const noisyState: typeof baseState = {
			surfaceTiles: [],
			groupCatalogEntries: [
				{
					id: "group-1",
					title: "Noisy",
					presetIds: ["preset-a", "  preset-a  ", "preset-b", ""],
				},
			],
		};
		await releaseGroupPreset(
			{
				window,
				panelId: "panel-1",
				removeGroupEntryFn: removeGroupEntryMock,
				notifyPanelsAfterPresetSaveFn: notifyMock,
			},
			{ state: noisyState, groupId: "group-1" },
		);
		const call = notifyMock.mock.calls[0]?.[1] as {
			catalogRefIds: readonly string[];
		};
		expect(call.catalogRefIds).toEqual(["preset-a", "preset-b"]);
	});

	it("trims the input groupId before lookup and writes", async () => {
		await releaseGroupPreset(
			{
				window,
				panelId: "panel-1",
				removeGroupEntryFn: removeGroupEntryMock,
				notifyPanelsAfterPresetSaveFn: notifyMock,
			},
			{ state: baseState, groupId: "  group-1  " },
		);
		expect(removeGroupEntryMock.mock.calls[0]?.[1]).toBe("group-1");
		const call = notifyMock.mock.calls[0]?.[1] as {
			catalogRefIds: readonly string[];
		};
		expect(call.catalogRefIds).toEqual(["preset-a", "preset-b", "preset-c"]);
	});

	it("uses sourceSurfaceId equal to deps.panelId in the broadcast", async () => {
		await releaseGroupPreset(
			{
				window,
				panelId: "panel-7",
				removeGroupEntryFn: removeGroupEntryMock,
				notifyPanelsAfterPresetSaveFn: notifyMock,
			},
			{ state: baseState, groupId: "group-1" },
		);
		const call = notifyMock.mock.calls[0]?.[1] as {
			sourceSurfaceId: string;
		};
		expect(call.sourceSurfaceId).toBe("panel-7");
	});
});

describe("releaseDropPlacementFromState", () => {
	it("returns the group's surface tile rect when both group and tile are present", () => {
		const placement = releaseDropPlacementFromState(baseState, "group-1");
		expect(placement).toEqual({
			x: 10,
			y: 10,
			width: 3,
			height: 1,
		});
	});

	it("returns undefined when the group has no surface tile", () => {
		const noTile: typeof baseState = {
			surfaceTiles: [],
			groupCatalogEntries: [
				{ id: "ghost-group", title: "Ghost", presetIds: ["x"] },
			],
		};
		expect(
			releaseDropPlacementFromState(noTile, "ghost-group"),
		).toBeUndefined();
	});

	it("returns undefined when the group is unknown", () => {
		expect(
			releaseDropPlacementFromState(baseState, "no-such-group"),
		).toBeUndefined();
	});

	it("returns undefined for an empty groupId", () => {
		expect(releaseDropPlacementFromState(baseState, "  ")).toBeUndefined();
	});
});
