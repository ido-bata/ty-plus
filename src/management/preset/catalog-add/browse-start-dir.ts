type PresetPathBrowseBucket = "presets" | "scripts" | "plugins" | "other";

/** User home / profile directory for "Other" browse tab (archive `getDefaultOtherPath`). */
export const readUserHomeOrFallback = (): string => {
	try {
		const globalProcess = typeof process !== "undefined" ? process : undefined;
		const env = globalProcess?.env as Record<string, string> | undefined;
		if (env?.HOME) {
			return env.HOME;
		}
		if (env?.USERPROFILE) {
			return env.USERPROFILE;
		}
	} catch {
		/* process not available in browser */
	}
	return "C:\\";
};

/** Initial directory for CEP `showOpenDialog` (archive-style bucket tabs). */
function defaultDirForBrowseBucket(bucket: PresetPathBrowseBucket): string {
	const home = readUserHomeOrFallback();
	if (bucket === "other") {
		return home;
	}
	const sep = home.includes("\\") ? "\\" : "/";
	return `${home.replace(/[/\\]+$/, "")}${sep}Documents`;
}
