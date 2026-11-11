/**
 * Preset authoring orchestration — Issue #160.
 *
 * One sequence for every authored preset asset, regardless of type:
 *
 * ```text
 * path authority (ExtendScript `authorizeSaveDir`)
 * → AE-dependent content preparation (ExtendScript)
 * → normal native write (storage/write/authoring-write)
 * → permission failure only: privileged write
 * → read-back verification
 * → typed result the dialog turns into a metadata commit decision
 * ```
 *
 * ExtendScript never writes bytes here; it resolves and authorizes the
 * target and, where the content depends on the AE document, hands the
 * content back. The single privileged-write adapter is
 * `src/management/storage/write/elevation-service.ts`, reached only after
 * a permission failure.
 *
 * A failure of any stage returns `ok: false`. Callers persist catalog /
 * workspace records only after a success plus `assertPresetAssetPresent`,
 * so a cancelled UAC prompt can never leave a ghost record.
 */
import { createCepHostExecutor } from "@/management/ae/cep/host-executor";
import type {
	PrepareAnimationPresetTargetInput,
	PrepareCodePresetScriptInput,
	PrepareEasingPresetScriptInput,
	PrepareLayerCompPresetScriptInput,
	PresetSaveRootClass,
} from "@/management/ae/host/contract";
import { createLogger } from "@/management/debug/logger";
import {
	type AuthoringElevationResult,
	type AuthoringFirstAttempt,
	type AuthoringVerification,
	type AuthoringWriteErrorCode,
	type AuthoringWriteFailure,
	type AuthoringWriterKind,
	dirnameOf,
	ensureAuthoredDirectory,
	writeAuthoredTextAsset,
} from "@/management/storage/write/authoring-write";

export type PresetAuthoringFailureCode =
	| AuthoringWriteErrorCode
	| "path-rejected"
	| "invalid-input"
	| "host-preparation-failed";

export type PresetAuthoringSuccess = {
	readonly ok: true;
	readonly presetPath: string;
	readonly rootClass: PresetSaveRootClass;
	readonly writer: AuthoringWriterKind;
	readonly firstAttempt: AuthoringFirstAttempt;
	readonly elevationRequested: boolean;
	readonly elevationResult: AuthoringElevationResult;
	readonly verification: AuthoringVerification;
};

export type PresetAuthoringFailure = {
	readonly ok: false;
	readonly error: {
		readonly code: PresetAuthoringFailureCode;
		readonly message: string;
	};
	readonly path: string;
	readonly rootClass: PresetSaveRootClass | null;
	readonly writer: AuthoringWriterKind;
	readonly firstAttempt: AuthoringFirstAttempt;
	readonly elevationRequested: boolean;
	readonly elevationResult: AuthoringElevationResult;
	readonly verification: AuthoringVerification;
};

export type PresetAuthoringResult =
	| PresetAuthoringSuccess
	| PresetAuthoringFailure;

export type LayerCompAuthoringInput = PrepareLayerCompPresetScriptInput & {
	presetId?: string | null;
};

export type CodeAuthoringInput = PrepareCodePresetScriptInput & {
	/** Panel-authored script body; the host never receives it. */
	code: string;
	presetId?: string | null;
};

export type EasingAuthoringInput = PrepareEasingPresetScriptInput & {
	presetId?: string | null;
};

export type AnimationAuthoringInput = PrepareAnimationPresetTargetInput & {
	presetId?: string | null;
};

type PreparedTarget = {
	targetPath: string;
	rootClass: PresetSaveRootClass;
};

const authoringLog = createLogger("preset-execution");

/**
 * One Debug Console entry per authoring attempt with the final outcome.
 *
 * The writer already logs the write/elevation/verification breakdown;
 * this entry adds the preset identity and the `host-native-dialog`
 * writer used by the `.ffx` flow, which never reaches the byte writer.
 * Never logs content, only paths, classification, and typed codes.
 */
const traceAuthoringOutcome = (
	result: PresetAuthoringResult,
	details: Readonly<Record<string, unknown>>,
): void => {
	const context: Readonly<Record<string, unknown>> = {
		event: "preset.asset.authoring",
		presetKind: details.presetKind ?? null,
		presetId: details.presetId ?? null,
		path: result.ok ? result.presetPath : result.path,
		rootClass: result.rootClass,
		writer: result.writer,
		// Reported on success too: a save that escalated must not read as
		// "elevation never requested" on the very next line.
		firstAttempt: result.firstAttempt,
		elevationRequested: result.elevationRequested,
		elevationResult: result.elevationResult,
		verification: result.verification,
		finalErrorCode: result.ok ? null : result.error.code,
	};
	try {
		if (result.ok) {
			authoringLog.info("[ty-plus:preset-authoring] outcome", { context });
		} else {
			authoringLog.error("[ty-plus:preset-authoring] outcome", { context });
		}
	} catch {
		// Diagnostics are observational and must never break a save.
	}
};

