import { describe, expect, it } from "vitest";
import { acceptsReleaseChannel, type ReleaseChannel } from "./channel";
import {
	checkForUpdate,
	compareVersions,
	DEFAULT_UPDATE_FEED_URL,
	installableZipAsset,
	isInstallableUpdate,
	parseGitHubRelease,
} from "./feed";

const digest = "a".repeat(64);

const release = (
	tag: string,
	options: {
		draft?: boolean;
		prerelease?: boolean;
		platform?: "windows" | "macos";
		digest?: string;
		publishedAt?: string;
		zip?: boolean;
	} = {},
) => {
	const platform = options.platform ?? "windows";
	const assetFor = (extension: "zxp" | "zip") => {
		const name = `ty-plus-${tag}-${platform}.${extension}`;
		return {
			name,
			state: "uploaded",
			browser_download_url:
				"https://github.com/ido-bata/ty-plus/releases/download/" +
				tag +
				"/" +
				name,
			digest: options.digest ?? `sha256:${digest}`,
		};
	};
	return {
		tag_name: tag,
		name: tag,
		draft: options.draft ?? false,
		prerelease: options.prerelease ?? tag.includes("-"),
		published_at: options.publishedAt ?? "2026-11-12T00:00:00Z",
		html_url: `https://github.com/ido-bata/ty-plus/releases/tag/${tag}`,
		assets: [
			assetFor("zxp"),
			// The in-app installer consumes the platform ZIP; releases that
			// ship it carry both archives (Issue #135/#590).
			...(options.zip === true ? [assetFor("zip")] : []),
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
		// Prerelease sequences compare numerically, not lexicographically
		// (Issue #590): `.10` must outrank `.9`.
		["0.11.0-insider.10", "0.11.0-insider.9", 1],
		["0.11.0-beta.10", "0.11.0-beta.9", 1],
		["0.11.0-insider.9", "0.11.0-insider.10", -1],
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
			assets: [
				{
					platform: "windows",
					url: "https://github.com/ido-bata/ty-plus/releases/download/v0.11.0-beta.2/ty-plus-v0.11.0-beta.2-windows.zxp",
					sha256: digest,
				},
			],
		});
	});

	it.each([
		["draft release", release("v0.11.0", { draft: true })],
		[
			"beta without prerelease flag",
			release("v0.11.0-beta.1", { prerelease: false }),
		],
		["stable with prerelease flag", release("v0.11.0", { prerelease: true })],
		["unknown prerelease suffix", release("v0.11.0-rc.1")],
		["invalid numeric tag", release("v0.11")],
		["no assets", { ...release("v0.11.0"), assets: [] }],
		["broken digest", release("v0.11.0", { digest: "sha256:wrong" })],
		[
			"unpublished asset",
			{
				...release("v0.11.0"),
				assets: [{ ...release("v0.11.0").assets[0], state: "starter" }],
			},
		],
		[
			"foreign release URL",
			{
				...release("v0.11.0"),
				html_url: "https://example.com/releases/tag/v0.11.0",
			},
		],
		[
			"foreign asset URL",
			{
				...release("v0.11.0"),
				assets: [
					{
						...release("v0.11.0").assets[0],
						browser_download_url: "https://evil.test/download",
					},
				],
			},
		],
		[
			"zip-only release",
			{
				...release("v0.11.0"),
				assets: [
					{
						...release("v0.11.0").assets[0],
						name: "ty-plus-v0.11.0-windows.zip",
						browser_download_url:
							"https://github.com/ido-bata/ty-plus/releases/download/v0.11.0/ty-plus-v0.11.0-windows.zip",
					},
				],
			},
		],
		[
			"wrong asset name",
			{
				...release("v0.11.0"),
				assets: [
					{
						...release("v0.11.0").assets[0],
						name: "source.zip",
					},
				],
			},
		],
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
	] as const)(
		"selects %s channel's latest eligible release",
		async (channel, version) => {
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
		},
	);

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
								release(`v0.11.0-insider.${index + 1}`),
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

	// Regression: a newer release can sit behind an older one because GitHub
	// orders by creation time. Stopping at the first page that holds *any*
	// newer candidate would offer a stale version and never see the real one.
	it("keeps paging when a newer release hides behind an older one", async () => {
		const requested: string[] = [];
		const checked = await checkForUpdate({
			currentVersion: "0.10.0",
			channel: "stable",
			fetchFeedText: async (url) => {
				requested.push(url);
				if (new URL(url).searchParams.has("page")) {
					return JSON.stringify([release("v0.11.0")]);
				}
				return JSON.stringify([
					// Newer than installed, and published most recently.
					release("v0.10.1"),
					...Array.from({ length: 99 }, (_, index) =>
						release(`v0.9.${index + 1}`),
					),
				]);
			},
		});
		expect(requested).toHaveLength(2);
		expect(checked.status).toBe("update-available");
		if (checked.status === "update-available") {
			expect(checked.feed.version).toBe("0.11.0");
		}
	});

	it("pages only while the previous page was full", async () => {
		const requested: string[] = [];
		const checked = await checkForUpdate({
			currentVersion: "0.10.0",
			channel: "stable",
			fetchFeedText: async (url) => {
				requested.push(url);
				// A short page cannot have a successor.
				return JSON.stringify([release("v0.11.0")]);
			},
		});
		expect(requested).toHaveLength(1);
		expect(checked.status).toBe("update-available");
	});

	it("stays bounded and gives up when a page request fails", async () => {
		const requested: string[] = [];
		const checked = await checkForUpdate({
			currentVersion: "0.10.0",
			channel: "stable",
			fetchFeedText: async (url) => {
				requested.push(url);
				if (new URL(url).searchParams.has("page")) {
					throw new Error("rate limited");
				}
				return JSON.stringify(
					Array.from({ length: 100 }, () => release("v0.9.1")),
				);
			},
		});
		// One failed page request, then give up rather than retrying forever.
		expect(requested).toHaveLength(2);
		expect(checked.status).toBe("up-to-date");
	});

	it("adds the page parameter without corrupting the per_page query", async () => {
		let second = "";
		await checkForUpdate({
			currentVersion: "0.10.0",
			channel: "stable",
			fetchFeedText: async (url) => {
				if (!new URL(url).searchParams.has("page")) {
					return JSON.stringify(
						Array.from({ length: 100 }, () => release("v0.9.1")),
					);
				}
				second = url;
				return JSON.stringify([]);
			},
		});
		expect(second).toContain("per_page=100");
		expect(second).toContain("page=2");
		const params = new URL(second).searchParams;
		expect(params.get("page")).toBe("2");
		expect(params.get("per_page")).toBe("100");
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
			async (): Promise<string> => {
				throw new Error("network down");
			},
			async (): Promise<string> => {
				throw new Error("HTTP 404");
			},
			async (): Promise<string> => {
				throw new Error("HTTP 403");
			},
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
			fetchFeedText: async () => {
				called = true;
				return "[]";
			},
		});
		expect(checked.status).toBe("unavailable");
		expect(called).toBe(false);
		expect(DEFAULT_UPDATE_FEED_URL).toContain("api.github.com");
	});
});

