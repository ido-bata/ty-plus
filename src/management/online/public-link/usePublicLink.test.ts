/**
 * Verifies usePublicLink hands the resolved URL to the CEP-aware helper
 * (which routes through CSInterface.openURLInDefaultBrowser in CEP and falls
 * back to window.open elsewhere). This is the difference between a click
 * that silently no-ops inside an After Effects panel and one that opens the
 * Notion page in the user's default browser.
 */

// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openUrlSpy = vi.fn();
const windowOpenSpy = vi.fn();

vi.mock("@/management/workspace/hooks/helpers", () => ({
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

vi.mock("@/management/storage", () => ({
	readPublicLinks: async () => cache.read,
	writePublicLinks: async (data: unknown) => {
		cache.read = data as typeof cache.read;
		cache.writeCalls += 1;
		await cache.write(data);
	},
}));

vi.mock("@/management/storage/workspace/store", () => ({
	resolveSettingsRoot: () => "/fake/support",
}));

const gateway = {
	getPublicLink: vi.fn(async () => ({
		key: "user-manual",
		url: "https://www.notion.so/ty-plus-User-Manual-test",
		label: "User Manual",
		updatedAt: "2026-06-05T00:00:00.000Z",
	})),
};

vi.mock("@/management/workspace/services", () => ({
	getDataServices: () => ({
		gateway,
		presetRepository: { list: async () => [] },
		cloudSync: {},
		resolveSystemPaths: () => ({
			hostId: "AE",
			operatingSystem: "win",
			userSupportRoot: "",
			hostSupportRoot: "",
			presetRoot: "",
			scriptRoot: "",
		}),
		bootMode: "live" as const,
	}),
}));

import { usePublicLink } from "./usePublicLink";

describe("usePublicLink", () => {
	beforeEach(() => {
		openUrlSpy.mockReset();
		windowOpenSpy.mockReset();
		gateway.getPublicLink.mockClear();
		cache.read = null;
		cache.writeCalls = 0;
		(window as unknown as { open?: typeof window.open }).open = windowOpenSpy;
	});

	afterEach(() => {
		(window as unknown as { open?: typeof window.open }).open = undefined;
	});

	it("open() routes the URL through openUrlInDefaultBrowser (CEP-aware)", async () => {
		const { result } = renderHook(() => usePublicLink("user-manual"));

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.url).toBe(
			"https://www.notion.so/ty-plus-User-Manual-test",
		);

		act(() => {
			result.current.open();
		});

		expect(openUrlSpy).toHaveBeenCalledWith(
			"https://www.notion.so/ty-plus-User-Manual-test",
		);
		expect(windowOpenSpy).not.toHaveBeenCalled();
	});

	it("open() is a no-op when no URL has been resolved", () => {
		gateway.getPublicLink.mockImplementationOnce(
			async () =>
				new Promise(() => {
					/* never resolves */
				}),
		);
		const { result } = renderHook(() => usePublicLink("user-manual"));

		act(() => {
			result.current.open();
		});

		expect(openUrlSpy).not.toHaveBeenCalled();
	});
});
