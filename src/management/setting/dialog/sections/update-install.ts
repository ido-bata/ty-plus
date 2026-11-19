import type {
	UpdateFeed,
	UpdatePlatform,
} from "@/management/online/update/feed";

/**
 * Map the worker's stable error code onto a localized failure message.
 * `update.install` reports `integrity_mismatch`, `network_unavailable`,
 * `remote_rejected` (archive), `permission_denied`, and `busy` distinctly
 * (Issue #169); anything else falls back to the generic failure text.
 */
export const installFailureKey = (code: string | undefined): string => {
	switch (code) {
		case "integrity_mismatch":
			return "installFailedIntegrity";
		case "network_unavailable":
			return "installFailedDownload";
		case "timeout":
			return "installFailedTimeout";
		case "remote_rejected":
			return "installFailedArchive";
		case "permission_denied":
			return "installFailedPermission";
		case "busy":
			return "installFailedBusy";
		default:
			return "installFailed";
	}
};

/**
 * Pick the platform ZIP asset the worker installer consumes. The feed
 * carries both `.zip` and `.zxp` entries per platform; only the ZIP is
 * installable in-app (the ZXP remains the manual fallback).
 */
export const installableZipAsset = (
	feed: UpdateFeed,
	platform: UpdatePlatform | undefined,
): { url: string; fileName: string; sha256: string } | null => {
	if (platform === undefined) return null;
	const tag = `v${feed.version}`;
	for (const asset of feed.assets) {
		if (asset.platform !== platform || !asset.url.endsWith(".zip")) continue;
		const fileName = asset.url.split("/").pop() ?? "";
		if (fileName !== `ty-plus-${tag}-${platform}.zip`) continue;
		return { url: asset.url, fileName, sha256: asset.sha256 };
	}
	return null;
};
