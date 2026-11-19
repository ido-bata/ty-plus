/**
 * Which distribution platform a build targets (ADR-0003, ADR-0004).
 *
 * Normally the host platform. `TY_PLUS_BUILD_PLATFORM` allows producing one
 * platform's artifact on another host, which the R0 release needs twice:
 *
 * - the unsigned Windows candidate has no Authenticode step (ADR-0003), so it
 *   can be built from macOS by cross-compiling the worker with an MSVC
 *   toolchain;
 * - a platform's artifact is still that platform's artifact — the override is
 *   explicit and validated rather than inferred, so nothing can silently
 *   label one platform's bytes as another's.
 *
 * One definition for every release script; do not re-derive the platform in a
 * caller.
 */
export type BuildPlatform = "windows" | "macos";

export const isBuildPlatform = (value: unknown): value is BuildPlatform =>
	value === "windows" || value === "macos";

/** The override from the environment, or `undefined` when unset. */
export const buildPlatformOverride = (
	env: Partial<Record<string, string | undefined>> = process.env,
): BuildPlatform | undefined => {
	const raw = env.TY_PLUS_BUILD_PLATFORM?.trim();
	if (!raw) return undefined;
	if (!isBuildPlatform(raw)) {
		throw new Error(
			`unsupported TY_PLUS_BUILD_PLATFORM "${raw}" (expected windows or macos)`,
		);
	}
	return raw;
};

/** The target platform: the override, else the host. `null` if unsupported. */
export const resolveBuildPlatform = (
	hostPlatform: NodeJS.Platform = process.platform,
	env: Partial<Record<string, string | undefined>> = process.env,
): BuildPlatform | null => {
	const override = buildPlatformOverride(env);
	if (override) return override;
	if (hostPlatform === "win32") return "windows";
	if (hostPlatform === "darwin") return "macos";
	return null;
};
