/**
 * Platform + elevation-capability detection for the onboarding finish phase.
 *
 * Issue #53: the previous revision of this module carried
 * `readTrustedUserDataRoots`, `isUnderTrustedRoot`, `evaluateTrustedRootPolicy`,
 * `pickNextAction`, and `probeAdminWritability` — all predicated on a
 * "trusted user-data root" gate that is fundamentally wrong for AE Support
 * Files. The gate has been removed and those exports deleted. Only the two
 * intrinsic host-detection helpers remain, used by
 * `finish-settings-write.ts` to decide whether a UAC fallback is available.
 */

import type { OnboardingFinishErrorPlatform } from "./finish-error";

type CepNodeProcess = {
	platform?: string;
};

type CepNodeRequire = (id: string) => unknown;

const readCepNodeProcess = (win: Window): CepNodeProcess | null => {
	const maybe = win as Window & {
		cep_node?: { process?: CepNodeProcess };
	};
	return maybe.cep_node?.process ?? null;
};

const readCepNodeRequire = (win: Window): CepNodeRequire | null => {
	const maybe = win as Window & {
		cep_node?: { require?: CepNodeRequire };
	};
	return maybe.cep_node?.require ?? null;
};

/**
 * Detect the host platform from CEP node. Falls back to `"unknown"` when
 * CEP node is unavailable (e.g. pure unit tests). The string values match
 * the locale keys in `onboarding.json -> errors.platform.*`.
 */
export const detectPlatform = (win: Window): OnboardingFinishErrorPlatform => {
	const proc = readCepNodeProcess(win);
	if (!proc?.platform) return "unknown";
	if (proc.platform === "win32") return "windows";
	if (proc.platform === "darwin") return "mac";
	return "unknown";
};

/**
 * Whether elevation-capable child_process spawning is available on this host.
 * Both Windows (PowerShell with -Verb RunAs) and macOS (osascript with
 * "with administrator privileges") go through `child_process.execFileSync`.
 */
export const canAttemptElevation = (win: Window): boolean => {
	const platform = detectPlatform(win);
	if (platform === "unknown") return false;
	const requireFn = readCepNodeRequire(win);
	if (!requireFn) return false;
	try {
		const cp = requireFn("child_process") as {
			execFileSync?: unknown;
		};
		return typeof cp.execFileSync === "function";
	} catch {
		return false;
	}
};
