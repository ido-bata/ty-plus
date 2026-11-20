import { describe, expect, it } from "vitest";
import {
	classifyChannel,
	findLatestStable,
	type ReleaseInfo,
	zxpAsset,
} from "./releases";

function release(overrides: Partial<ReleaseInfo>): ReleaseInfo {
	return {
		tagName: "v1.0.0",
		name: "",
		publishedAt: "2026-01-01T00:00:00Z",
		prerelease: false,
		draft: false,
		htmlUrl: "https://example.com",
		body: "",
		assets: [],
		...overrides,
	};
}

describe("classifyChannel", () => {
	it("classifies non-prerelease as stable", () => {
		expect(classifyChannel(release({ prerelease: false }))).toBe("stable");
	});

	it("classifies insider tags as insider", () => {
		expect(
			classifyChannel(
				release({ tagName: "v0.11.0-insider.9", prerelease: true }),
			),
		).toBe("insider");
	});

	it("classifies other prereleases as beta", () => {
		expect(
			classifyChannel(release({ tagName: "v0.11.0-beta.1", prerelease: true })),
		).toBe("beta");
	});
});

describe("findLatestStable", () => {
	it("returns the first non-prerelease release", () => {
		const releases = [
			release({ tagName: "v0.11.0-insider.1", prerelease: true }),
			release({ tagName: "v0.10.3" }),
			release({ tagName: "v0.10.2" }),
		];
		expect(findLatestStable(releases)?.tagName).toBe("v0.10.3");
	});

	it("returns undefined when no stable release exists", () => {
		expect(
			findLatestStable([
				release({ tagName: "v0.11.0-insider.1", prerelease: true }),
			]),
		).toBeUndefined();
	});
});

describe("zxpAsset", () => {
	const r = release({
		assets: [
			{ name: "ty-plus-v1.0.0-windows.zxp", url: "https://x/w", size: 1 },
			{ name: "ty-plus-v1.0.0-macos.zxp", url: "https://x/m", size: 2 },
			{ name: "ty-plus-v1.0.0-macos.zip", url: "https://x/z", size: 3 },
		],
	});

	it("matches the OS-specific ZXP by suffix", () => {
		expect(zxpAsset(r, "windows")?.url).toBe("https://x/w");
		expect(zxpAsset(r, "macos")?.url).toBe("https://x/m");
	});

	it("does not confuse .zip with .zxp", () => {
		expect(
			zxpAsset(release({ assets: r.assets.slice(2) }), "macos"),
		).toBeUndefined();
	});
});
