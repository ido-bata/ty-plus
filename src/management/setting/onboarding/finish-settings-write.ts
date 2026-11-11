/**
 * Onboarding finish-phase settings write + structured failure handling.
 *
 * Issue #53: the previous wrapper layered a "trusted user-data root" gate
 * (USERPROFILE/APPDATA/$HOME) on top of `writeSettings`. That gate was
 * fundamentally wrong for AE Support Files — the Support Root is always
 * the ExtendScript-detected AE install folder, and UAC escalation is
 * the supported write mechanism. The gate has been removed from
 * `storage/persistence/managed-root.ts` and this wrapper now does only:
 *
 *   1. Call `writeSettingsViaStorage` (standard write). Succeed ⇒ done.
 *   2. On ANY failure, call `writeFileWithElevation` (UAC on Windows,
 *      osascript on macOS). Succeed ⇒ done.
 *   3. On elevated failure too, throw a structured `OnboardingFinishError`
 *      carrying path, reason, and next action (Issue #29 acceptance
 *      criteria).
 *
 * There is no pre-flight probe. The probe from #48 was making the wrong
 * decision because it tried to write `…/ty-plus/settings/app.json` without
 * creating the parent directory; the actual elevated write DOES create
 * the parent. Removing the probe eliminates the misleading
 * `admin_probe_failed: ENOENT ...` branch the user was seeing.
 */

import { writeSettingsPathsJson } from "@/management/setting/persistence/settings-json-files";
import { writeSettings as writeSettingsViaStorage } from "@/management/storage";
import {
	type ElevationWriteResult,
	writeFileWithElevation,
} from "@/management/storage/write/elevation-service";
import {
	OnboardingFinishError,
	type OnboardingFinishErrorPlatform,
} from "./finish-error";
import { canAttemptElevation, detectPlatform } from "./trusted-root-policy";

/** Phase label used in the wrapped error and the log line. */
const FINISH_PHASE_SETTINGS_WRITE = "settings-write" as const;

type SupportRootReader = (jsonText: string) => string | null;

const defaultSupportRootReader: SupportRootReader = (jsonText) => {
	try {
		const parsed = JSON.parse(jsonText) as {
			core?: { paths?: { supportRoot?: unknown } };
		};
		const value = parsed?.core?.paths?.supportRoot;
		return typeof value === "string" && value.trim() ? value.trim() : null;
	} catch {
		return null;
	}
};

export type FinishWriteSettingsResult =
	| { readonly result: "wrote"; readonly path: string }
	| { readonly result: "elevated"; readonly path: string };

export type WriteSettingsForFinish = (
	win: Window,
	jsonText: string,
) => Promise<FinishWriteSettingsResult>;

/**
 * Compute the absolute file path under the managed root for a relative
 * file path (e.g. `"settings/app.json"`, `"settings/paths.json"`).
 * Mirrors the path composition in `management/storage/persistence/paths.ts`
 * combined with the `…/ty-plus` suffix in `managed-root.ts`.
 */
export const computeManagedFilePath = (
	supportRoot: string,
	relativePath: string,
): string => {
	const normalized = supportRoot.replace(/[\\/]+$/, "");
	const hasManagedSuffix = /[\\/]ty-plus$/i.test(normalized);
	const withSuffix = hasManagedSuffix ? normalized : `${normalized}/ty-plus`;
	const cleanedRelative = relativePath.replace(/^[\\/]+/, "");
	return `${withSuffix.replace(/\\/g, "/")}/${cleanedRelative}`;
};

/**
 * Wrap `writeSettingsForFinish` so it always writes `paths.json` (a
 * `Record<string, unknown>` payload) instead of a settings JSON text.
 * Used by `complete.ts` when injecting an elevation-aware
 * `writeSettingsPathsJson`. The payload itself contains
 * `core.paths.supportRoot`, which is reused for the elevation fallback.
 */
export const writeSettingsPathsJsonForFinish = async (
	win: Window,
	payload: Record<string, unknown>,
): Promise<FinishWriteSettingsResult> => {
	const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
	return writeJsonFileWithElevationFallback({
		win,
		jsonText,
		relativePath: "settings/paths.json",
		readSupportRoot: (raw) => {
			// paths.json payload is the bare `core.paths` object, so it
			// contains `supportRoot` at the top level.
			const candidate = (payload as { supportRoot?: unknown }).supportRoot;
			return typeof candidate === "string" && candidate.trim()
				? candidate.trim()
				: null;
		},
		standardCall: () => writeSettingsPathsJson(win, payload),
	});
};

/**
 * Try the merged settings JSON (`settings/app.json`) via the standard
 * `writeSettings` path. On any failure, attempt a single UAC/osascript
 * elevation write into the same file path. Throw a structured
 * `OnboardingFinishError` when both fail.
 */
export const writeSettingsForFinish = async (
	win: Window,
	jsonText: string,
	options: FinishSettingsWriteOptions = {},
): Promise<FinishWriteSettingsResult> =>
	writeJsonFileWithElevationFallback({
		win,
		jsonText,
		relativePath: "settings/app.json",
		readSupportRoot: options.readSupportRoot ?? defaultSupportRootReader,
		standardCall: () => writeSettingsViaStorage(win, jsonText),
	});

