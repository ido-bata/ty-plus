import { describe, expect, it } from "vitest";

import {
	fetchNotificationFeed,
	parseNotificationFeed,
	toNotificationSummary,
} from "./feed";

const NOW = new Date("2026-11-11T00:00:00Z");

const validFeed = {
	schema: "ty-plus.notification-feed/1",
	items: [
		{
			id: "2026-11-maintenance",
			title: "メンテナンスのお知らせ",
			summary: "11/15 にメンテナンスを行います。",
			url: "https://example.com/notes",
			severity: "info",
			publishedAt: "2026-11-10T00:00:00Z",
			expiresAt: "2026-12-15T00:00:00Z",
		},
		{
			id: "security-notice",
			title: "セキュリティ通知",
			severity: "critical",
			publishedAt: "2026-11-11T00:00:00Z",
		},
	],
};

describe("parseNotificationFeed", () => {
	it("accepts a well-formed feed and keeps valid items", () => {
		const feed = parseNotificationFeed(validFeed, NOW);
		expect(feed?.items).toHaveLength(2);
		expect(feed?.items[0]?.id).toBe("2026-11-maintenance");
	});

	it("drops invalid items individually and keeps the rest", () => {
		const feed = parseNotificationFeed(
			{
				schema: "ty-plus.notification-feed/1",
				items: [
					...validFeed.items,
					{ title: "no id", severity: "info", publishedAt: "x" },
					{
						id: "bad-severity",
						title: "t",
						severity: "loud",
						publishedAt: "x",
					},
					{
						id: "non-https-url",
						title: "t",
						severity: "info",
						publishedAt: "x",
						url: "http://e.com",
					},
					"not an object",
				],
			},
			NOW,
		);
		expect(feed?.items.map((item) => item.id)).toEqual([
			"2026-11-maintenance",
			"security-notice",
		]);
	});

	it("filters expired items with the provided clock", () => {
		const feed = parseNotificationFeed(
			{
				schema: "ty-plus.notification-feed/1",
				items: [
					{
						id: "expired",
						title: "古い通知",
						severity: "info",
						publishedAt: "2026-01-01T00:00:00Z",
						expiresAt: "2026-06-30T00:00:00Z",
					},
					...validFeed.items,
				],
			},
			NOW,
		);
		expect(feed?.items.map((item) => item.id)).not.toContain("expired");
	});

	it("rejects a wrong schema or a non-array items block", () => {
		expect(
			parseNotificationFeed({ ...validFeed, schema: "other/1" }, NOW),
		).toBeNull();
		expect(
			parseNotificationFeed({ ...validFeed, items: "nope" }, NOW),
		).toBeNull();
	});
});

describe("fetchNotificationFeed", () => {
	const okFetch = (body: string) => async (): Promise<string> => body;

	it("maps feed items onto notification summaries", async () => {
		const items = await fetchNotificationFeed({
			feedUrl: "https://example.com/notifications.json",
			now: NOW,
			fetchFeedText: okFetch(JSON.stringify(validFeed)),
		});
		expect(items).toHaveLength(2);
		expect(items?.[0]).toEqual({
			notificationId: "2026-11-maintenance",
			name: "メンテナンスのお知らせ",
			summary: "11/15 にメンテナンスを行います。",
			publishedAt: "2026-11-10T00:00:00Z",
			severity: "info",
			url: "https://example.com/notes",
		});
	});

	it("returns null on unreachable host, malformed body, and invalid url", async () => {
		const unreachable = await fetchNotificationFeed({
			feedUrl: "https://example.com/notifications.json",
			fetchFeedText: async () => {
				throw new Error("EAI_AGAIN");
			},
		});
		expect(unreachable).toBeNull();

		const malformed = await fetchNotificationFeed({
			feedUrl: "https://example.com/notifications.json",
			fetchFeedText: okFetch("<html></html>"),
		});
		expect(malformed).toBeNull();

		const insecure = await fetchNotificationFeed({
			feedUrl: "http://example.com/notifications.json",
			fetchFeedText: okFetch(JSON.stringify(validFeed)),
		});
		expect(insecure).toBeNull();
	});
});

describe("toNotificationSummary", () => {
	it("keeps optional fields absent when the feed omits them", () => {
		const summary = toNotificationSummary({
			id: "minimal",
			title: "最小項目",
			severity: "warning",
			publishedAt: "2026-11-11T00:00:00Z",
		});
		expect(summary).toEqual({
			notificationId: "minimal",
			name: "最小項目",
			publishedAt: "2026-11-11T00:00:00Z",
			severity: "warning",
		});
	});
});
