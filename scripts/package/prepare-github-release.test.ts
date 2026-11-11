import { describe, expect, it } from "vitest";
import { resolveReleaseAssetNames } from "./prepare-github-release";

describe("GitHub Release asset naming", () => {
	it.each([
		["0.11.0", "stable"],
		["0.11.0-beta.1", "beta"],
		["0.11.0-insider.2", "insider"],
	] as const)("derives %s channel metadata", (version, channel) => {
		const windows = resolveReleaseAssetNames(version, "windows");
		const macos = resolveReleaseAssetNames(version, "macos");
		expect(windows.channel).toBe(channel);
		expect(macos.channel).toBe(channel);
		expect(windows.tag).toBe("v" + version);
		expect(windows.zxp).toBe("ty-plus-v" + version + "-windows.zxp");
		expect(macos.zip).toBe("ty-plus-v" + version + "-macos.zip");
		expect(windows.manifest).not.toBe(macos.manifest);
	});
	it.each(["0.11", "0.11.0-rc.1", "0.11.0-insider", "0.11.0-beta.01"])(
		"rejects malformed release identity %s",
		(value) => expect(() => resolveReleaseAssetNames(value, "windows")).toThrow(),
	);
});
