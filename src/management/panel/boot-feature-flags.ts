/**
 * Boot-time feature flags — Issue #131.
 *
 * The boot path used to fire two AE round-trips unconditionally on a
 * successful cloud-gateway boot: a connectivity probe and an empty
 * catalog probe. Combined with the startup preset asset scan, those
 * three host calls flooded the AE main thread on first paint and
 * froze AE UI on Windows AE 2026.
 *
 * Stability now takes priority over diagnostic convenience:
 *
 * - Default release behavior: NO boot-time probes.
 * - Producers can opt back in for diagnostics via `TY_PLUS_BOOT_PROBES=on`.
 * - Compatibility legacy (probes were always-on pre-#131) is intentionally
 *   dropped. The pre-#131 behavior is gone; if a producer wants the old
 *   diagnostic, set the env var to `on`.
 *
 * Resolution order (`readBootProbeFlag()`):
 *
 * 1. `TY_PLUS_BOOT_PROBES` set to an enabled value (`on` / `1` /
 *    `true` / `yes`) → `"on"`.
 * 2. set to a disabled value (`off` / `0` / `false` / `no` / `none`) →
 *    `"off"`.
 * 3. unknown value → `"off"`. Spelling a typo MUST NOT silently keep
 *    probes enabled.
 * 4. unset / empty → `"off"`. **Default is now OFF.** The release
 *    default never fires boot-time probes.
 *
 * `isBootProbeEnabled()` collapses the resolution into a boolean for
 * the call site in `tryBuildCloudGateway`.
 */

const ENABLED_VALUES: ReadonlySet<string> = new Set(["on", "1", "true", "yes"]);
const DISABLED_VALUES: ReadonlySet<string> = new Set([
	"off",
	"0",
	"false",
	"no",
	"none",
]);

export type BootProbeFlag = "on" | "off";

const readRawFlag = (): string | undefined => {
	try {
		const env = (
			globalThis as { process?: { env?: Record<string, string | undefined> } }
		).process?.env;
		const raw = env?.TY_PLUS_BOOT_PROBES;
		return typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
	} catch {
		return undefined;
	}
};

/**
 * Read the resolved boot-probe flag.
 *
 * - `"on"`  — explicit `TY_PLUS_BOOT_PROBES=on` opt-in; probes fire.
 * - `"off"` — default, or any non-enabled value; probes are suppressed.
 *
 * Default is OFF as of #131. The release never sends boot-time probes
 * without explicit operator opt-in.
 */
export const readBootProbeFlag = (): BootProbeFlag => {
	const raw = readRawFlag();
	if (raw === undefined || raw.length === 0) return "off";
	if (ENABLED_VALUES.has(raw)) return "on";
	// Disabled values AND unknown values both resolve to OFF. A typo
	// never silently keeps probes enabled.
	if (DISABLED_VALUES.has(raw)) return "off";
	return "off";
};

/**
 * Whether the boot-time connectivity / catalog probes should fire.
 *
 * Returns `true` only for an explicit `TY_PLUS_BOOT_PROBES=on` (or
 * equivalent). Default `false`. Used by `tryBuildCloudGateway` to
 * decide whether to fire post-boot probes.
 */
export const isBootProbeEnabled = (): boolean => readBootProbeFlag() === "on";

/** Test-only: function is a pure read of `process.env`. Cache-state
 *  reset not needed. Kept as a named export for symmetry with other
 *  test-only contracts. */
const __resetBootProbeFlagForTests = (): void => {
	/* no module-level cache */
};
