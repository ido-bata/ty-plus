import { describe, expect, it } from "vitest";
import { planCandidate } from "./build-github-release";

const base = {
	packageVersion: "0.11.0",
	hostPlatform: "darwin" as NodeJS.Platform,
};

describe("GitHub release candidate planning", () => {
	it("maps a prerelease channel to the GitHub prerelease flag", () => {
		const plan = planCandidate({
			...base,
			channel: "insider",
			releaseVersion: "0.11.0-insider.1",
		});
		expect(plan.channel).toBe("insider");
		expect(plan.prerelease).toBe(true);
		expect(plan.platform).toBe("macos");
		expect(plan.assetNames).toEqual([
			"ty-plus-v0.11.0-insider.1-macos.zip",
			"ty-plus-v0.11.0-insider.1-macos.zxp",
			"ty-plus-v0.11.0-insider.1-macos-release-manifest.json",
		]);
	});

	it("marks stable as non-prerelease", () => {
		const plan = planCandidate({
			...base,
			channel: "stable",
			releaseVersion: "0.11.0",
		});
		expect(plan.prerelease).toBe(false);
	});

	it("rejects a channel that disagrees with the tag", () => {
		expect(() =>
			planCandidate({
				...base,
				channel: "insider",
				releaseVersion: "0.11.0-beta.1",
			}),
		).toThrow(/disagrees/);
	});

	it("rejects a release version whose numeric core differs from package.json", () => {
		expect(() =>
			planCandidate({
				...base,
				channel: "beta",
				releaseVersion: "0.12.0-beta.1",
			}),
		).toThrow(/numeric version/);
	});

	it("rejects unsupported hosts instead of guessing a platform", () => {
		expect(() =>
			planCandidate({
				...base,
				hostPlatform: "linux",
				channel: "stable",
				releaseVersion: "0.11.0",
			}),
		).toThrow(/requires Windows or macOS/);
	});

	it("requires an explicit release version", () => {
		expect(() =>
			planCandidate({ ...base, channel: "stable", releaseVersion: undefined }),
		).toThrow(/Usage:/);
	});
});
