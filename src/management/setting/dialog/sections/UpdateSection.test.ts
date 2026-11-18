import { describe, expect, it } from "vitest";
import type { UpdateFeed } from "@/management/online/update/feed";
import { installableZipAsset, installFailureKey } from "./UpdateSection";

const SHA256 = "a".repeat(64);

const feed = (overrides: Partial<UpdateFeed> = {}): UpdateFeed => ({
	schema: "ty-plus.github-releases/1",
	channel: "stable",
	version: "0.10.2",
	publishedAt: "2025-01-01T00:00:00Z",
	releaseNotesUrl: "https://github.com/ido-bata/ty-plus/releases/tag/v0.10.2",
	assets: [
		{
			platform: "macos",
			url: "https://github.com/ido-bata/ty-plus/releases/download/v0.10.2/ty-plus-v0.10.2-macos.zip",
			sha256: SHA256,
		},
		{
			platform: "macos",
			url: "https://github.com/ido-bata/ty-plus/releases/download/v0.10.2/ty-plus-v0.10.2-macos.zxp",
			sha256: SHA256,
		},
		{
			platform: "windows",
			url: "https://github.com/ido-bata/ty-plus/releases/download/v0.10.2/ty-plus-v0.10.2-windows.zip",
			sha256: SHA256,
		},
	],
	...overrides,
});

describe("installableZipAsset", () => {
	it("selects the platform ZIP asset for the feed version", () => {
		const asset = installableZipAsset(feed(), "macos");
		expect(asset).toEqual({
			url: "https://github.com/ido-bata/ty-plus/releases/download/v0.10.2/ty-plus-v0.10.2-macos.zip",
			fileName: "ty-plus-v0.10.2-macos.zip",
			sha256: SHA256,
		});
	});

	it("returns null when the platform is unknown", () => {
		expect(installableZipAsset(feed(), undefined)).toBeNull();
	});

	it("ignores ZXP assets, other platforms, and mismatched file names", () => {
		// Only ZXP entries for the platform: nothing installable in-app.
		const zxpOnly = feed({
			assets: [
				{
					platform: "macos",
					url: "https://example.com/ty-plus-v0.10.2-macos.zxp",
					sha256: SHA256,
				},
			],
		});
		expect(installableZipAsset(zxpOnly, "macos")).toBeNull();

		// ZIP for a different platform must not be picked.
		expect(installableZipAsset(feed(), "windows")).not.toBeNull();
		const macOnly = feed({
			assets: feed().assets.filter((a) => a.platform === "macos"),
		});
		expect(installableZipAsset(macOnly, "windows")).toBeNull();

		// A .zip whose file name does not match ty-plus-<tag>-<platform>.zip
		// is not an installable release asset.
		const renamed = feed({
			assets: [
				{
					platform: "macos",
					url: "https://example.com/random-name.zip",
					sha256: SHA256,
				},
			],
		});
		expect(installableZipAsset(renamed, "macos")).toBeNull();
	});
});

describe("installFailureKey", () => {
	it("maps stable worker error codes to localized keys", () => {
		expect(installFailureKey("integrity_mismatch")).toBe(
			"installFailedIntegrity",
		);
		expect(installFailureKey("network_unavailable")).toBe(
			"installFailedDownload",
		);
		expect(installFailureKey("timeout")).toBe("installFailedDownload");
		expect(installFailureKey("remote_rejected")).toBe("installFailedArchive");
		expect(installFailureKey("permission_denied")).toBe(
			"installFailedPermission",
		);
		expect(installFailureKey("busy")).toBe("installFailedBusy");
	});

	it("falls back to the generic failure key", () => {
		expect(installFailureKey("internal_error")).toBe("installFailed");
		expect(installFailureKey(undefined)).toBe("installFailed");
	});
});
