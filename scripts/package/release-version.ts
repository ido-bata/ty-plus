/**
 * Single source of truth for the release channel / tag / asset-name contract
 * (ADR-0004, `docs/architecture/feeds.md`).
 *
 * Every release script — manifest generation, artifact audit, GitHub asset
 * staging, the release CLI — imports this module instead of re-deriving the
 * tag grammar. The panel-side update client
 * (`src/management/online/update/channel.ts`) owns the *subscription*
 * semantics; this module owns the *artifact identity* semantics. Adding a
 * distribution provider or an installer format must extend those two
 * modules, not copy the rules again.
 */

export const RELEASE_CHANNELS = ["stable", "beta", "insider"] as const;

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

export const RELEASE_PLATFORMS = ["windows", "macos"] as const;

export type ReleasePlatform = (typeof RELEASE_PLATFORMS)[number];

export const isReleaseChannel = (value: unknown): value is ReleaseChannel =>
	value === "stable" || value === "beta" || value === "insider";

export const isReleasePlatform = (value: unknown): value is ReleasePlatform =>
	value === "windows" || value === "macos";

export type ReleaseVersion = Readonly<{
	/** Full release identity, e.g. `0.11.0-beta.2`. Never carries the `v`. */
	releaseVersion: string;
	/** Numeric CEP version, e.g. `0.11.0` — what `package.json` carries. */
	coreVersion: string;
	channel: ReleaseChannel;
	/** GitHub tag, e.g. `v0.11.0-beta.2`. */
	tag: string;
}>;

const RELEASE_VERSION_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|insider)\.(0|[1-9]\d*))?$/;

/**
 * Parses a release version. Returns `null` for anything that is not one of
 * the three documented shapes: `X.Y.Z`, `X.Y.Z-beta.N`, `X.Y.Z-insider.N`.
 * Unknown prerelease identifiers are rejected rather than mapped to a
 * channel, so a new channel must be added here deliberately.
 */
export const parseReleaseVersion = (value: unknown): ReleaseVersion | null => {
	if (typeof value !== "string") return null;
	const match = RELEASE_VERSION_PATTERN.exec(value);
	if (!match) return null;
	const coreVersion = `${match[1]}.${match[2]}.${match[3]}`;
	const channel: ReleaseChannel = isReleaseChannel(match[4])
		? match[4]
		: "stable";
	return { releaseVersion: value, coreVersion, channel, tag: `v${value}` };
};

/** Parses a GitHub tag (`v` prefix required). */
export const parseReleaseTag = (tag: unknown): ReleaseVersion | null => {
	if (typeof tag !== "string" || !tag.startsWith("v")) return null;
	return parseReleaseVersion(tag.slice(1));
};

export type ReleaseAssetNames = Readonly<{
	zip: string;
	zxp: string;
	manifest: string;
}>;

/**
 * Asset names are a public contract: the update client matches them exactly
 * (`parseGitHubRelease`), so one release's assets can never be confused with
 * another's.
 */
export const releaseAssetNames = (
	version: ReleaseVersion,
	platform: ReleasePlatform,
): ReleaseAssetNames => {
	const base = `ty-plus-${version.tag}-${platform}`;
	return {
		zip: `${base}.zip`,
		zxp: `${base}.zxp`,
		manifest: `${base}-release-manifest.json`,
	};
};

/** Every asset name a release of `version` on `platform` may publish. */
export const releaseAssetNamesFor = (
	version: ReleaseVersion,
	platform: ReleasePlatform,
): readonly string[] => {
	const names = releaseAssetNames(version, platform);
	return [names.zip, names.zxp, names.manifest];
};

/**
 * Verifies that the build-time release identity agrees with the numeric CEP
 * version in `package.json` and with the requested channel.
 *
 * The numeric core must match exactly: CEP can only express `X.Y.Z`, so the
 * prerelease sequence lives in the tag and in the injected
 * `TY_PLUS_RELEASE_VERSION`, never in the extension manifest.
 */
export const assertReleaseIdentity = (input: {
	readonly releaseVersion: string;
	readonly packageVersion: string;
	readonly channel?: string;
}): ReleaseVersion => {
	const parsed = parseReleaseVersion(input.releaseVersion);
	if (!parsed) {
		throw new Error(
			`invalid release version "${input.releaseVersion}": expected X.Y.Z, X.Y.Z-beta.N or X.Y.Z-insider.N`,
		);
	}
	if (parsed.coreVersion !== input.packageVersion) {
		throw new Error(
			`release version ${parsed.releaseVersion} must share package.json's numeric version ` +
				`${input.packageVersion} (CEP cannot express a prerelease suffix)`,
		);
	}
	if (input.channel !== undefined && input.channel !== parsed.channel) {
		throw new Error(
			`release channel "${input.channel}" disagrees with ${parsed.releaseVersion} ` +
				`(which is ${parsed.channel})`,
		);
	}
	return parsed;
};

/** The value GitHub's `prerelease` flag must carry for this channel. */
export const isPrereleaseChannel = (channel: ReleaseChannel): boolean =>
	channel !== "stable";
