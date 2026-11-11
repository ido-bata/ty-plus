import {
	type AfterEffectsHostApi,
	HOST_BUNDLE_SCHEMA_VERSION,
	HOST_BUNDLE_VERSION,
	type HostFunctionCaller,
	type HostId,
} from "@/management/ae/host/contract";
import { createLogger } from "@/management/debug/logger";

const hostBridgeLog = createLogger("host-bridge");

type CepWindowWithEvalScript = {
	__adobe_cep__?: {
		evalScript?: (script: string, callback?: (result: string) => void) => void;
		getSystemPath?: (identifier: string) => string;
	};
	CSInterface?: new () => {
		evalScript?: (script: string, callback?: (result: string) => void) => void;
		getSystemPath?: (identifier: string) => string;
	};
	SystemPath?: {
		EXTENSION?: string;
	};
};

const HOST_BUNDLE_NAMESPACE = "__TY_PLUS_HOST__";
const HOST_BUNDLE_GLOBAL_REF = `$.global['${HOST_BUNDLE_NAMESPACE}']`;
const HOST_BUNDLE_RELATIVE_PATH = "jsx/ty-plus-host.jsx";
const ALLOWED_HOST_METHODS = new Set<keyof AfterEffectsHostApi>([
	"getHostContext",
	"ping",
	"runScriptFile",
	"applyPreset",
	"addFootage",
	"verifyPresetAsset",
	"scanPluginEffectRoots",
	"applyEffectByMatchName",
	"applyEasing",
	"applyLoopEasing",
	"setAnchorPoint",
	"captureEasingCurve",
	"captureKeyframeValues",
	"getEasingClipboardPath",
	"pasteKeyframeValues",
	"getLabelColorNames",
	"getFontBrowserEntries",
	"writeSelectedTextLayers",
	"readSelectedTextLayers",
	"prepareAnimationPresetTarget",
	"openAnimationPresetSaveDialog",
	"prepareLayerCompPresetScript",
	"prepareCodePresetScript",
	"prepareEasingPresetScript",
	"getSelectionCount",
	"getEasingSelectionCount",
	"alignLayers",
]);

const escapeScriptString = (value: string) =>
	value
		.replaceAll("\\", "\\\\")
		.replaceAll("'", "\\'")
		.replaceAll("\r", "\\r")
		.replaceAll("\n", "\\n")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");

const hostAlertScript = (message: string) => `
(function() {
  try {
    alert('Ty Plus execution failed:\\n${escapeScriptString(message)}');
  } catch (_alertError) {}
})();
`;

const normalizeCepPath = (value: string) =>
	value.replaceAll("\\", "/").replace(/\/+$/, "");

const getEvalScript = (win: Window) => {
	const cepWindow = win as unknown as CepWindowWithEvalScript;
	const fromAdobeCep = cepWindow.__adobe_cep__?.evalScript;
	if (typeof fromAdobeCep === "function") {
		return fromAdobeCep.bind(cepWindow.__adobe_cep__);
	}

	if (cepWindow.CSInterface) {
		try {
			const cs = new cepWindow.CSInterface();
			if (typeof cs.evalScript === "function") {
				return cs.evalScript.bind(cs);
			}
		} catch (e) {
			hostBridgeLog.warn("[ty-plus] CSInterface constructor failed", {
				context: { error: String(e) },
			});
		}
	}

	hostBridgeLog.error(
		"[ty-plus] CEP evalScript not available. Checked: __adobe_cep__.evalScript, new CSInterface().evalScript",
	);
	return null;
};

const resolveExtensionRoot = (win: Window) => {
	const cepWindow = win as unknown as CepWindowWithEvalScript;
	const identifier = cepWindow.SystemPath?.EXTENSION ?? "extension";
	const fromAdobeCep = cepWindow.__adobe_cep__?.getSystemPath?.(identifier);
	if (typeof fromAdobeCep === "string" && fromAdobeCep.trim()) {
		return normalizeCepPath(fromAdobeCep);
	}

	if (cepWindow.CSInterface) {
		const cs = new cepWindow.CSInterface();
		const fromCsInterface = cs.getSystemPath?.(identifier);
		if (typeof fromCsInterface === "string" && fromCsInterface.trim()) {
			return normalizeCepPath(fromCsInterface);
		}
	}

	return null;
};

