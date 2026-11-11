import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "@/management/setting/models/settings";

const readLocatorSupportBrowseRoot = vi.fn();
const readPersistedPathsDocument = vi.fn();
const resolvePersistedSupportBrowseRoot = vi.fn();

vi.mock("./resolve-persisted-paths", () => ({
	readLocatorSupportBrowseRoot,
	readPersistedPathsDocument,
	resolvePersistedSupportBrowseRoot,
}));

describe("mergeSettingsPathsFromDisk", () => {
	beforeEach(() => {
		readLocatorSupportBrowseRoot.mockReset();
		readPersistedPathsDocument.mockReset();
		resolvePersistedSupportBrowseRoot.mockReset();
	});

	it("fills supportRoot from locator when settings paths are empty", async () => {
		readLocatorSupportBrowseRoot.mockResolvedValue("D:/chosen/support");
		resolvePersistedSupportBrowseRoot.mockResolvedValue("D:/chosen/support");
		readPersistedPathsDocument.mockResolvedValue({
			presetRoot: "D:/chosen/presets",
		});

		const { mergeSettingsPathsFromDisk } = await import(
			"./merge-settings-paths"
		);
		const merged = await mergeSettingsPathsFromDisk(
			{} as Window,
			DEFAULT_SETTINGS,
			null,
			"{}",
		);

		expect(merged.core.paths.supportRoot).toBe("D:/chosen/support");
		expect(merged.core.paths.presetRoot).toBe("D:/chosen/presets");
	});

	it("prefers paths.json values over locator defaults", async () => {
		readLocatorSupportBrowseRoot.mockResolvedValue("D:/locator");
		resolvePersistedSupportBrowseRoot.mockResolvedValue("D:/locator");
		readPersistedPathsDocument.mockResolvedValue({
			supportRoot: "D:/from-paths-json",
			presetRoot: "D:/presets",
		});

		const { mergeSettingsPathsFromDisk } = await import(
			"./merge-settings-paths"
		);
		const merged = await mergeSettingsPathsFromDisk(
			{} as Window,
			{
				...DEFAULT_SETTINGS,
				core: {
					...DEFAULT_SETTINGS.core,
					paths: { supportRoot: "D:/locator" },
				},
			},
			null,
			null,
		);

		expect(merged.core.paths.supportRoot).toBe("D:/from-paths-json");
	});
});
