/**
 * Verifies usePublicLink hands the resolved URL to the CEP-aware helper
 * (which routes through CSInterface.openURLInDefaultBrowser in CEP and falls
 * back to window.open elsewhere). This is the difference between a click
 * that silently no-ops inside an After Effects panel and one that opens the
 * Notion page in the user's default browser.
 *
 * Issue #170: public links resolve only to build-time bundled URLs, so the
 * hook must not depend on `getDataServices()` — the cloud boot boundary that
 * throws `GatewayBootRequiredError` while the gateway is unbooted. The
 * services module is deliberately not mocked here: the hook no longer
 * imports it, and any accidental reintroduction would surface as an
 * unhandled rejection in these tests.
 */

// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openUrlSpy = vi.fn();
const windowOpenSpy = vi.fn();

vi.mock("@/management/workspace/hooks/open-surfaces", () => ({
	openUrlInDefaultBrowser: (u: string) => openUrlSpy(u),
}));

const cache: {
	read: {
		version: 1;
		updatedAt: string;
		links: Record<string, unknown>;
	} | null;
	write: (data: unknown) => Promise<void>;
	writeCalls: number;
} = {
	read: null,
	write: async () => {},
	writeCalls: 0,
};

vi.mock("@/management/storage/read/cache-store", () => ({
	readPublicLinks: async () => cache.read,
}));

vi.mock("@/management/storage/write/cache-store", () => ({
	writePublicLinks: async (data: unknown) => {
		cache.read = data as typeof cache.read;
		cache.writeCalls += 1;
		await cache.write(data);
	},
}));

vi.mock("@/management/storage/workspace/store", () => ({
	resolveSettingsRoot: () => "/fake/support",
}));

import { usePublicLink } from "./usePublicLink";

const BUNDLED_MANUAL_URL =
	"https://github.com/ido-bata/ty-plus/blob/main/docs/user-guide/index.md";

describe("usePublicLink", () => {
	beforeEach(() => {
		openUrlSpy.mockReset();
		windowOpenSpy.mockReset();
		cache.read = null;
		cache.writeCalls = 0;
		(window as unknown as { open?: typeof window.open }).open = windowOpenSpy;
	});

	afterEach(() => {
		(window as unknown as { open?: typeof window.open }).open = undefined;
	});

	it("resolves the bundled URL without a booted cloud gateway", async () => {
		const { result } = renderHook(() => usePublicLink("user-manual"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.url).toBe(BUNDLED_MANUAL_URL);
		expect(result.current.error).toBeUndefined();
	});

	it("open() routes the URL through openUrlInDefaultBrowser (CEP-aware)", async () => {
		const { result } = renderHook(() => usePublicLink("user-manual"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.url).toBe(BUNDLED_MANUAL_URL);

		act(() => {
			result.current.open();
		});

		expect(openUrlSpy).toHaveBeenCalledWith(BUNDLED_MANUAL_URL);
		expect(windowOpenSpy).not.toHaveBeenCalled();
	});

	it("open() is a no-op when no URL has been resolved", () => {
		const { result } = renderHook(() => usePublicLink("unknown-key"));

		act(() => {
			result.current.open();
		});

		expect(openUrlSpy).not.toHaveBeenCalled();
	});

	it("reads the persisted public-links cache file", async () => {
		cache.read = {
			version: 1,
			updatedAt: "2026-01-01T00:00:00.000Z",
			links: {
				"cached-only": {
					url: "https://example.com/cached-docs",
					label: "Cached Docs",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			},
		};

		const { result } = renderHook(() => usePublicLink("cached-only"));

		await waitFor(() => {
			expect(result.current.cached?.url).toBe(
				"https://example.com/cached-docs",
			);
		});
	});
});