const runEvalScript = (win: Window, script: string) =>
	new Promise<string>((resolve, reject) => {
		const evalScript = getEvalScript(win);
		if (!evalScript) {
			reject(new Error("CEP evalScript not available"));
			return;
		}

		evalScript(script, (result: string) => {
			resolve(result ?? "null");
		});
	});

const alertHostExecutionFailure = async (win: Window, message: string) => {
	try {
		await runEvalScript(win, hostAlertScript(message));
	} catch (_alertError) {
		// The original execution failure is more important than alert delivery.
	}
};

const parseHostJsonResult = <T>(result: string, stage: string): T => {
	const normalized = typeof result === "string" ? result.trim() : "";
	if (!normalized) {
		throw new Error(`${stage} returned an empty evalScript result`);
	}
	try {
		return JSON.parse(normalized) as T;
	} catch (_error) {
		throw new Error(
			`${stage} returned non-JSON evalScript result: ${normalized.slice(0, 240)}`,
		);
	}
};

export const probeAfterEffectsEvalScript = async (
	win: Window,
): Promise<unknown> => {
	const result = await runEvalScript(
		win,
		`
(function() {
  function q(value) {
    return '"' + String(value).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"').replace(/\\r/g, "\\\\r").replace(/\\n/g, "\\\\n") + '"';
  }
  try {
    return '{' +
      '"ok":true,' +
      '"appName":' + q(app && app.name ? String(app.name) : "") + ',' +
      '"appVersion":' + q(app && app.version ? String(app.version) : "") + ',' +
      '"extendscriptVersion":' + q($.version ? String($.version) : "") + ',' +
      '"hasJson":' + (typeof JSON === "object" && typeof JSON.stringify === "function") + ',' +
      '"hasGlobalHost":' + !!($.global && $.global.__TY_PLUS_HOST__) +
    '}';
  } catch (error) {
    return '{"ok":false,"error":{"message":' + q("ExtendScript probe failed: " + String(error)) + '}}';
  }
})();
`,
	);
	return parseHostJsonResult<unknown>(result, "ExtendScript probe");
};

// ── Host bundle load coordinator (Issue #158) ──────────────────────────────
//
// Every `createCepHostExecutor()` used to own a fresh `loadedRef`, so the
// moment a caller created a second executor — workspace runtime, preset
// dialogs, font viewer, directory browser, per-execution verification —
// the load state was lost and `$.evalFile` ran again even though a
// compatible bundle was already resident in `$.global.__TY_PLUS_HOST__`.
// That is the `loading host bundle` storm.
//
// Ownership of the *flight* is per `Window`, held in a module-level WeakMap:
//
//   concurrent first callers -> one shared in-flight Promise (single-flight)
//   compatible resident bundle -> probe only, no `$.evalFile`
//   absent / incompatible      -> at most one `$.evalFile` per flight
//   load failure               -> state returns to `idle` so the NEXT
//                                 operation may retry; the failed attempt
//                                 itself is never repeated concurrently
//
// A `Window` is NOT the host session: every surface of this extension (up to
// ~22 panels and modeless dialogs) has its own JS context, hence its own
// copy of this module and its own WeakMap entry, and all of them resolve to
// the same `$.global`. The WeakMap therefore cannot dedupe across surfaces —
// that is what the conditional `$.evalFile` inside the load block does (see
// `buildHostBundleLoadScript`). The host global is the cross-surface
// arbiter; no JS-side global flag and no polling are used.
//
// `$.evalFile` is additionally bounded by the observed compatibility
// fingerprint — `schema|bundleVersion`, not the schema alone. A successful
// load records both the fingerprint it produced and the one it was executed
// for, so a bundle that keeps loading a non-matching contract (stale API
// schema, stale implementation, or both) is not reloaded on every operation.

type HostBundleCoordinatorState = "idle" | "probing" | "loading" | "ready";

