/** Public update channels, independent of the distribution provider. */
export const RELEASE_CHANNELS = ["stable", "beta", "insider"] as const;

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

export const isReleaseChannel = (value: unknown): value is ReleaseChannel =>
	value === "stable" || value === "beta" || value === "insider";

/** A subscription receives releases from its own channel and less experimental channels. */
export const acceptsReleaseChannel = (
	subscription: ReleaseChannel,
	release: ReleaseChannel,
): boolean => {
	if (subscription === "insider") return true;
	if (subscription === "beta") return release !== "insider";
	return release === "stable";
};
