/**
 * The running panel version, injected at build time by Vite
 * (`__APP_VERSION__` in vite.config.ts, sourced from package.json).
 *
 * Declared here so the update feed client and the settings UI share one
 * version source instead of importing package.json into the bundle.
 */
declare const __APP_VERSION__: string;

export const currentVersion =
	typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

/**
 * A prerelease can share the numeric CEP manifest version with other
 * prereleases. The release identity must therefore be injected separately.
 */
declare const __TY_PLUS_RELEASE_VERSION__: string;
declare const __TY_PLUS_RELEASE_CHANNEL__: string;

import { isReleaseChannel, type ReleaseChannel } from "./channel";

export const currentReleaseVersion =
	typeof __TY_PLUS_RELEASE_VERSION__ === "string"
		? __TY_PLUS_RELEASE_VERSION__
		: currentVersion;

export const buildReleaseChannel: ReleaseChannel =
	typeof __TY_PLUS_RELEASE_CHANNEL__ === "string" &&
	isReleaseChannel(__TY_PLUS_RELEASE_CHANNEL__)
		? __TY_PLUS_RELEASE_CHANNEL__
		: "stable";
