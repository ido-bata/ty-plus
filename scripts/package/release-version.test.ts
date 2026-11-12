import { describe, expect, it } from "vitest";
import {
	assertReleaseIdentity,
	isPrereleaseChannel,
	parseReleaseTag,
	parseReleaseVersion,
	releaseAssetNames,
	releaseAssetNamesFor,
} from "./release-version";

describe("release version contract", () => {
	it.each([
		["0.11.0", "stable"],
		["0.11.0-beta.1", "beta"],
		["0.11.0-insider.2", "insider"],
	] as const)("parses %s as %s", (releaseVersion, channel) => {
		const parsed = parseReleaseVersion(releaseVersion);
		expect(parsed).not.toBeNull();
		expect(parsed?.channel).toBe(channel);
		expect(parsed?.tag).toBe(`v${releaseVersion}`);
		expect(parsed?.coreVersion).toBe("0.11.0");
	});

	it.each([
		"0.11",
		"v0.11.0",
		"0.11.0-rc.1",
		"0.11.0-insider",
		"0.11.0-beta.01",
		"01.0.0",
		"0.11.0 ",
	])("rejects malformed release identity %s", (value) => {
		expect(parseReleaseVersion(value)).toBeNull();
	});

	it("requires the v prefix for tags and keeps the tag canonical", () => {
		expect(parseReleaseTag("v0.11.0-beta.2")?.releaseVersion).toBe(
			"0.11.0-beta.2",
		);
		expect(parseReleaseTag("0.11.0-beta.2")).toBeNull();
		expect(parseReleaseTag("v0.11.0-rc.1")).toBeNull();
	});
});

describe("release asset naming", () => {
	it("derives platform-unique, tag-scoped names", () => {
		const version = parseReleaseVersion("0.11.0-insider.3");
		if (!version) throw new Error("fixture must parse");
		const windows = releaseAssetNames(version, "windows");
		const macos = releaseAssetNames(version, "macos");
		expect(windows.zip).toBe("ty-plus-v0.11.0-insider.3-windows.zip");
		expect(windows.zxp).toBe("ty-plus-v0.11.0-insider.3-windows.zxp");
		expect(windows.manifest).toBe(
			"ty-plus-v0.11.0-insider.3-windows-release-manifest.json",
		);
		expect(macos.zip).not.toBe(windows.zip);
		expect(releaseAssetNamesFor(version, "windows")).toEqual([
			windows.zip,
			windows.zxp,
			windows.manifest,
		]);
	});

	it("keeps every asset name of one release distinct from another's", () => {
		const first = parseReleaseVersion("0.11.0-beta.1");
		const second = parseReleaseVersion("0.11.0-beta.2");
		if (!first || !second) throw new Error("fixtures must parse");
		const names = new Set([
			...releaseAssetNamesFor(first, "windows"),
			...releaseAssetNamesFor(second, "windows"),
		]);
		expect(names.size).toBe(6);
	});
});

describe("assertReleaseIdentity", () => {
	it("accepts a prerelease sharing the numeric CEP version", () => {
		expect(
			assertReleaseIdentity({
				releaseVersion: "0.11.0-beta.4",
				packageVersion: "0.11.0",
				channel: "beta",
			}).channel,
		).toBe("beta");
	});

	it("rejects a prerelease whose numeric core differs from package.json", () => {
		// CEP's ExtensionBundleVersion is numeric only, so a mismatch cannot be
		// represented in the installed manifest — it must fail before packaging.
		expect(() =>
			assertReleaseIdentity({
				releaseVersion: "0.12.0-beta.1",
				packageVersion: "0.11.0",
			}),
		).toThrow(/numeric version/);
	});

	it("rejects a channel that disagrees with the tag", () => {
		expect(() =>
			assertReleaseIdentity({
				releaseVersion: "0.11.0-beta.1",
				packageVersion: "0.11.0",
				channel: "insider",
			}),
		).toThrow(/disagrees/);
	});

	it("marks only stable as non-prerelease", () => {
		expect(isPrereleaseChannel("stable")).toBe(false);
		expect(isPrereleaseChannel("beta")).toBe(true);
		expect(isPrereleaseChannel("insider")).toBe(true);
	});
});
