import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	getEntries,
} from "@/management/debug/logger";

const storageMocks = vi.hoisted(() => ({
	readNJson: vi.fn<() => Promise<string | null>>(async () => null),
	writeNJson: vi.fn<() => Promise<void>>(async () => undefined),
}));

const rootMock = vi.hoisted(() => ({
	resolve: vi.fn<() => Promise<string | null>>(async () => "/managed/root"),
}));

vi.mock("@/management/storage", () => ({
	indexFromPanelId: () => 2,
	readNJson: storageMocks.readNJson,
	writeNJson: storageMocks.writeNJson,
}));

vi.mock("@/management/workspace/layout/persistence-root", () => ({
	resolveWorkspacePersistenceManagedRoot: rootMock.resolve,
}));

import { tryPersistRemovePresetFromDialog } from "./remove-preset-from-dialog-disk";

const win = {} as Window;

const layoutWith = (...ids: string[]) =>
	JSON.stringify({
		gridCells: ids.map((id, index) => ({
			id,
			x: index,
			y: 0,
			width: 1,
			height: 1,
		})),
	});

describe("tryPersistRemovePresetFromDialog (Issue #183 — failures keep their stage)", () => {
	beforeAll(() => {
		_setDevConsoleEnabled(false);
	});

	beforeEach(() => {
		storageMocks.readNJson.mockReset();
		storageMocks.writeNJson.mockReset();
		rootMock.resolve.mockReset();
		rootMock.resolve.mockResolvedValue("/managed/root");
		storageMocks.writeNJson.mockResolvedValue(undefined);
		_resetBusForTests();
	});

	it("reports `removed` when a tile was actually taken out", async () => {
		storageMocks.readNJson.mockResolvedValue(layoutWith("keep", "gone"));

		const result = await tryPersistRemovePresetFromDialog(win, {
			targetPanelId: "panel-2",
			catalogRefIds: ["gone"],
		});

		expect(result).toEqual({ status: "removed" });
		expect(storageMocks.writeNJson).toHaveBeenCalledTimes(1);
	});

	it("separates 'nothing to do' from 'could not do it'", async () => {
		storageMocks.readNJson.mockResolvedValue(layoutWith("keep"));

		const unchanged = await tryPersistRemovePresetFromDialog(win, {
			targetPanelId: "panel-2",
			catalogRefIds: ["absent"],
		});

		expect(unchanged).toEqual({ status: "unchanged", reason: "not-present" });
		expect(storageMocks.writeNJson).not.toHaveBeenCalled();
	});

	it("names the read stage when the body is not valid JSON, and writes nothing", async () => {
		storageMocks.readNJson.mockResolvedValue("{ not json");

		const result = await tryPersistRemovePresetFromDialog(win, {
			targetPanelId: "panel-2",
			catalogRefIds: ["gone"],
		});

		expect(result).toMatchObject({ status: "failed", stage: "parse-layout" });
		expect(storageMocks.writeNJson).not.toHaveBeenCalled();
	});

	it("names the write stage when the layout cannot be written", async () => {
		storageMocks.readNJson.mockResolvedValue(layoutWith("gone"));
		storageMocks.writeNJson.mockRejectedValue(new Error("disk full"));

		const result = await tryPersistRemovePresetFromDialog(win, {
			targetPanelId: "panel-2",
			catalogRefIds: ["gone"],
		});

		expect(result).toEqual({
			status: "failed",
			stage: "write-layout",
			message: "disk full",
		});
	});

	it("records a failure in the Debug Console instead of swallowing it", async () => {
		storageMocks.readNJson.mockResolvedValue("{ not json");

		await tryPersistRemovePresetFromDialog(win, {
			targetPanelId: "panel-3",
			catalogRefIds: ["gone"],
		});

		const entry = getEntries().find(
			(e) => e.action === "tryPersistRemovePresetFromDialog:failed",
		);
		expect(
			entry,
			"the previous implementation returned false silently",
		).toBeDefined();
		expect(entry?.context).toMatchObject({
			targetPanelId: "panel-3",
			stage: "parse-layout",
		});
	});

	it("treats a missing persistence root as 'nothing to do', not a failure", async () => {
		rootMock.resolve.mockResolvedValue(null);

		const result = await tryPersistRemovePresetFromDialog(win, {
			targetPanelId: "panel-2",
			catalogRefIds: ["gone"],
		});

		expect(result).toEqual({
			status: "unchanged",
			reason: "no-persistence-root",
		});
	});
});