const hostFailureCode = (message: string): PresetAuthoringFailureCode => {
	const normalized = message.toLowerCase();
	if (
		normalized.includes("outside allowed roots") ||
		normalized.includes("not an absolute path") ||
		normalized.includes("savedir is required")
	) {
		return "path-rejected";
	}
	if (normalized.includes("is required")) {
		return "invalid-input";
	}
	return "host-preparation-failed";
};

const invokeHost = async (
	run: () => Promise<{ value?: unknown }>,
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> => {
	try {
		const result = await run();
		return { ok: true, value: result.value };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
};

const coerceTarget = (value: unknown): PreparedTarget | null => {
	const candidate = value as Partial<PreparedTarget> | null | undefined;
	if (
		!candidate ||
		typeof candidate.targetPath !== "string" ||
		!candidate.targetPath ||
		typeof candidate.rootClass !== "string"
	) {
		return null;
	}
	return {
		targetPath: candidate.targetPath,
		rootClass: candidate.rootClass as PresetSaveRootClass,
	};
};

const preparationFailure = (
	message: string,
	path: string,
): PresetAuthoringFailure => ({
	ok: false,
	error: { code: hostFailureCode(message), message },
	path,
	rootClass: null,
	writer: "none",
	firstAttempt: "not-attempted",
	elevationRequested: false,
	elevationResult: "not-requested",
	verification: "not-attempted",
});

const writeFailure = (
	result: AuthoringWriteFailure,
): PresetAuthoringFailure => ({
	ok: false,
	error: { code: result.code, message: result.message },
	path: result.path,
	rootClass: result.rootClass,
	writer: result.writer,
	firstAttempt: result.firstAttempt,
	elevationRequested: result.elevationRequested,
	elevationResult: result.elevationResult,
	verification: result.verification,
});

/**
 * Shared text-asset sequence: host prepares the authorized target and the
 * script content, the common writer lands and verifies the bytes.
 */
const authorTextAsset = async (
	win: Window,
	input: {
		prepare: (
			caller: ReturnType<typeof createCepHostExecutor>,
		) => Promise<{ value?: unknown }>;
		presetKind: string;
		presetId?: string | null;
		/**
		 * Panel-authored body. When omitted the AE-dependent content the
		 * host prepared (Layer / Comp, Easing) is used — code presets never
		 * round-trip their body through ExtendScript.
		 */
		panelContent?: string;
	},
): Promise<PresetAuthoringResult> => {
	const caller = createCepHostExecutor(win, "after-effects");
	const prepared = await invokeHost(() => input.prepare(caller));
	if (!prepared.ok) {
		return preparationFailure(prepared.message, "");
	}
	const target = coerceTarget(prepared.value);
	if (!target) {
		return preparationFailure(
			"Preset authoring preparation returned no authorized target path",
			"",
		);
	}
	const content =
		input.panelContent ??
		(prepared.value as { content?: unknown } | null | undefined)?.content;
	if (typeof content !== "string") {
		return preparationFailure(
			"Preset authoring preparation returned no script content",
			target.targetPath,
		);
	}
	const written = await writeAuthoredTextAsset({
		win,
		targetPath: target.targetPath,
		content,
		rootClass: target.rootClass,
		presetKind: input.presetKind,
		presetId: input.presetId ?? null,
	});
	if (!written.ok) {
		return writeFailure(written);
	}
	return {
		ok: true,
		presetPath: target.targetPath,
		rootClass: target.rootClass,
		writer: written.writer,
		firstAttempt: written.firstAttempt,
		elevationRequested: written.elevationRequested,
		elevationResult: written.elevationResult,
		verification: written.verification,
	};
};

/**
 * Layer / Comp preset: AE supplies the saved project path and the script
 * content, CEP writes and verifies the bytes.
 */
export const authorLayerCompPresetAsset = async (
	win: Window,
	input: LayerCompAuthoringInput,
): Promise<PresetAuthoringResult> => {
	const { presetId, ...prepareInput } = input;
	const presetKind = prepareInput.type === "comp" ? "comp" : "layer";
	const result = await authorTextAsset(win, {
		prepare: (caller) => caller("prepareLayerCompPresetScript", [prepareInput]),
		presetKind,
		presetId,
	});
	traceAuthoringOutcome(result, { presetKind, presetId });
	return result;
};

/** Code preset: the panel authors the content, the host only authorizes. */
export const authorCodePresetAsset = async (
	win: Window,
	input: CodeAuthoringInput,
): Promise<PresetAuthoringResult> => {
	const { presetId, code, ...prepareInput } = input;
	// The host no longer receives the body, so the "empty body" guard that
	// used to live in `writeCodePresetScript` has to stay here — otherwise
	// an empty `.jsx` would be written and registered.
	if (!String(code ?? "").trim()) {
		const result = preparationFailure("code is required", "");
		traceAuthoringOutcome(result, { presetKind: "code", presetId });
		return result;
	}
	const result = await authorTextAsset(win, {
		prepare: (caller) => caller("prepareCodePresetScript", [prepareInput]),
		presetKind: "code",
		presetId,
		panelContent: code,
	});
	traceAuthoringOutcome(result, { presetKind: "code", presetId });
	return result;
};

/** Easing preset: the host generates the apply script, CEP writes it. */
export const authorEasingPresetAsset = async (
	win: Window,
	input: EasingAuthoringInput,
): Promise<PresetAuthoringResult> => {
	const { presetId, ...prepareInput } = input;
	const result = await authorTextAsset(win, {
		prepare: (caller) => caller("prepareEasingPresetScript", [prepareInput]),
		presetKind: "easing",
		presetId,
	});
	traceAuthoringOutcome(result, { presetKind: "easing", presetId });
	return result;
};

/**
 * Animation preset (`.ffx`).
 *
 * After Effects' native Save Animation Preset dialog owns the actual file
 * write, so the contract is: authorize the save root, make sure the
 * target directory exists (elevating only if the normal creation hit a
 * permission error), open the native dialog, and let the caller verify
 * the resulting `.ffx` before any metadata is committed.
 */
export const saveAnimationPresetAsset = async (
	win: Window,
	input: AnimationAuthoringInput,
): Promise<PresetAuthoringResult> => {
	const result = await runAnimationAuthoring(win, input);
	traceAuthoringOutcome(result, {
		presetKind: "animation",
		presetId: input.presetId ?? null,
	});
	return result;
};

const runAnimationAuthoring = async (
	win: Window,
	input: AnimationAuthoringInput,
): Promise<PresetAuthoringResult> => {
	const { presetId, ...prepareInput } = input;
	const caller = createCepHostExecutor(win, "after-effects");

	const prepared = await invokeHost(() =>
		caller("prepareAnimationPresetTarget", [prepareInput]),
	);
	if (!prepared.ok) {
		return preparationFailure(prepared.message, "");
	}
	const target = coerceTarget(prepared.value);
	if (!target) {
		return preparationFailure(
			"Preset authoring preparation returned no authorized target path",
			"",
		);
	}

	const directory = await ensureAuthoredDirectory({
		win,
		targetDir: dirnameOf(target.targetPath),
		rootClass: target.rootClass,
		presetKind: "animation",
		presetId: presetId ?? null,
	});
	if (!directory.ok) {
		return writeFailure(directory);
	}

	const opened = await invokeHost(() =>
		caller("openAnimationPresetSaveDialog", [prepareInput]),
	);
	if (!opened.ok) {
		return preparationFailure(opened.message, target.targetPath);
	}
	const presetPath = (opened.value as { presetPath?: unknown } | null)
		?.presetPath;
	return {
		ok: true,
		presetPath:
			typeof presetPath === "string" && presetPath
				? presetPath
				: target.targetPath,
		rootClass: target.rootClass,
		writer: "host-native-dialog",
		firstAttempt: directory.firstAttempt,
		elevationRequested: directory.elevationRequested,
		elevationResult: directory.elevationResult,
		// The directory step is what this branch verified; the `.ffx` bytes
		// are owned by AE and re-checked by `assertPresetAssetPresent`
		// before any record commits.
		verification: "not-attempted",
	};
};

/**
 * The single authoring surface handed to preset tool dialogs. Every
 * preset type goes through the same writer, so no dialog can carry its
 * own fallback logic.
 */
export type PresetAuthoringWriter = {
	layerComp(input: LayerCompAuthoringInput): Promise<PresetAuthoringResult>;
	code(input: CodeAuthoringInput): Promise<PresetAuthoringResult>;
	easing(input: EasingAuthoringInput): Promise<PresetAuthoringResult>;
	animation(input: AnimationAuthoringInput): Promise<PresetAuthoringResult>;
};

export const createPresetAuthoringWriter = (
	win: Window,
): PresetAuthoringWriter => ({
	layerComp: (input) => authorLayerCompPresetAsset(win, input),
	code: (input) => authorCodePresetAsset(win, input),
	easing: (input) => authorEasingPresetAsset(win, input),
	animation: (input) => saveAnimationPresetAsset(win, input),
});