/**
 * Issue #590 acceptance table: subscription eligibility and SemVer ordering
 * vs the installed version are separate decisions. The candidate is the
 * maximum strictly-newer eligible release — never decided by publish date,
 * the GitHub latest flag, or a channel-name match alone.
 */
describe("Issue #590 channel-crossing SemVer contract", () => {
	const cases: ReadonlyArray<{
		channel: ReleaseChannel;
		current: string;
		tags: readonly string[];
		expected: "update-available" | "up-to-date";
		expectedVersion?: string;
	}> = [
		// [subscription, installed, candidates, expected, expectedVersion?]
		{
			channel: "insider",
			current: "1.2.0-insider.3",
			tags: ["v1.2.0"],
			expected: "update-available",
			expectedVersion: "1.2.0",
		},
		{
			channel: "beta",
			current: "1.2.0-beta.3",
			tags: ["v1.2.0"],
			expected: "update-available",
			expectedVersion: "1.2.0",
		},
		{
			channel: "insider",
			current: "1.2.0-insider.3",
			tags: ["v1.2.0-insider.4"],
			expected: "update-available",
			expectedVersion: "1.2.0-insider.4",
		},
		{
			channel: "insider",
			current: "1.2.0",
			tags: ["v1.3.0-insider.1"],
			expected: "update-available",
			expectedVersion: "1.3.0-insider.1",
		},
		{
			channel: "beta",
			current: "1.2.0",
			tags: ["v1.3.0-beta.1"],
			expected: "update-available",
			expectedVersion: "1.3.0-beta.1",
		},
		// Ineligible channels are filtered before ordering; the remaining
		// eligible release equals the installed version, so no update.
		{
			channel: "stable",
			current: "1.2.0",
			tags: ["v1.2.0", "v1.3.0-insider.1", "v1.3.0-beta.1"],
			expected: "up-to-date",
		},
		{
			channel: "beta",
			current: "1.2.0",
			tags: ["v1.2.0", "v1.3.0-insider.1"],
			expected: "up-to-date",
		},
		// An older stable release never supersedes a newer prerelease, and a
		// prerelease of the same numeric base never supersedes the stable.
		{
			channel: "insider",
			current: "1.3.0-insider.1",
			tags: ["v1.2.1"],
			expected: "up-to-date",
		},
		{
			channel: "insider",
			current: "1.3.0",
			tags: ["v1.3.0", "v1.3.0-insider.5"],
			expected: "up-to-date",
		},
		{
			channel: "insider",
			current: "1.3.0",
			tags: ["v1.3.0"],
			expected: "up-to-date",
		},
	];
	it.each(cases)(
		"subscription $channel on $current offers $expected",
		async ({ channel, current, tags, expected, expectedVersion }) => {
			const checked = await checkForUpdate({
				currentVersion: current,
				channel,
				fetchFeedText: fetchReleases(tags.map((tag) => release(tag))),
			});
			expect(checked.status).toBe(expected);
			if (checked.status === "update-available" && expectedVersion) {
				expect(checked.feed.version).toBe(expectedVersion);
			}
		},
	);

	it("picks the maximum eligible release across mixed channels and reversed publish order", async () => {
		const checked = await checkForUpdate({
			currentVersion: "1.2.0-insider.8",
			channel: "insider",
			fetchFeedText: fetchReleases([
				// Published most recently but numerically older.
				release("v1.1.0", { publishedAt: "2026-11-20T00:00:00Z" }),
				release("v1.2.0-insider.9", {
					publishedAt: "2026-11-10T00:00:00Z",
				}),
				release("v1.2.0-insider.10", {
					publishedAt: "2026-11-01T00:00:00Z",
				}),
				release("v1.2.0-beta.20", {
					publishedAt: "2026-11-15T00:00:00Z",
				}),
			]),
		});
		expect(checked.status).toBe("update-available");
		if (checked.status === "update-available") {
			expect(checked.feed.version).toBe("1.2.0-insider.10");
		}
	});

	it("keeps the feed → installer contract: a stable feed selected for an insider subscription is installable", async () => {
		const checked = await checkForUpdate({
			currentVersion: "1.2.0-insider.3",
			channel: "insider",
			platform: "windows",
			fetchFeedText: fetchReleases([release("v1.2.0", { zip: true })]),
		});
		expect(checked.status).toBe("update-available");
		if (checked.status !== "update-available") return;
		// Installability follows the feed, not the subscription channel.
		expect(isInstallableUpdate(checked.feed)).toBe(true);
		const asset = installableZipAsset(checked.feed, "windows");
		expect(asset).toEqual({
			url: "https://github.com/ido-bata/ty-plus/releases/download/v1.2.0/ty-plus-v1.2.0-windows.zip",
			fileName: "ty-plus-v1.2.0-windows.zip",
			sha256: digest,
		});
		// The worker validates tag === `v${release_version}` with a numeric
		// core; a stable feed satisfies it, a prerelease feed cannot.
		expect(`v${checked.feed.version}`).toBe("v1.2.0");
	});

	it("keeps prerelease feeds release-notes-only for every subscription channel", async () => {
		// Only the insider subscription sees the prerelease candidate at all;
		// stable/beta filter it out during eligibility, before ordering.
		for (const channel of ["stable", "beta"] as const) {
			const checked = await checkForUpdate({
				currentVersion: "1.2.0",
				channel,
				fetchFeedText: fetchReleases([
					release("v1.2.0"),
					release("v1.3.0-insider.1", { zip: true }),
				]),
			});
			expect(checked.status).toBe("up-to-date");
		}
		const checked = await checkForUpdate({
			currentVersion: "1.2.0",
			channel: "insider",
			fetchFeedText: fetchReleases([
				release("v1.2.0"),
				release("v1.3.0-insider.1", { zip: true }),
			]),
		});
		expect(checked.status).toBe("update-available");
		if (checked.status === "update-available") {
			expect(checked.feed.channel).toBe("insider");
			expect(isInstallableUpdate(checked.feed)).toBe(false);
		}
	});
});
