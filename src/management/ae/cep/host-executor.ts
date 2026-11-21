import {
	type AfterEffectsHostApi,
	HOST_BUNDLE_SCHEMA_VERSION,
	HOST_BUNDLE_VERSION,
	type HostFunctionCaller,
	type HostId,
} from "@/management/ae/host/contract";
import { createLogger } from "@/management/debug/logger";
import { notificationStore } from "@/management/online/notification/service";

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
export const ALLOWED_HOST_METHODS = new Set<keyof AfterEffectsHostApi>([
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

// Issue #72: host execution failures must never raise a modal ExtendScript
// `alert()` — it blocks the AE main thread and every CEP surface until a
// human dismisses it. Failures are already propagated to callers as thrown
// errors; this adds a non-modal in-panel notification as the user-visible
// surface. Standalone generated `.jsx` keeps `alert()` (see Issue #72).
const notifyHostExecutionFailure = (message: string) => {
	try {
		notificationStore.add(`Ty Plus: ${message.slice(0, 300)}`, "error", {
			duration: 8000,
		});
	} catch (_notifyError) {
		// Notification delivery must never mask the original failure.
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
	/**
	 * Every contract method is callable on the resident object. Markers
	 * can match while the methods are absent (present-but-empty residue,
	 * Issue #107); such a resident is heal-worthy, not reusable.
	 */
	readonly contractComplete: boolean;
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

/**
 * Contract completeness check shared by the JS probe AND the host-side
 * conditional-load re-check (Issue #107): the compatibility markers
 * alone cannot prove the resident object IS the bundle — a
 * present-but-empty residue can carry `__schemaVersion` /
 * `__bundleVersion` yet expose no callable methods. Every script that
 * judges the resident contract must apply this same method-presence
 * check or the two sides would disagree about whether `$.evalFile` is
 * needed, and a surface that loses the probe race would either skip a
 * required reload or restart one the winner just satisfied.
 */
const HOST_CONTRACT_METHODS = [...ALLOWED_HOST_METHODS];
const hostContractMethodCheckJs = (target: string): string =>
	HOST_CONTRACT_METHODS.map(
		(method) => `typeof ${target}['${method}'] === "function"`,
	).join(" && ");

/** Probe distinguishes "not resident" from "unreadable". */
const HOST_BUNDLE_PROBE_SCRIPT = `
(function() {
  try {
    var bundle = $.global && $.global.__TY_PLUS_HOST__;
    if (!bundle || typeof bundle !== "object") {
      return JSON.stringify({ ok: true, present: false, contractComplete: false });
    }
    return JSON.stringify({
      ok: true,
      present: true,
      schemaVersion: typeof bundle.__schemaVersion === "number" ? bundle.__schemaVersion : -1,
      bundleVersion: typeof bundle.__bundleVersion === "string" ? bundle.__bundleVersion : "",
      contractComplete: ${hostContractMethodCheckJs("bundle")}
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
    var residentComplete = !!(resident && typeof resident === "object" && (${hostContractMethodCheckJs("resident")}));
    if (residentComplete && residentSchema === expectedSchema && residentBundleVersion === expectedBundleVersion) {
      return JSON.stringify({ ok: true, loaded: false, schemaVersion: residentSchema, bundleVersion: residentBundleVersion, contractComplete: true });
    }
    $.evalFile('${jsxPath}');
    var bundle = $.global && $.global.__TY_PLUS_HOST__;
    var schema = bundle && typeof bundle.__schemaVersion === "number" ? bundle.__schemaVersion : -1;
    var loadedBundleVersion = bundle && typeof bundle.__bundleVersion === "string" ? bundle.__bundleVersion : "";
    var contractComplete = !!(bundle && typeof bundle === "object" && (${hostContractMethodCheckJs("bundle")}));
    return JSON.stringify({ ok: true, loaded: true, schemaVersion: schema, bundleVersion: loadedBundleVersion, contractComplete: contractComplete });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        // i18n-exempt: host bridge error payload consumed by the panel, not rendered UI
        message: "Host bundle load failed: " + String(error),
      }
    });
  }
})();
`;

/** Outcome of one conditional-load block: both axes plus whether we executed it. */
type HostBundleLoadResult = {
	readonly schemaVersion: number | null;
	readonly bundleVersion: string | null;
	readonly contractComplete: boolean;
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
		contractComplete?: unknown;
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
		contractComplete: value.contractComplete === true,
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
		contractComplete?: boolean;
		error?: { message?: string };
	};
	try {
		parsed = parseHostJsonResult<{
			ok?: boolean;
			loaded?: boolean;
			schemaVersion?: number;
			bundleVersion?: string;
			contractComplete?: boolean;
			error?: { message?: string };
		}>(result, "Host bundle load");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		notifyHostExecutionFailure(message);
		throw error;
	}
	if (!parsed.ok) {
		const message = parsed.error?.message ?? "Failed to load host bundle";
		notifyHostExecutionFailure(message);
		throw new Error(message);
	}
	return {
		schemaVersion:
			typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : null,
		bundleVersion:
			typeof parsed.bundleVersion === "string" ? parsed.bundleVersion : null,
		// Fail closed: a load block that cannot prove every contract
		// method is callable is not a usable bundle (Issue #107).
		contractComplete: parsed.contractComplete === true,
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
	| "post-load-unverifiable"
	| "schema-mismatch"
	| "implementation-mismatch"
	| "contract-mismatch"
	| "incompatible-not-reloaded";

/**
 * Bound on the silent-failure retry loop (Issue #107). A flight that
 * fails WITHOUT recording a contract — the probe cannot run, `$.evalFile`
 * throws, or it returns with no readable markers — returns the
 * coordinator to `idle` so the next operation may retry. That transient
 * intent is preserved, but after this many consecutive failures the
 * coordinator refuses new flights until the cooldown elapses: a
 * *persistent* failure (locked extension dir, half-initialized engine)
 * would otherwise rerun probe+`$.evalFile` on every operation of every
 * surface, forever.
 */
const MAX_CONSECUTIVE_LOAD_FAILURES = 3;
const LOAD_FAILURE_COOLDOWN_MS = 30_000;

/** Failure reasons that feed the backoff counter above. */
const LOAD_BACKOFF_REASONS = new Set<HostBundleFailureReason>([
	"probe-failed",
	"extension-root-unresolved",
	"eval-file-failed",
	"post-load-unverifiable",
]);

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
	/**
	 * Compatibility fingerprints (`schema|bundleVersion`) that a
	 * COMPLETED `$.evalFile` proved contract-incomplete — markers
	 * compatible but contract methods missing (Issue #107). Kept apart
	 * from `loadedFor` on purpose: an incomplete resident carrying the
	 * EXPECTED fingerprint must still be reloaded once, because the disk
	 * bundle may be intact and only the resident was corrupted. Only a
	 * disk bundle that keeps installing without methods is recorded
	 * here, and then the next probe fails fast instead of reloading.
	 */
	private readonly incompleteFor = new Set<string>();
	/** See `LOAD_BACKOFF_REASONS`: consecutive unrecorded load failures. */
	private consecutiveLoadFailures = 0;
	private lastLoadFailureAt = 0;

	constructor(private readonly win: Window) {}

	/** Test/diagnostic visibility into the state machine. */
	get currentState(): HostBundleCoordinatorState {
		return this.state;
	}

	/**
	 * Drop the terminal `ready` state so the next `ensure` re-probes the
	 * host global. Used when a host call reports the resident bundle
	 * missing: `$.global` outlives this window and can be corrupted by an
	 * abnormal teardown after this coordinator already went `ready`
	 * (Issue #104). `loadedFor` is kept — it records what the bundle on
	 * disk produces, which a resident-global reset does not invalidate.
	 */
	reset(): void {
		if (this.state === "ready") {
			this.state = "idle";
		}
	}

	/**
	 * A host call reported the resident bundle missing — or present but
	 * method-less — even after the self-heal cycle reloaded it (Issue
	 * #107). That is the same persistent silent-failure class as
	 * `post-load-unverifiable`: `$.evalFile` appears to succeed yet no
	 * callable host ever materializes. Counted toward the load backoff
	 * so repeated operations cannot keep paying probe+load for a bundle
	 * that never becomes callable.
	 */
	recordResidentLoss(): void {
		this.consecutiveLoadFailures += 1;
		this.lastLoadFailureAt = Date.now();
	}

	/**
	 * The host answered a call — the resident bundle is present AND
	 * callable, which is the only proof that clears the load backoff.
	 * Reaching `ready` alone is not enough: `$.evalFile` can verify the
	 * contract and the global can still be empty by the time the method
	 * call runs.
	 */
	recordCallSuccess(): void {
		this.consecutiveLoadFailures = 0;
	}

	ensure(executorId: string): Promise<void> {
		if (this.state === "ready") return Promise.resolve();
		if (this.inFlight !== null) return this.inFlight;
		if (
			this.consecutiveLoadFailures >= MAX_CONSECUTIVE_LOAD_FAILURES &&
			Date.now() - this.lastLoadFailureAt < LOAD_FAILURE_COOLDOWN_MS
		) {
			// Persistent failure: fail fast instead of paying another
			// probe + `$.evalFile` round-trip per operation. The counters
			// are deliberately NOT cleared here — only a flight that
			// reaches `ready` proves the host recovered.
			return Promise.reject(
				new Error(
					`Host bundle load is in backoff after ${this.consecutiveLoadFailures} consecutive failures`,
				),
			);
		}
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
		if (LOAD_BACKOFF_REASONS.has(reason)) {
			this.consecutiveLoadFailures += 1;
			this.lastLoadFailureAt = Date.now();
		}
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
				contractComplete: probe.contractComplete,
				elapsedMs: Date.now() - startedAt,
			},
		});

		const markersCompatible = isCompatible(observed, observedBundle);
		if (probe.present && markersCompatible && probe.contractComplete) {
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
		// Present-but-empty residue (Issue #107): the markers can match the
		// expected contract while no method is callable. Such a resident is
		// heal-worthy — the disk bundle may be intact and only `$.global`
		// was corrupted — so `loadedFor` (which proves what a past load
		// produced) must NOT block the reload. It is blocked only when a
		// COMPLETED load already proved the disk bundle installs without
		// methods (`incompleteFor`).
		const residentIncomplete = probe.present && !probe.contractComplete;
		const unfixable =
			residentIncomplete && markersCompatible
				? this.incompleteFor.has(observedKey)
				: this.loadedFor.has(observedKey);
		if (probe.present) {
			hostBridgeLog.warn("[ty-plus] host bundle contract changed; reloading", {
				action: "host-bundle-reload-incompatible",
				context: {
					executorId,
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: observed,
					observedBundleVersion: observedBundle,
					contractComplete: probe.contractComplete,
					elapsedMs: Date.now() - startedAt,
				},
			});
		}
		if (probe.present && unfixable) {
			// A completed load already produced this contract and it still
			// does not satisfy the caller. Reloading again would restart the
			// storm this coordinator exists to stop.
			return this.fail(
				executorId,
				residentIncomplete && markersCompatible
					? "contract-mismatch"
					: "incompatible-not-reloaded",
				{
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: observed,
					observedBundleVersion: observedBundle,
					contractComplete: probe.contractComplete,
					elapsedMs: Date.now() - startedAt,
				},
				new Error(
					residentIncomplete && markersCompatible
						? "Host bundle resident is missing contract methods"
						: `Host bundle ${compatibilityMismatch(observed, observedBundle)}`,
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

		const postLoadSchema = postLoad.schemaVersion;
		const postLoadBundle = postLoad.bundleVersion;
		// `$.evalFile` returned without a thrown error but the resident
		// global still carries no readable contract markers: the script
		// never reached its tail assignment. That is an engine-level
		// transient — the same class as a thrown evalFile — seen when an
		// abnormal surface teardown leaves ExtendScript globals
		// half-initialized (Issue #104). Recording `loadedFor` here would
		// make every later operation on this window fail fast forever, so
		// this flight fails without poisoning anything and the next
		// operation retries the load.
		if (postLoadSchema === null || postLoadSchema === -1) {
			return this.fail(
				executorId,
				"post-load-unverifiable",
				{
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: postLoadSchema,
					observedBundleVersion: postLoadBundle,
					elapsedMs: Date.now() - loadStartedAt,
				},
				new Error(
					"Host bundle load returned no readable contract after $.evalFile",
				),
				"idle",
			);
		}
		// Record the pre-load fingerprint only when a resident bundle was
		// actually observed. "absent" is not a contract: recording it would
		// make the post-corruption self-heal probe (Issue #104) hit
		// `incompatible-not-reloaded` and never reach `$.evalFile` again.
		// The stale-disk case is still covered by `postLoadKey` below —
		// a disk bundle that installs a wrong contract leaves a present,
		// mismatched resident the next probe can match.
		if (probe.present) this.loadedFor.add(observedKey);
		const postLoadCompatible = isCompatible(postLoadSchema, postLoadBundle);
		if (!postLoadCompatible || !postLoad.contractComplete) {
			// Record what the disk actually produced as well: a stale
			// on-disk implementation must fail fast on the next operation
			// instead of loading again. A disk bundle whose markers match
			// but whose methods are missing goes to `incompleteFor` — the
			// resident it leaves behind carries the EXPECTED fingerprint,
			// so only that set can recognize it as unfixable (Issue #107).
			const postLoadKey = compatibilityFingerprint(
				postLoadSchema,
				postLoadBundle,
			);
			if (postLoadSchema !== null) {
				if (postLoadCompatible) this.incompleteFor.add(postLoadKey);
				else this.loadedFor.add(postLoadKey);
			}
			return this.fail(
				executorId,
				postLoadCompatible
					? "contract-mismatch"
					: postLoadSchema === HOST_BUNDLE_SCHEMA_VERSION
						? "implementation-mismatch"
						: "schema-mismatch",
				{
					expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
					expectedBundleVersion: HOST_BUNDLE_VERSION,
					observedSchema: postLoadSchema,
					observedBundleVersion: postLoadBundle,
					contractComplete: postLoad.contractComplete,
					elapsedMs: Date.now() - loadStartedAt,
				},
				new Error(
					postLoadCompatible
						? "Host bundle is missing contract methods after load"
						: `Host bundle ${compatibilityMismatch(postLoadSchema, postLoadBundle)} after load`,
				),
				"idle",
			);
		}

		this.loadedFor.add(
			compatibilityFingerprint(postLoadSchema, postLoadBundle),
		);
		// NOTE: reaching `ready` does NOT clear the backoff counter — the
		// load verified markers and methods, but the bundle can still
		// vanish before the call script runs (Issue #107). Only an
		// actual host response (`recordCallSuccess`) proves recovery.
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
		const rawArgs = escapeScriptString(JSON.stringify(args));
		const escapedMethod = escapeScriptString(String(method));
		const callScript = `
(function() {
  try {
    var hostBundle = $.global && typeof ${HOST_BUNDLE_GLOBAL_REF} === "object"
      ? ${HOST_BUNDLE_GLOBAL_REF}
      : (typeof __TY_PLUS_HOST__ === "object" ? __TY_PLUS_HOST__ : null);
    if (!hostBundle) {
      return JSON.stringify({
        ok: false,
        error: {
        // i18n-exempt: host bridge error payload consumed by the panel, not rendered UI
        message: "Host bundle is not resident",
        code: "host_bundle_missing",
      }
      });
    }
    var hostMethod = typeof hostBundle['${escapedMethod}'] === "function"
      ? hostBundle['${escapedMethod}']
      : null;
    if (hostMethod) {
      return hostMethod('${rawArgs}');
    }
    return JSON.stringify({ ok: false, error: {
        // i18n-exempt: host bridge error payload consumed by the panel, not rendered UI
        message: "__TY_PLUS_HOST__.${escapedMethod} is not available",
        code: "host_method_missing",
      } });
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        // i18n-exempt: host bridge error payload consumed by the panel, not rendered UI
        message: "Host function wrapper failed for ${escapedMethod}: " + String(error)
      }
    });
  }
})();
`;
		// A `ready` coordinator trusts its earlier probe, but `$.global` is
		// shared engine state that an abnormal teardown can corrupt after
		// the fact (Issue #104). When the call reports the bundle missing —
		// or present but without the requested method, the present-but-empty
		// residue of Issue #107 — drop the terminal state and run one
		// ensure+call cycle again so the coordinator re-probes and reloads
		// instead of failing every later operation on this window. If the
		// retried call STILL cannot reach a method, the failure is
		// persistent: count it toward the load backoff so the next
		// operations fail fast rather than paying probe+load each time.
		type HostCallResult =
			| { ok: true; hostId?: HostId; value?: unknown }
			| { ok: false; error?: { message?: string; code?: string } };
		const isHealWorthy = (code: string | undefined): boolean =>
			code === "host_bundle_missing" || code === "host_method_missing";
		const invokeHostMethod = async (): Promise<HostCallResult> => {
			const attempt = async (): Promise<HostCallResult> => {
				await coordinator.ensure(executorId);
				const result = await runEvalScript(win, callScript);
				let parsed: HostCallResult;
				try {
					parsed = parseHostJsonResult<HostCallResult>(
						result,
						`Host function ${String(method)}`,
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					notifyHostExecutionFailure(message);
					throw error;
				}
				return parsed;
			};
			const first = await attempt();
			if (first.ok === false && isHealWorthy(first.error?.code)) {
				coordinator.reset();
				const second = await attempt();
				if (second.ok === false && isHealWorthy(second.error?.code)) {
					coordinator.recordResidentLoss();
				}
				return second;
			}
			return first;
		};
		const parsed = await invokeHostMethod();
		if (parsed.ok === false && isHealWorthy(parsed.error?.code)) {
			// Still unreachable after the self-heal cycle — already
			// counted via `recordResidentLoss`; do not clear the counter.
		} else {
			// Any definitive host response — success or a method-level
			// error — proves the bundle is resident and callable, which
			// is what clears the load backoff (Issue #107).
			coordinator.recordCallSuccess();
		}

		if (!parsed.ok) {
			const message = parsed.error?.message ?? "Host execution failed";
			notifyHostExecutionFailure(message);
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