/**
 * What the resident bundle reports about itself.
 *
 * Two independent axes: `schemaVersion` answers "is this the API contract
 * I am about to call?" and `bundleVersion` answers "is it the
 * implementation I was built against?". Both are required — a host-side
 * fix that changes no signature keeps the schema identical.
 */
type HostBundleProbe = {
	readonly present: boolean;
	readonly schemaVersion: number | null;
	readonly bundleVersion: string | null;
};

/**
 * Compatibility of a resident (or post-load) bundle against what this
 * caller expects. Used by the JS probe AND mirrored by the host-side
 * conditional load block — the two must never disagree, or a surface that
 * loses the probe race would reload the bundle the winner just installed.
 */
const isCompatible = (
	schemaVersion: number | null,
	bundleVersion: string | null,
): boolean =>
	schemaVersion === HOST_BUNDLE_SCHEMA_VERSION &&
	bundleVersion === HOST_BUNDLE_VERSION;

/**
 * Reload-storm key. Schema alone would collapse "same contract,
 * different code" into one bucket, so the implementation revision is part
 * of the fingerprint: `old resident -> current disk` loads exactly once,
 * and `stale disk` fails fast instead of loading again per operation.
 */
const compatibilityFingerprint = (
	schemaVersion: number | null,
	bundleVersion: string | null,
): string =>
	schemaVersion === null ? "absent" : `${schemaVersion}|${bundleVersion ?? ""}`;

/** Human-readable mismatch, listing only the axes that actually differ. */
const compatibilityMismatch = (
	schemaVersion: number | null,
	bundleVersion: string | null,
): string => {
	const parts: string[] = [];
	if (schemaVersion !== HOST_BUNDLE_SCHEMA_VERSION)
		parts.push(
			`schema mismatch: expected ${HOST_BUNDLE_SCHEMA_VERSION}, observed ${
				schemaVersion === null ? "unreadable" : schemaVersion
			}`,
		);
	if (bundleVersion !== HOST_BUNDLE_VERSION)
		parts.push(
			`implementation revision mismatch: expected "${HOST_BUNDLE_VERSION}", observed ${
				bundleVersion === null ? "unreadable" : `"${bundleVersion}"`
			}`,
		);
	return parts.join("; ");
};

/** Probe distinguishes "not resident" from "unreadable". */
const HOST_BUNDLE_PROBE_SCRIPT = `
(function() {
  try {
    var bundle = $.global && $.global.__TY_PLUS_HOST__;
    if (!bundle || typeof bundle !== "object") {
      return JSON.stringify({ ok: true, present: false });
    }
    return JSON.stringify({
      ok: true,
      present: true,
      schemaVersion: typeof bundle.__schemaVersion === "number" ? bundle.__schemaVersion : -1,
      bundleVersion: typeof bundle.__bundleVersion === "string" ? bundle.__bundleVersion : ""
    });
  } catch (_error) {
    return JSON.stringify({ ok: false });
  }
})();
`;

/**
 * Conditional load + post-load verify, in ONE `evalScript` block.
 *
 * The JS-side coordinator is keyed per `Window`, but `$.global` is not: up
 * to ~22 CEP surfaces (panels + modeless dialogs) can run their own
 * coordinator against the same ExtendScript engine. Two surfaces can both
 * probe `absent` — or both probe a stale implementation — and both decide
 * to load; the JS `WeakMap` single-flight cannot see across that
 * boundary, and `host-bundle.ext.ts` overwrites
 * `$.global.__TY_PLUS_HOST__` unconditionally.
 *
 * `evalScript` blocks do not interleave on the AE main thread, so re-checking
 * the resident contract *inside* this block and only calling `$.evalFile`
 * when it is still absent/incompatible closes the window: whichever surface
 * runs first loads, the rest observe the contract it installed and skip.
 * No JS-side global flag and no polling — the host global is the arbiter.
 *
 * The re-check uses BOTH axes (`expectedSchema` and `expectedBundleVersion`)
 * and must match the JS probe's `isCompatible` exactly — otherwise a
 * surface that loses the probe race would reload what the winner installed.
 *
 * Both are written as plain `var`s so the CEP side and the test doubles can
 * read the contract this load was issued for.
 */
