import { describe, expect, it } from "vitest";
import {
	checkForUpdate,
	compareVersions,
	DEFAULT_UPDATE_FEED_URL,
	parseGitHubRelease,
} from "./feed";
import { acceptsReleaseChannel } from "./channel";

const digest = "a".repeat(64);

const release = (
	tag: string,
	options: {
		draft?: boolean;
		prerelease?: boolean;
		platform?: "windows" | "macos";
		digest?: string;
	} = {},
) => {
	const platform = options.platform ?? "windows";
	const name = "ty-plus-" + tag + "-" + platform + ".zxp";
	return {
		tag_name: tag,
		name: tag,
		draft: options.draft ?? false,
		prerelease: options.prerelease ?? tag.includes("-"),
		published_at: "2026-11-12T00:00:00Z",
		html_url: "https://github.com/ido-bata/ty-plus/releases/tag/" + tag,
		assets: [
			{
				name,
				state: "uploaded",
				browser_download_url:
					"https://github.com/ido-bata/ty-plus/releases/download/" + tag + "/" + name,
				digest: options.digest ?? "sha256:" + digest,
			},
		],
	};
};

const fetchReleases = (releases: unknown) => async (): Promise<string> =>
	JSON.stringify(releases);

describe("GitHub update version ordering", () => {
	it.each([
		["0.11.0-beta.2", "0.11.0-beta.1", 1],
		["0.11.0-insider.2", "0.11.0-insider.1", 1],
		["0.11.0-insider.1", "0.11.0-beta.99", 1],
		["0.11.0", "0.11.0-insider.99", 1],
		["0.11.0-beta.1", "0.11.0", -1],
		["0.11.0", "0.10.9", 1],
		["1.0.0", "0.99.99", 1],
		["0.11.0", "0.11.0", 0],
	])("orders %s against %s (%i)", (a, b, expected) => {
		expect(compareVersions(a, b)).toBe(expected);
	});
});

describe("GitHub Release validation", () => {
	it("maps a published version and its platform asset", () => {
		const parsed = parseGitHubRelease(release("v0.11.0-beta.2"));
		expect(parsed).toEqual({
			schema: "ty-plus.github-releases/1",
			channel: "beta",
			version: "0.11.0-beta.2",
			publishedAt: "2026-11-12T00:00:00Z",
			releaseNotesUrl:
				"https://github.com/ido-bata/ty-plus/releases/tag/v0.11.0-beta.2",
			assets: [{
				platform: "windows",
				url:
					"https://github.com/ido-bata/ty-plus/releases/download/v0.11.0-beta.2/ty-plus-v0.11.0-beta.2-windows.zxp",
				sha256: digest,
			}],
		});
	});

	it.each([
		["draft release", release("v0.11.0", { draft: true })],
		["beta without prerelease flag", release("v0.11.0-beta.1", { prerelease: false })],
		["stable with prerelease flag", release("v0.11.0", { prerelease: true })],
		["unknown prerelease suffix", release("v0.11.0-rc.1")],
		["invalid numeric tag", release("v0.11")],
		["no assets", { ...release("v0.11.0"), assets: [] }],
		["broken digest", release("v0.11.0", { digest: "sha256:wrong" })],
		["unpublished asset", {
			...release("v0.11.0"),
			assets: [{ ...release("v0.11.0").assets[0], state: "starter" }],
		}],
		["foreign release URL", {
			...release("v0.11.0"),
			html_url: "https://example.com/releases/tag/v0.11.0",
		}],
		["foreign asset URL", {
			...release("v0.11.0"),
			assets: [{
				...release("v0.11.0").assets[0],
				browser_download_url: "https://evil.test/download",
			}],
		}],
		["zip-only release", {
			...release("v0.11.0"),
			assets: [{
				...release("v0.11.0").assets[0],
				name: "ty-plus-v0.11.0-windows.zip",
				browser_download_url:
					"https://github.com/ido-bata/ty-plus/releases/download/v0.11.0/ty-plus-v0.11.0-windows.zip",
			}],
		}],
		["wrong asset name", {
			...release("v0.11.0"),
			assets: [{
				...release("v0.11.0").assets[0],
				name: "source.zip",
			}],
		}],
	])("rejects %s", (_description, input) => {
		expect(parseGitHubRelease(input)).toBeNull();
	});
});

