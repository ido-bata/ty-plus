export type HostId = "after-effects";

export type OperatingSystem = "macos" | "windows" | "unknown";

/** Host context payload from the active After Effects ExtendScript session. */
export type HostContext = {
	appRoot: string;
	supportRoot: string;
	sessionId: string;
};

/**
 * Root classification reported by the ExtendScript save-root authority
 * (`authorizeSaveDir` in `host-bundle.ext.ts`), which is the same root
 * model used for read and execute (`assertAllowedFilePath`).
 *
 * The vocabulary is intentionally closed to those roots: an authoring
 * target outside them would be written but refused by `runScriptFile` /
 * `applyPresetFile`, so there is no fourth class. Whether a privileged
 * write is needed is a separate question decided by permission failure in
 * `src/management/storage/write/authoring-write.ts`.
 */
export type PresetSaveRootClass = "ae-support" | "user-data" | "extension";

export type PreparePresetSaveBaseInput = {
	name: string;
	saveDir: string;
};

export type PrepareLayerCompPresetScriptInput = PreparePresetSaveBaseInput & {
	type?: string;
};

export type PrepareCodePresetScriptInput = PreparePresetSaveBaseInput;

export type PrepareEasingPresetScriptInput = PreparePresetSaveBaseInput & {
	cubic: [number, number, number, number];
	/** Optional: multi-point easing data. When present, the generated .jsx
	 *  preserves the full multi-ease structure instead of collapsing to a
	 *  single cubic. */
	points?: [number, number, number, number, number, number][];
	/** Optional: label color (1-16) to apply on the eased keyframes. */
	labelColor?: number;
};

export type PrepareAnimationPresetTargetInput = PreparePresetSaveBaseInput;

/** Authorized authoring target: no bytes have been written yet. */
export type PreparedPresetSaveTarget = {
	targetPath: string;
	rootClass: PresetSaveRootClass;
};

/** Authorized target plus the AE-dependent script content to write. */
export type PreparedPresetScriptAsset = PreparedPresetSaveTarget & {
	content: string;
};

/** One row from `scanPluginEffectRoots` (matches `PluginEffectIndexRow` in workspace state). */
export type AexEffectScanRow = {
	filePath: string;
	matchName: string;
	displayName: string;
};

export type AfterEffectsHostApi = {
	/** Returns the host context (app.path, support root, and session ID). */
	getHostContext(): Promise<HostContext>;
	ping(): Promise<unknown>;
	runScriptFile(filePath: string): Promise<unknown>;
	applyPreset(filePath: string): Promise<unknown>;
	addFootage(input: { filePath: string; toComp?: boolean }): Promise<unknown>;
	/**
	 * Verify whether a preset asset file currently exists on disk.
	 * Returns `{ exists, path }` where `path` is the canonical fsName form.
	 * Used at startup to detect stale records (Issue #130) and after every
	 * write as a transactional-ordering check.
	 */
	verifyPresetAsset(
		filePath: string,
	): Promise<{ exists: boolean; path: string }>;
	/** Scan `.aex` under the given folders (typically `pluginRoot`) for effect match names. */
	scanPluginEffectRoots(roots: string[]): Promise<{ rows: AexEffectScanRow[] }>;
	/** Apply an effect to selected layers by AE match name (from PiPL / manifest scan). */
	applyEffectByMatchName(matchName: string): Promise<unknown>;
	applyEasing(payload: Record<string, unknown>): Promise<unknown>;
	/** Apply a single curve shape replicated `loopCount` times across the
	 *  (k1, k2) range. Loop is in-targeting-only; other targeting values
	 *  should use `applyEasing`. See docs/architecture/widget-boundary.md
	 *  "Easing Widget: Loop モード". */
	applyLoopEasing(payload: Record<string, unknown>): Promise<unknown>;
	setAnchorPoint(input: { position: string }): Promise<unknown>;
	captureEasingCurve(): Promise<unknown>;
	/** Read per-keyframe values from the selected keyframes on the active
	 *  property. Returns `{ values: number[][] }` where each inner array is the
	 *  keyframe value (1D, 2D, 3D, or color — depending on property type).
	 *  Does NOT include easing. */
	captureKeyframeValues(): Promise<unknown>;
	/** Resolve the path to the easing-clipboard file under userData. */
	getEasingClipboardPath(): Promise<{ path: string }>;
	/** Write the provided values to the selected keyframes (preserves timing). */
	pasteKeyframeValues(input: { values: number[][] }): Promise<unknown>;
	/** Read AE's user-defined label color names (indices 1-16). */
	getLabelColorNames(): Promise<{ names: Record<string, string> }>;
	getFontBrowserEntries(): Promise<unknown>;
	writeSelectedTextLayers(input: { font: string }): Promise<unknown>;
	readSelectedTextLayers(): Promise<unknown>;
	/**
	 * Issue #160 authoring boundary. These resolve and authorize the
	 * canonical target (plus AE-dependent script content where needed) and
	 * never write bytes themselves — the CEP storage write boundary owns
	 * the normal write, the UAC fallback, and read-back verification.
	 */
	prepareAnimationPresetTarget(
		input: PrepareAnimationPresetTargetInput,
	): Promise<unknown>;
	/** Opens AE's native Save Animation Preset dialog for an authorized target. */
	openAnimationPresetSaveDialog(
		input: PrepareAnimationPresetTargetInput,
	): Promise<unknown>;
	prepareLayerCompPresetScript(
		input: PrepareLayerCompPresetScriptInput,
	): Promise<unknown>;
	prepareCodePresetScript(
		input: PrepareCodePresetScriptInput,
	): Promise<unknown>;
	prepareEasingPresetScript(
		input: PrepareEasingPresetScriptInput,
	): Promise<unknown>;
	getSelectionCount(): Promise<{ count: number }>;
	/** Returns the number of keyframe pairs the easing widget could
	 *  currently apply to. Used to short-circuit auto-apply when the
	 *  user has no usable selection so AE never sees a thrown alert. */
	getEasingSelectionCount(): Promise<{ pairs: number }>;
	alignLayers(input: { action: string; target: string }): Promise<unknown>;
};

