import { describe, expect, it } from "vitest";
import {
	isPrereleaseChannel,
	parseReleaseVersion,
	releaseAssetNames,
} from "./release-version";

describe("GitHub Release asset naming", () => {
	it.each([
		["0.11.0", "stable", false],
		["0.11.0-beta.1", "beta", true],
		["0.11.0-insider.2", "insider", true],
	] as const)("derives %s channel metadata", (version, channel, prerelease) => {
		const parsed = parseReleaseVersion(version);
		if (!parsed) throw new Error("fixture must parse");
		const windows = releaseAssetNames(parsed, "windows");
		const macos = releaseAssetNames(parsed, "macos");
		expect(parsed.channel).toBe(channel);
		expect(parsed.tag).toBe(`v${version}`);
		expect(windows.zxp).toBe(`ty-plus-v${version}-windows.zxp`);
		expect(macos.zip).toBe(`ty-plus-v${version}-macos.zip`);
		expect(windows.manifest).not.toBe(macos.manifest);
		// The GitHub `prerelease` flag is a derived property of the channel, not
		// an independent input an operator can set inconsistently.
		expect(isPrereleaseChannel(parsed.channel)).toBe(prerelease);
	});

	it.each(["0.11", "0.11.0-rc.1", "0.11.0-insider", "0.11.0-beta.01"])(
		"rejects malformed release identity %s",
		(value) => expect(parseReleaseVersion(value)).toBeNull(),
	);
});