const buildHostBundleLoadScript = (jsxPath: string): string => `
(function() {
  var expectedSchema = ${HOST_BUNDLE_SCHEMA_VERSION};
  var expectedBundleVersion = '${escapeScriptString(HOST_BUNDLE_VERSION)}';
  try {
    var resident = $.global && $.global.__TY_PLUS_HOST__;
    var residentSchema = resident && typeof resident.__schemaVersion === "number" ? resident.__schemaVersion : -1;
    var residentBundleVersion = resident && typeof resident.__bundleVersion === "string" ? resident.__bundleVersion : "";
    if (resident && residentSchema === expectedSchema && residentBundleVersion === expectedBundleVersion) {
      return JSON.stringify({ ok: true, loaded: false, schemaVersion: residentSchema, bundleVersion: residentBundleVersion });
    }
    $.evalFile('${jsxPath}');
    var bundle = $.global && $.global.__TY_PLUS_HOST__;
    var schema = bundle && typeof bundle.__schemaVersion === "number" ? bundle.__schemaVersion : -1;
    var loadedBundleVersion = bundle && typeof bundle.__bundleVersion === "string" ? bundle.__bundleVersion : "";
    return JSON.stringify({ ok: true, loaded: true, schemaVersion: schema, bundleVersion: loadedBundleVersion });
  } catch (error) {
    try { alert('Ty Plus execution failed:\\nHost bundle load failed: ' + String(error)); } catch (_alertError) {}
    return JSON.stringify({
      ok: false,
      alerted: true,
      error: { message: "Host bundle load failed: " + String(error) }
    });
  }
})();
`;

/** Outcome of one conditional-load block: both axes plus whether we executed it. */
type HostBundleLoadResult = {
	readonly schemaVersion: number | null;
	readonly bundleVersion: string | null;
	readonly loaded: boolean;
};

/**
 * Read the resident bundle's compatibility markers.
 *
 * Throws when the probe itself could not be evaluated (empty / non-JSON
 * result, or a host-side `ok: false`). That is deliberately NOT treated
 * as "absent": reloading on an inconclusive probe is how a reload storm
 * starts, and if `evalScript` cannot run a probe it cannot run
 * `$.evalFile` either. The coordinator returns to `idle` so the next
 * operation can retry the probe.
 */
const readHostBundleProbe = async (win: Window): Promise<HostBundleProbe> => {
	const result = await runEvalScript(win, HOST_BUNDLE_PROBE_SCRIPT);
	const normalized = typeof result === "string" ? result.trim() : "";
	if (!normalized) {
		throw new Error("Host bundle probe returned an empty evalScript result");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(normalized);
	} catch {
		throw new Error("Host bundle probe returned a non-JSON evalScript result");
	}
	if (parsed === null || typeof parsed !== "object") {
		throw new Error(
			"Host bundle probe returned an unexpected evalScript result",
		);
	}
	const value = parsed as {
		ok?: unknown;
		present?: unknown;
		schemaVersion?: unknown;
		bundleVersion?: unknown;
	};
	if (value.ok !== true) {
		throw new Error("Host bundle probe failed");
	}
	return {
		present: value.present === true,
		schemaVersion:
			typeof value.schemaVersion === "number" ? value.schemaVersion : null,
		bundleVersion:
			typeof value.bundleVersion === "string" ? value.bundleVersion : null,
	};
};

/**
 * Runs the conditional-load block and reports BOTH compatibility axes from
 * the same round-trip, together with whether this surface actually executed
 * `$.evalFile` (it may have observed a bundle another surface installed).
 * An unreadable marker comes back as `null`, and the post-load compatibility
 * check then fails closed.
 */