export interface FinishSettingsWriteOptions {
	/**
	 * Injection point for tests. Defaults to reading `core.paths.supportRoot`
	 * from the merged settings JSON.
	 */
	readonly readSupportRoot?: SupportRootReader;
}

interface WriteJsonWithElevationInput {
	readonly win: Window;
	readonly jsonText: string;
	/** Path under the managed root, e.g. `"settings/app.json"`. */
	readonly relativePath: string;
	readonly readSupportRoot: SupportRootReader;
	readonly standardCall: () => Promise<void>;
}

/**
 * Shared implementation for `writeSettingsForFinish` and
 * `writeSettingsPathsJsonForFinish`. Computes the target file path,
 * calls the standard write, and on failure tries a single elevated write
 * before surfacing a structured `OnboardingFinishError`.
 */
const writeJsonFileWithElevationFallback = async (
	input: WriteJsonWithElevationInput,
): Promise<FinishWriteSettingsResult> => {
	const supportRoot = input.readSupportRoot(input.jsonText);
	if (!supportRoot) {
		throw buildMissingSupportRootError(input.jsonText, input.relativePath);
	}

	const platform = detectPlatform(input.win);
	const canElevate = canAttemptElevation(input.win);
	const targetPath = computeManagedFilePath(supportRoot, input.relativePath);

	// 1. Standard write. Succeed ⇒ done.
	try {
		await input.standardCall();
		return { result: "wrote", path: targetPath };
	} catch {
		// Fall through to elevation attempt.
	}

	// 2. Elevated write. If elevation isn't available (e.g. pure unit test
	//    window without cep_node), surface the standard-write error directly.
	if (!canElevate) {
		throw buildWriteRejectedError({
			path: targetPath,
			platform,
			canElevate,
			elevatedResult: null,
		});
	}

	const elevated = await attemptElevatedWrite(
		input.win,
		targetPath,
		input.jsonText,
	);
	if (elevated.ok) {
		return { result: "elevated", path: targetPath };
	}

	// 3. Both standard and elevated failed.
	throw buildWriteRejectedError({
		path: targetPath,
		platform,
		canElevate,
		elevatedResult: elevated,
	});
};

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

const attemptElevatedWrite = async (
	win: Window,
	targetPath: string,
	jsonText: string,
): Promise<ElevationWriteResult> => {
	// `writeFileWithElevation`'s PowerShell script already creates the
	// parent directory if it does not exist (see `elevation-service.ts`:
	// `$parentDir = Split-Path -Parent $filePath; if (-not (Test-Path
	// $parentDir)) { New-Item ... }`).
	const normalizedContent = (() => {
		try {
			return `${JSON.stringify(JSON.parse(jsonText), null, 2)}\n`;
		} catch {
			return jsonText;
		}
	})();
	return writeFileWithElevation(win, targetPath, normalizedContent);
};

const buildWriteRejectedError = (params: {
	path: string;
	platform: OnboardingFinishErrorPlatform;
	canElevate: boolean;
	elevatedResult: ElevationWriteResult | null;
}): OnboardingFinishError => {
	const { path, platform, canElevate, elevatedResult } = params;
	const innerDetail =
		elevatedResult == null
			? "The standard write was rejected and no elevation path was available."
			: describeElevationFailure(elevatedResult);
	const reasonDetail = `Settings write could not land the file at ${path}. ${innerDetail}`;
	return new OnboardingFinishError({
		phase: FINISH_PHASE_SETTINGS_WRITE,
		path,
		reasonCode: "write_rejected_other",
		reasonDetail,
		platform,
		canAttemptElevation: canElevate,
		nextAction:
			canElevate && platform === "windows"
				? "retry_with_elevation"
				: "adjust_support_root",
	});
};

const describeElevationFailure = (result: ElevationWriteResult): string => {
	if (result.elevatedConsentDenied) {
		return "The UAC consent prompt was dismissed (admin escalation was not granted).";
	}
	const exitCodeNote =
		result.exitCode >= 0 ? ` Inner script exit code: ${result.exitCode}.` : "";
	if (result.stderr) {
		return `The elevated write reported an error.${exitCodeNote} Inner script stderr: ${result.stderr.trim()}`;
	}
	return `The elevated write reported an error.${exitCodeNote}`;
};

const buildMissingSupportRootError = (
	jsonText: string,
	relativePath: string,
): OnboardingFinishError => {
	const fallbackPath = `(merged settings JSON for ${relativePath} missing core.paths.supportRoot)`;
	const detail =
		"Onboarding finish could not extract core.paths.supportRoot from the merged settings JSON.";
	return new OnboardingFinishError({
		phase: FINISH_PHASE_SETTINGS_WRITE,
		path: fallbackPath,
		reasonCode: "missing_support_root",
		reasonDetail: detail,
		platform: "unknown",
		canAttemptElevation: false,
		nextAction: "choose_trusted_root",
	});
};
