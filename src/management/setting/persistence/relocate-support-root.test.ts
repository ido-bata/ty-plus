import { beforeEach, describe, expect, it, vi } from "vitest";

const pathExistsOnDisk = vi.fn();
const copyDirectoryRecursive = vi.fn();

vi.mock("./copy-directory-recursive", () => ({
	pathExistsOnDisk,
	copyDirectoryRecursive,
}));

describe("relocateTyPlusSupportData", () => {
	beforeEach(() => {
		pathExistsOnDisk.mockReset();
		copyDirectoryRecursive.mockReset();
		pathExistsOnDisk.mockResolvedValue(true);
		copyDirectoryRecursive.mockResolvedValue(undefined);
	});

	it("copies managed ty-plus and legacy data folders", async () => {
		const { relocateTyPlusSupportData } = await import(
			"./relocate-support-root"
		);
		const win = {} as Window;
		await relocateTyPlusSupportData(win, {
			fromSupportRoot: "D:/old",
			toSupportRoot: "D:/new",
		});
		expect(copyDirectoryRecursive).toHaveBeenCalledTimes(2);
		expect(copyDirectoryRecursive).toHaveBeenCalledWith(
			win,
			"D:/old/ty-plus",
			"D:/new/ty-plus",
		);
		expect(copyDirectoryRecursive).toHaveBeenCalledWith(
			win,
			"D:/old/data",
			"D:/new/data",
		);
	});

	it("skips when roots are equal", async () => {
		const { relocateTyPlusSupportData } = await import(
			"./relocate-support-root"
		);
		await relocateTyPlusSupportData({} as Window, {
			fromSupportRoot: "D:/same",
			toSupportRoot: "D:/same",
		});
		expect(copyDirectoryRecursive).not.toHaveBeenCalled();
	});
});