const runHostBundleLoad = async (
	win: Window,
): Promise<HostBundleLoadResult> => {
	const extensionRoot = resolveExtensionRoot(win);
	if (!extensionRoot) {
		// No path to load: this is a configuration problem, not a transient
		// failure, so it surfaces as its own typed error rather than being
		// folded into a generic load failure.
		throw new Error(
			"Extension root is null. Host bundle path could not be resolved.",
		);
	}
	const jsxPath = escapeScriptString(
		`${extensionRoot}/${HOST_BUNDLE_RELATIVE_PATH}`,
	);
	const result = await runEvalScript(win, buildHostBundleLoadScript(jsxPath));
	let parsed: {
		ok?: boolean;
		loaded?: boolean;
		schemaVersion?: number;
		bundleVersion?: string;
		error?: { message?: string };
		alerted?: boolean;
	};
	try {
		parsed = parseHostJsonResult<{
			ok?: boolean;
			loaded?: boolean;
			schemaVersion?: number;
			bundleVersion?: string;
			error?: { message?: string };
			alerted?: boolean;
		}>(result, "Host bundle load");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await alertHostExecutionFailure(win, message);
		throw error;
	}
	if (!parsed.ok) {
		const message = parsed.error?.message ?? "Failed to load host bundle";
		if (!parsed.alerted) {
			await alertHostExecutionFailure(win, message);
		}
		throw new Error(message);
	}
	return {
		schemaVersion:
			typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : null,
		bundleVersion:
			typeof parsed.bundleVersion === "string" ? parsed.bundleVersion : null,
		loaded: parsed.loaded !== false,
	};
};

/**
 * Why a flight did not reach `ready`. Logged instead of the raw
 * ExtendScript message: load errors can embed the extension path, and
 * Issue #158 keeps paths out of the retained log. The full message still
 * travels on the thrown Error to the caller (and from there to the
 * dialog / failure trace).
 */
type HostBundleFailureReason =
	| "probe-failed"
	| "extension-root-unresolved"
	| "eval-file-failed"
	| "schema-mismatch"
	| "implementation-mismatch"
	| "incompatible-not-reloaded";

class HostBundleCoordinator {
	private state: HostBundleCoordinatorState = "idle";
	private inFlight: Promise<void> | null = null;
	/**
	 * Compatibility fingerprints (`schema|bundleVersion`, or `absent`) that
	 * a *successful* `$.evalFile` has already produced, plus the fingerprint
	 * it was executed for. Bounds reloads to one per distinct observed
	 * contract instead of one per operation — and, because the fingerprint
	 * carries the implementation revision, "same schema, stale code" is not
	 * collapsed with "current".
	 */
	private readonly loadedFor = new Set<string>();

	constructor(private readonly win: Window) {}

	/** Test/diagnostic visibility into the state machine. */
	get currentState(): HostBundleCoordinatorState {
		return this.state;
	}

	ensure(executorId: string): Promise<void> {
		if (this.state === "ready") return Promise.resolve();
		if (this.inFlight !== null) return this.inFlight;
		const flight = this.runOnce(executorId);
		this.inFlight = flight;
		const settle = (): void => {
			if (this.inFlight === flight) this.inFlight = null;
		};
		// Both branches clear the slot; the derived promise never rejects,
		// so the caller's handle on `flight` remains the only consumer.
		flight.then(settle, settle);
		return flight;
	}

	private fail(
		executorId: string,
		reason: HostBundleFailureReason,
		details: Readonly<Record<string, unknown>>,
		error: Error,
		nextState: HostBundleCoordinatorState,
	): never {
		this.state = nextState;
		hostBridgeLog.error(`[ty-plus] host bundle ${reason}`, {
			action: "host-bundle-load-failed",
			context: {
				executorId,
				reason,
				expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
				expectedBundleVersion: HOST_BUNDLE_VERSION,
				...details,
			},
		});
		throw error;
	}

