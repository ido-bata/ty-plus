import { describe, expect, it } from "vitest";

import { checkForUpdate, compareVersions, parseUpdateFeed } from "./feed";

const validFeed = {
	schema: "ty-plus.update-feed/1",
	channel: "stable",
	version: "0.11.0",
	publishedAt: "2026-11-20T00:00:00Z",
	releaseNotesUrl: "https://example.com/notes/0.11.0",
	assets: [
		{
			platform: "macos",
			url: "https://example.com/ty-plus-0.11.0-macos.zip",
			sha256: "a".repeat(64),
		},
		{
			platform: "windows",
			url: "https://example.com/ty-plus-0.11.0-windows.zip",
			sha256: "b".repeat(64),
		},
	],
};

describe("compareVersions", () => {
	it.each([
		["0.10.1", "0.10.0", 1],
		["0.10.0", "0.10.0", 0],
		["0.9.9", "0.10.0", -1],
		["1.0.0", "0.99.99", 1],
	])("%s vs %s -> %i", (left, right, expected) => {
		expect(compareVersions(left, right)).toBe(expected);
	});
});

describe("parseUpdateFeed", () => {
	it("accepts a well-formed feed", () => {
		expect(parseUpdateFeed(validFeed)).toEqual(validFeed);
	});

	it.each([
		["wrong schema", { ...validFeed, schema: "other/1" }],
		["missing version", { ...validFeed, version: undefined }],
		["non-semver version", { ...validFeed, version: "0.11" }],
		[
			"non-https release notes",
			{ ...validFeed, releaseNotesUrl: "http://e.com" },
		],
		[
			"asset sha256 not hex64",
			{
				...validFeed,
				assets: [{ platform: "macos", url: "https://e.com/x", sha256: "xyz" }],
			},
		],
		[
			"unknown platform",
			{
				...validFeed,
				assets: [
					{ platform: "linux", url: "https://e.com/x", sha256: "a".repeat(64) },
				],
			},
		],
		["assets not an array", { ...validFeed, assets: "nope" }],
	])("rejects %s", (_label, raw) => {
		expect(parseUpdateFeed(raw)).toBeNull();
	});
});

const okFetch = (body: string) => async (): Promise<string> => body;

describe("checkForUpdate", () => {
	it("reports update-available when the feed is newer", async () => {
		const result = await checkForUpdate({
			currentVersion: "0.10.0",
			feedUrl: "https://example.com/feed.json",
			fetchFeedText: okFetch(JSON.stringify(validFeed)),
		});
		expect(result).toEqual({ status: "update-available", feed: validFeed });
	});

	it("reports up-to-date for an equal or older feed version (downgrade)", async () => {
		for (const version of ["0.10.0", "0.9.0"]) {
			const result = await checkForUpdate({
				currentVersion: "0.10.0",
				feedUrl: "https://example.com/feed.json",
				fetchFeedText: okFetch(JSON.stringify({ ...validFeed, version })),
			});
			expect(result).toEqual({ status: "up-to-date" });
		}
	});

	it("reports unavailable on network failure", async () => {
		const result = await checkForUpdate({
			currentVersion: "0.10.0",
			feedUrl: "https://example.com/feed.json",
			fetchFeedText: async () => {
				throw new Error("EAI_AGAIN");
			},
		});
		expect(result).toEqual({
			status: "unavailable",
			reason: "feed fetch failed",
		});
	});

	it("reports unavailable on a malformed body", async () => {
		for (const body of ["<html>not json</html>", '{"schema":"other/1"}']) {
			const result = await checkForUpdate({
				currentVersion: "0.10.0",
				feedUrl: "https://example.com/feed.json",
				fetchFeedText: okFetch(body),
			});
			expect(result.status).toBe("unavailable");
		}
	});

	it("refuses a non-https feed url without fetching", async () => {
		let fetched = false;
		const result = await checkForUpdate({
			currentVersion: "0.10.0",
			feedUrl: "http://example.com/feed.json",
			fetchFeedText: async () => {
				fetched = true;
				return "";
			},
		});
		expect(result).toEqual({
			status: "unavailable",
			reason: "feed url must be https",
		});
		expect(fetched).toBe(false);
	});

	it("reports unavailable when the fetch times out", async () => {
		// AbortSignal.timeout in the default fetch rejects with a
		// TimeoutError; the fetch seam lets the test inject that outcome
		// deterministically instead of waiting on a real clock.
		const result = await checkForUpdate({
			currentVersion: "0.10.0",
			feedUrl: "https://example.com/feed.json",
			fetchFeedText: async () => {
				throw new DOMException("The operation was aborted.", "TimeoutError");
			},
		});
		expect(result).toEqual({
			status: "unavailable",
			reason: "feed fetch failed",
		});
	});
});