describe("release channel subscriptions", () => {
	it("stable receives only stable", () => {
		expect(acceptsReleaseChannel("stable", "stable")).toBe(true);
		expect(acceptsReleaseChannel("stable", "beta")).toBe(false);
		expect(acceptsReleaseChannel("stable", "insider")).toBe(false);
	});
	it("beta also receives stable", () => {
		expect(acceptsReleaseChannel("beta", "stable")).toBe(true);
		expect(acceptsReleaseChannel("beta", "beta")).toBe(true);
		expect(acceptsReleaseChannel("beta", "insider")).toBe(false);
	});
	it("insider receives all", () => {
		expect(acceptsReleaseChannel("insider", "stable")).toBe(true);
		expect(acceptsReleaseChannel("insider", "beta")).toBe(true);
		expect(acceptsReleaseChannel("insider", "insider")).toBe(true);
	});
});

describe("checkForUpdate via GitHub Releases API", () => {
	const releases = [
		release("v0.10.1"),
		release("v0.11.0-beta.1"),
		release("v0.11.0-insider.1"),
	];

	it.each([
		["stable", "0.10.1"],
		["beta", "0.11.0-beta.1"],
		["insider", "0.11.0-insider.1"],
	] as const)("selects %s channel's latest eligible release", async (channel, version) => {
		const checked = await checkForUpdate({
			currentVersion: "0.10.0",
			channel,
			platform: "windows",
			fetchFeedText: fetchReleases(releases),
		});
		expect(checked.status).toBe("update-available");
		if (checked.status === "update-available") {
			expect(checked.feed.version).toBe(version);
		}
	});

	it("recognizes another beta within the same CEP numeric version", async () => {
		const checked = await checkForUpdate({
			currentVersion: "0.11.0-beta.1",
			channel: "beta",
			fetchFeedText: fetchReleases([
				release("v0.11.0-beta.2"),
				release("v0.11.0-beta.1"),
			]),
		});
		expect(checked.status).toBe("update-available");
		if (checked.status === "update-available") {
			expect(checked.feed.version).toBe("0.11.0-beta.2");
		}
	});


	it("finds a stable release behind one full page of insider snapshots", async () => {
		const requested: string[] = [];
		const checked = await checkForUpdate({
			currentVersion: "0.10.0",
			channel: "stable",
			fetchFeedText: async (url) => {
				requested.push(url);
				return JSON.stringify(
					url.includes("page=2")
						? [release("v0.10.1")]
						: Array.from({ length: 100 }, (_, index) =>
							release("v0.11.0-insider." + (index + 1)),
						),
				);
			},
		});
		expect(requested).toHaveLength(2);
		expect(checked.status).toBe("update-available");
		if (checked.status === "update-available") {
			expect(checked.feed.version).toBe("0.10.1");
		}
	});
	it("does not offer a downgrade when switching from insider to stable", async () => {
		const checked = await checkForUpdate({
			currentVersion: "0.11.0-insider.4",
			channel: "stable",
			fetchFeedText: fetchReleases(releases),
		});
		expect(checked).toEqual({ status: "up-to-date" });
	});

	it("does not offer a release lacking assets for the host platform", async () => {
		const checked = await checkForUpdate({
			currentVersion: "0.10.0",
			channel: "insider",
			platform: "windows",
			fetchFeedText: fetchReleases([
				release("v0.11.0-insider.1", { platform: "macos" }),
				release("v0.10.1"),
			]),
		});
		expect(checked.status).toBe("update-available");
		if (checked.status === "update-available") {
			expect(checked.feed.version).toBe("0.10.1");
		}
	});

	it("never throws on offline, private 404, malformed JSON or rate limits", async () => {
		for (const fetchFeedText of [
			async (): Promise<string> => { throw new Error("network down"); },
			async (): Promise<string> => { throw new Error("HTTP 404"); },
			async (): Promise<string> => { throw new Error("HTTP 403"); },
			async (): Promise<string> => "<not json>",
			async (): Promise<string> => JSON.stringify({ message: "rate limit" }),
		]) {
			const checked = await checkForUpdate({
				currentVersion: "0.10.0",
				fetchFeedText,
			});
			expect(checked.status).toBe("unavailable");
		}
	});

	it("refuses unknown endpoints instead of sending token-bearing requests", async () => {
		let called = false;
		const checked = await checkForUpdate({
			currentVersion: "0.10.0",
			feedUrl: "https://example.com/feed.json",
			fetchFeedText: async () => { called = true; return "[]"; },
		});
		expect(checked.status).toBe("unavailable");
		expect(called).toBe(false);
		expect(DEFAULT_UPDATE_FEED_URL).toContain("api.github.com");
	});
});