	private async runOnce(executorId: string): Promise<void> {
		const startedAt = Date.now();
		this.state = "probing";

		let probe: HostBundleProbe;
		try {
			probe = await readHostBundleProbe(this.win);
		} catch (error) {
			return this.fail(
				executorId,
				"probe-failed",
				{ elapsedMs: Date.now() - startedAt },
				error instanceof Error ? error : new Error(String(error)),
				"idle",
			);
		}

		const observed = probe.schemaVersion;
		const observedBundle = probe.bundleVersion;
		hostBridgeLog.info("[ty-plus] host bundle probe", {
			action: "host-bundle-probe",
			context: {
				executorId,
				expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
				expectedBundleVersion: HOST_BUNDLE_VERSION,
				observedSchema: observed,
				observedBundleVersion: observedBundle,
				resident: probe.present,
				elapsedMs: Date.now() - startedAt,
			},
		});

		if (probe.present && isCompatible(observed, observedBundle)) {
			this.state = "ready";
			hostBridgeLog.info("[ty-plus] host bundle reused", {
				action: "host-bundle-reuse",
				context: {
					executorId,
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: observed,
					observedBundleVersion: observedBundle,
					elapsedMs: Date.now() - startedAt,
				},
			});
			return;
		}

		const observedKey = compatibilityFingerprint(observed, observedBundle);
		if (probe.present) {
			hostBridgeLog.warn("[ty-plus] host bundle contract changed; reloading", {
				action: "host-bundle-reload-incompatible",
				context: {
					executorId,
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: observed,
					observedBundleVersion: observedBundle,
					elapsedMs: Date.now() - startedAt,
				},
			});
		}
		if (this.loadedFor.has(observedKey)) {
			// A successful load already produced this contract and it still
			// does not satisfy the caller. Reloading again would restart the
			// storm this coordinator exists to stop.
			return this.fail(
				executorId,
				"incompatible-not-reloaded",
				{
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: observed,
					observedBundleVersion: observedBundle,
					elapsedMs: Date.now() - startedAt,
				},
				new Error(
					`Host bundle ${compatibilityMismatch(observed, observedBundle)}`,
				),
				"idle",
			);
		}

		this.state = "loading";
		hostBridgeLog.info("[ty-plus] host bundle loading", {
			action: "host-bundle-load-start",
			context: {
				executorId,
				expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
				expectedBundleVersion: HOST_BUNDLE_VERSION,
				observedSchema: observed,
				observedBundleVersion: observedBundle,
				reload: probe.present,
				elapsedMs: Date.now() - startedAt,
			},
		});

		const loadStartedAt = Date.now();
		let postLoad: HostBundleLoadResult;
		try {
			postLoad = await runHostBundleLoad(this.win);
		} catch (error) {
			// Transient: nothing was recorded, so the next operation
			// retries with a fresh single-flight attempt.
			return this.fail(
				executorId,
				error instanceof Error &&
					error.message ===
						"Extension root is null. Host bundle path could not be resolved."
					? "extension-root-unresolved"
					: "eval-file-failed",
				{ elapsedMs: Date.now() - loadStartedAt },
				error instanceof Error ? error : new Error(String(error)),
				"idle",
			);
		}

		this.loadedFor.add(observedKey);
		const postLoadSchema = postLoad.schemaVersion;
		const postLoadBundle = postLoad.bundleVersion;
		if (!isCompatible(postLoadSchema, postLoadBundle)) {
			// Record what the disk actually produced as well: a stale
			// on-disk implementation must fail fast on the next operation
			// instead of loading again.
			const postLoadKey = compatibilityFingerprint(
				postLoadSchema,
				postLoadBundle,
			);
			if (postLoadSchema !== null) this.loadedFor.add(postLoadKey);
			return this.fail(
				executorId,
				postLoadSchema === HOST_BUNDLE_SCHEMA_VERSION
					? "implementation-mismatch"
					: "schema-mismatch",
				{
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: postLoadSchema,
					observedBundleVersion: postLoadBundle,
					elapsedMs: Date.now() - loadStartedAt,
				},
				new Error(
					`Host bundle ${compatibilityMismatch(postLoadSchema, postLoadBundle)} after load`,
				),
				"idle",
			);
		}

		this.loadedFor.add(
			compatibilityFingerprint(postLoadSchema, postLoadBundle),
		);
		this.state = "ready";
		hostBridgeLog.info("[ty-plus] host bundle loaded", {
			action: "host-bundle-load-success",
			context: {
				executorId,
				expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
				expectedBundleVersion: HOST_BUNDLE_VERSION,
				observedSchema: postLoadSchema,
				observedBundleVersion: postLoadBundle,
				reload: probe.present,
				// False when another surface installed the compatible bundle
				// inside this block — the cross-surface single-flight signal.
				loadedFromFile: postLoad.loaded,
				elapsedMs: Date.now() - startedAt,
			},
		});
	}
}