/**
 * Revision of the host API contract this panel build expects.
 *
 * It answers exactly one question: "are the host methods this JS caller
 * is about to invoke compatible with the bundle already resident in
 * `$.global.__TY_PLUS_HOST__`?" It is deliberately NOT the package
 * version string — a version bump for an unrelated packaging change must
 * not force a host bundle reload, and a host API change must not pass
 * just because the package version happens to match.
 *
 * Bump this whenever the exported host method set or the shape of an
 * existing method changes.
 *
 * The ExtendScript bundle declares the same number as `__schemaVersion`
 * on `$.global.__TY_PLUS_HOST__` (see `src/management/ae/jsx/host-bundle.ext.ts`).
 * `host-bundle.ext.ts` cannot import this module — it is a standalone
 * ES3 bundle — so the two declarations are kept in sync and
 * `host-executor.test.ts` asserts they are equal.
 */
export const HOST_BUNDLE_SCHEMA_VERSION = 1;

/**
 * Implementation revision of the host bundle this panel build expects.
 *
 * Deliberately a *second* axis, kept apart from
 * `HOST_BUNDLE_SCHEMA_VERSION`:
 *
 * - **schema revision** — compatibility of the host API contract: the
 *   exported method set, argument shape, and return shape.
 * - **bundle revision** — *which implementation* of that contract is
 *   resident in `$.global.__TY_PLUS_HOST__`.
 *
 * Schema alone cannot express implementation compatibility: a host-side
 * bug fix that exports no new method and changes no signature keeps the
 * schema identical, and an AE session that is still running after an
 * extension update would reuse the stale implementation forever.
 *
 * It is NOT the package version either — an unrelated packaging or UI
 * bump must not force a host reload.
 *
 * Bump policy (`docs/architecture/runtime/host-boundary.md`):
 *
 * - implementation-only change (`host-bundle.ext.ts` runtime behaviour,
 *   a host method's implementation, a host-side helper) -> bump this.
 * - contract change (method added/removed, argument or return shape,
 *   call contract) -> bump both.
 *
 * The ExtendScript bundle declares the same string as `__bundleVersion`
 * on the resident global. It is a standalone ES3 bundle and cannot import
 * this module, so `host-executor.test.ts` pins the two declarations.
 */
export const HOST_BUNDLE_VERSION = "workspace-preset-scriptui-panel-v4";

type HostCode = "AEFT";

export interface HostAdapter extends AfterEffectsHostApi {
	code: HostCode;
	id: HostId;
}

export type HostFunctionCaller = <K extends keyof AfterEffectsHostApi>(
	method: K,
	args: Parameters<AfterEffectsHostApi[K]>,
) => Promise<{ hostId: HostId; method: K; value?: unknown }>;
