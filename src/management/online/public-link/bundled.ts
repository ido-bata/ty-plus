import type { PublicLink } from "@/management/online/contract";

/**
 * Build-time bundled public links (offline-core, docs/architecture/offline-core.md).
 *
 * R0 has no public-link backend, so the only URLs this product may surface are
 * the ones bundled into the build — currently the repo-hosted user guide.
 * Resolution is synchronous and gateway-independent: callers must not route
 * through `getDataServices()`, which throws `GatewayBootRequiredError` before
 * the cloud gateway boots.
 */
const USER_MANUAL_DOCS_URL =
	"https://github.com/ido-bata/ty-plus/blob/main/docs/user-guide/index.md";

export const resolveBundledPublicLink = (key: string): PublicLink => {
	if (key === "user-manual") {
		return {
			key,
			url: USER_MANUAL_DOCS_URL,
			label: "User Manual",
		};
	}
	throw new Error(`Unknown public link: ${key}`);
};