const hostBundleCoordinators = new WeakMap<Window, HostBundleCoordinator>();

const getHostBundleCoordinator = (win: Window): HostBundleCoordinator => {
	const existing = hostBundleCoordinators.get(win);
	if (existing !== undefined) return existing;
	const created = new HostBundleCoordinator(win);
	hostBundleCoordinators.set(win, created);
	return created;
};

let nextExecutorId = 0;

/**
 * One caller identity per (Window, HostId).
 *
 * Widgets depend on this function in effects, and workspace runtime builds
 * it on every render. Sharing at the factory keeps those effects stable
 * without requiring each caller to memoize its executor.
 */
const hostExecutors = new WeakMap<Window, Map<HostId, HostFunctionCaller>>();

const buildCepHostExecutor = (
	win: Window,
	hostId: HostId,
): HostFunctionCaller => {
	// Identifies this caller instance in the coordinator's logs. The load
	// itself is shared across every executor created for the same window.
	nextExecutorId += 1;
	const executorId = `exec-${nextExecutorId}`;
	const coordinator = getHostBundleCoordinator(win);

	return async <K extends keyof AfterEffectsHostApi>(
		method: K,
		args: Parameters<AfterEffectsHostApi[K]>,
	) => {
		if (!ALLOWED_HOST_METHODS.has(method)) {
			throw new Error(`Host method is not allowed: ${String(method)}`);
		}
		await coordinator.ensure(executorId);

		const rawArgs = escapeScriptString(JSON.stringify(args));
		const escapedMethod = escapeScriptString(String(method));
		const result = await runEvalScript(
			win,
			`
(function() {
  try {
    var hostBundle = $.global && typeof ${HOST_BUNDLE_GLOBAL_REF} === "object"
      ? ${HOST_BUNDLE_GLOBAL_REF}
      : (typeof __TY_PLUS_HOST__ === "object" ? __TY_PLUS_HOST__ : null);
    var hostMethod = hostBundle && typeof hostBundle['${escapedMethod}'] === "function"
      ? hostBundle['${escapedMethod}']
      : null;
    if (hostMethod) {
      return hostMethod('${rawArgs}');
    }
    try { alert('Ty Plus execution failed:\\n__TY_PLUS_HOST__.${escapedMethod} is not available'); } catch (_alertError) {}
    return JSON.stringify({ ok: false, alerted: true, error: { message: "__TY_PLUS_HOST__.${escapedMethod} is not available" } });
  } catch (error) {
    try { alert('Ty Plus execution failed:\\nHost function wrapper failed for ${escapedMethod}: ' + String(error)); } catch (_alertError) {}
    return JSON.stringify({
      ok: false,
      alerted: true,
      error: {
        message: "Host function wrapper failed for ${escapedMethod}: " + String(error)
      }
    });
  }
})();
`,
		);
		let parsed:
			| { ok: true; hostId?: HostId; value?: unknown }
			| { ok: false; alerted?: boolean; error?: { message?: string } };
		try {
			parsed = parseHostJsonResult<
				| { ok: true; hostId?: HostId; value?: unknown }
				| { ok: false; alerted?: boolean; error?: { message?: string } }
			>(result, `Host function ${String(method)}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await alertHostExecutionFailure(win, message);
			throw error;
		}

		if (!parsed.ok) {
			const message = parsed.error?.message ?? "Host execution failed";
			if (!parsed.alerted) {
				await alertHostExecutionFailure(win, message);
			}
			throw new Error(message);
		}

		return {
			hostId: parsed.hostId ?? hostId,
			method,
			value: parsed.value,
		};
	};
};

export const createCepHostExecutor = (
	win: Window,
	hostId: HostId,
): HostFunctionCaller => {
	let byHost = hostExecutors.get(win);
	if (byHost === undefined) {
		byHost = new Map();
		hostExecutors.set(win, byHost);
	}
	const existing = byHost.get(hostId);
	if (existing !== undefined) {
		return existing;
	}
	const created = buildCepHostExecutor(win, hostId);
	byHost.set(hostId, created);
	return created;
};
