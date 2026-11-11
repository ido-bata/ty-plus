/**
 * Workspace UI settings file (`settings/ui.json`).
 * Domain parse/serialize from setting models; bytes via json-file-store only.
 */

import { createLogger } from "@/management/debug/logger";
import {
	parseUiSettings,
	serializeUiSettings,
} from "@/management/setting/models/workspace-ui-settings";
import { resolveSupportRootFromWindow } from "@/management/setting/persistence/cep-support-root";
import { resolveTyPlusManagedRootForPersistence } from "@/management/setting/persistence/ty-plus-managed-root";
import {
	resolveManagedRoot,
	resolveSettingsUiJsonPath,
} from "@/management/storage/file";
import {
	parseJsonObject,
	readJsonFileText,
	stringifyJson,
} from "@/management/storage/read/json-file";
import { writeJsonFileText } from "@/management/storage/write/json-file";

const uiSettingsLog = createLogger("workspace");

/** Outcome of one root-resolution step, for the skipped-write diagnostic. */
type RootStepOutcome = "resolved" | "null" | "not-attempted";

type SettingsManagedRootResolution = {
	/** Managed root, or `null` when no step produced one. */
	root: string | null;
	/** Which step produced `root`; `none` means every attempted step failed. */
	source: "explicit" | "persistence-settings" | "host-support" | "none";
	/**
	 * Per-step outcome. A write that has to skip logs this so the console can
	 * name the branch that failed instead of showing nothing at all
	 * (Issue #216: `settings/ui.json` vanished with no trace and no log).
	 */
	steps: {
		explicitSupportRoot: RootStepOutcome;
		persistenceSettingsRoot: RootStepOutcome;
		hostSupportRoot: RootStepOutcome;
	};
};

const resolveSettingsManagedRootWithDiagnostics = async (
	win: Window,
	supportRoot?: string,
): Promise<SettingsManagedRootResolution> => {
	const explicit = supportRoot?.trim();
	if (explicit) {
		return {
			root: resolveManagedRoot(explicit.replace(/[\\/]+$/, "")),
			source: "explicit",
			steps: {
				explicitSupportRoot: "resolved",
				persistenceSettingsRoot: "not-attempted",
				hostSupportRoot: "not-attempted",
			},
		};
	}
	const fromSettings = await resolveTyPlusManagedRootForPersistence(win, {
		requireExistingDirectory: false,
	});
	if (fromSettings) {
		return {
			root: fromSettings,
			source: "persistence-settings",
			steps: {
				explicitSupportRoot: "null",
				persistenceSettingsRoot: "resolved",
				hostSupportRoot: "not-attempted",
			},
		};
	}
	const hostSupportRoot = resolveSupportRootFromWindow(win);
	return {
		root: hostSupportRoot ? resolveManagedRoot(hostSupportRoot) : null,
		source: hostSupportRoot ? "host-support" : "none",
		steps: {
			explicitSupportRoot: "null",
			persistenceSettingsRoot: "null",
			hostSupportRoot: hostSupportRoot ? "resolved" : "null",
		},
	};
};

const resolveSettingsManagedRoot = async (
	win: Window,
	supportRoot?: string,
): Promise<string | null> =>
	(await resolveSettingsManagedRootWithDiagnostics(win, supportRoot)).root;

/**
 * A write with no managed root would otherwise be indistinguishable from a
 * successful one: `if (!root) return` throws nothing, so neither the caller's
 * catch nor a stage logger ever fires. Make the drop observable.
 */
const reportSkippedWrite = (
	action: string,
	supportRoot: string | undefined,
	resolution: SettingsManagedRootResolution,
): void => {
	uiSettingsLog.warn("ui settings write skipped: no managed root", {
		action,
		context: {
			supportRoot: supportRoot ?? null,
			source: resolution.source,
			steps: resolution.steps,
		},
	});
};

export const readUiSettings = async (
	win: Window,
	supportRoot?: string,
): Promise<ReturnType<typeof parseUiSettings>> => {
	const root = await resolveSettingsManagedRoot(win, supportRoot);
	if (!root) return parseUiSettings(null);

	const path = resolveSettingsUiJsonPath(root);
	const raw = await readJsonFileText(win, path);
	if (raw === null) return parseUiSettings(null);

	const parsed = parseJsonObject(raw);
	return parseUiSettings(parsed ?? null);
};

export const writeUiSettings = async (
	win: Window,
	settings: Parameters<typeof serializeUiSettings>[0],
	supportRoot?: string,
): Promise<void> => {
	const resolution = await resolveSettingsManagedRootWithDiagnostics(
		win,
		supportRoot,
	);
	if (!resolution.root) {
		reportSkippedWrite(
			"writeUiSettings:skipped-no-root",
			supportRoot,
			resolution,
		);
		return;
	}

	const path = resolveSettingsUiJsonPath(resolution.root);
	const serialized = serializeUiSettings(settings);
	await writeJsonFileText(win, path, stringifyJson(serialized));
};

export const ensureUiSettingsFile = async (
	win: Window,
	supportRoot?: string,
): Promise<void> => {
	const resolution = await resolveSettingsManagedRootWithDiagnostics(
		win,
		supportRoot,
	);
	if (!resolution.root) {
		reportSkippedWrite(
			"ensureUiSettingsFile:skipped-no-root",
			supportRoot,
			resolution,
		);
		return;
	}

	const path = resolveSettingsUiJsonPath(resolution.root);
	const existing = await readJsonFileText(win, path);
	if (existing !== null) return;

	await writeJsonFileText(
		win,
		path,
		stringifyJson({
			version: 1,
			showGridOverlay: true,
			showPresetLabels: true,
			selectedFont: "",
		}),
	);
};
