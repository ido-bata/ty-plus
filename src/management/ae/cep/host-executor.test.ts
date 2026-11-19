import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
	HOST_BUNDLE_SCHEMA_VERSION,
	HOST_BUNDLE_VERSION,
} from "@/management/ae/host/contract";
import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	getEntries,
} from "@/management/debug/logger";
import { notificationStore } from "@/management/online/notification/service";
import {
	ALLOWED_HOST_METHODS,
	createCepHostExecutor,
	probeAfterEffectsEvalScript,
} from "./host-executor";

const isAlertOnlyScript = (script: string) =>
	script.trimStart().startsWith("(function() {\n  try {\n    alert(");

const isProbeScript = (script: string) =>
	!script.includes("$.evalFile") && script.includes("__schemaVersion");

const isLoadScript = (script: string) => script.includes("$.evalFile");

/**
 * An implementation revision that is no longer current. Historically this
 * is the string pre-#158 builds reported from `ping`, and the label that
 * `host-bundle.ext.ts` carried before this PR made it a compatibility
 * token — two different implementations shared it, which is exactly why
 * the revision had to move.
 */
const PREVIOUS_BUNDLE_VERSION = "workspace-preset-scriptui-panel-v2";

type FakeHostOptions = {
	/**
	 * What the resident `$.global.__TY_PLUS_HOST__` looks like on arrival.
	 * `"empty"` is the Issue #107 present-but-empty residue: the
	 * compatibility markers match but no contract method is callable.
	 */
	readonly resident?: "absent" | "present" | "empty";
	/** Schema the resident global reports (when `resident !== "absent"`). */
	readonly residentSchema?: number;
	/** Implementation revision the resident global reports. */
	readonly residentBundleVersion?: string;
	/** Schema the file on disk declares — what `$.evalFile` installs. */
	readonly fileSchema?: number;
	/** Implementation revision the file on disk installs. */
	readonly fileBundleVersion?: string;
	/**
	 * The file on disk installs markers but no contract methods — the
	 * disk-side half of the Issue #107 present-but-empty case.
	 */
	readonly fileIncomplete?: boolean;
	readonly extensionRoot?: string;
	/** Canned response for a host method call. */
	readonly methodResult?: () => Record<string, unknown>;
	/** Make `$.evalFile` fail (simulates a broken / locked bundle). */
	readonly failLoad?: boolean;
	/**
	 * `$.evalFile` returns without throwing but leaves the resident global
	 * unreadable — the engine-level transient seen when an abnormal
	 * teardown interrupts the bundle mid-load (Issue #104).
	 */
	readonly silentLoadFailure?: boolean;
	/**
	 * Every host-method call script observes an empty `$.global` — the
	 * bundle "loads" but never stays resident, the persistent
	 * `host_bundle_missing` path of Issue #107.
	 */
	readonly vanishOnCall?: boolean;
};

type FakeHost = {
	readonly win: Window;
	readonly scripts: string[];
	probeCount(): number;
	loadCount(): number;
	/** Mutate the resident global after construction (e.g. panel reload). */
	setResident(resident: "absent" | "present" | "empty", schema?: number): void;
	/** Leave the key present with an undefined value — the Issue 104 residue. */
	corruptResident(): void;
	setFailLoad(value: boolean): void;
	setSilentLoadFailure(value: boolean): void;
	setVanishOnCall(value: boolean): void;
};

/**
 * The ExtendScript engine side of the boundary: one `$.global` per AE host
 * session, shared by every CEP surface of the extension. EVERY script the
 * coordinator emits — compatibility probe, conditional `$.evalFile`
 * block, and host method call — is executed for real in a `node:vm`
 * context against that shared global, so these tests prove the scripts'
 * own logic instead of a double's guess about it (Issue #107: the probe
 * used to be pattern-matched, which hid regressions in it).
 */
type FakeEngine = {
	/** `$.global` of the shared engine. */
	readonly global: Record<string, unknown>;
	fileSchema: number;
	fileBundleVersion: string;
	fileIncomplete: boolean;
	failLoad: boolean;
	silentLoadFailure: boolean;
	vanishOnCall: boolean;
	methodResult?: () => Record<string, unknown>;
	probes: number;
	loads: number;
};

/** Install a resident bundle: markers always, contract methods on demand. */
const installBundle = (
	engine: FakeEngine,
	schema: number,
	bundleVersion: string,
	complete: boolean,
): void => {
	const bundle: Record<string, unknown> = {
		__schemaVersion: schema,
		__bundleVersion: bundleVersion,
	};
	if (complete) {
		for (const method of ALLOWED_HOST_METHODS) {
			bundle[method] = () =>
				JSON.stringify(
					engine.methodResult?.() ?? {
						ok: true,
						hostId: "after-effects",
						value: "pong",
					},
				);
		}
	}
	engine.global.__TY_PLUS_HOST__ = bundle;
};

const createFakeEngine = (options: FakeHostOptions = {}): FakeEngine => {
	const engine: FakeEngine = {
		global: {},
		fileSchema: options.fileSchema ?? HOST_BUNDLE_SCHEMA_VERSION,
		fileBundleVersion: options.fileBundleVersion ?? HOST_BUNDLE_VERSION,
		fileIncomplete: options.fileIncomplete ?? false,
		failLoad: options.failLoad ?? false,
		silentLoadFailure: options.silentLoadFailure ?? false,
		vanishOnCall: options.vanishOnCall ?? false,
		methodResult: options.methodResult,
		probes: 0,
		loads: 0,
	};
	const resident = options.resident ?? "absent";
	if (resident !== "absent") {
		installBundle(
			engine,
			options.residentSchema ?? HOST_BUNDLE_SCHEMA_VERSION,
			options.residentBundleVersion ?? HOST_BUNDLE_VERSION,
			resident === "present",
		);
	}
	return engine;
};

/** `null` when nothing (readable) is resident — mirrors the probe script. */
const residentSchemaOf = (engine: FakeEngine): number | null => {
	const value = engine.global.__TY_PLUS_HOST__;
	if (value === null || typeof value !== "object") return null;
	const schema = (value as { __schemaVersion?: unknown }).__schemaVersion;
	return typeof schema === "number" ? schema : -1;
};

/** `null` when nothing (readable) is resident — mirrors the probe script. */
const residentBundleVersionOf = (engine: FakeEngine): string | null => {
	const value = engine.global.__TY_PLUS_HOST__;
	if (value === null || typeof value !== "object") return null;
	const version = (value as { __bundleVersion?: unknown }).__bundleVersion;
	return typeof version === "string" ? version : null;
};

/**
 * Simulates the AE side of the boundary: `evalScript` executes EVERY
 * script in a fresh `node:vm` context against the shared engine `$.global`
 * — the same path the load script already used — so the probe and the
 * host-call wrapper are covered by the same fidelity (Issue #107).
 *
 * Pass the same `engine` to two hosts to model two CEP surfaces talking to
 * one ExtendScript engine — that is the seam the cross-window cold-load
 * race lives on.
 */
const createFakeHost = (
	options: FakeHostOptions = {},
	engine: FakeEngine = createFakeEngine(options),
): FakeHost => {
	const state = engine;
	const scripts: string[] = [];

	const evalFile = (_path: string): void => {
		state.loads += 1;
		if (state.failLoad) {
			throw new Error("Host bundle load failed: simulated");
		}
		if (state.silentLoadFailure) {
			// The evalFile'd script never reaches its tail
			// assignment: the global key exists but stays
			// undefined, exactly the #104 residue.
			state.global.__TY_PLUS_HOST__ = undefined;
			return;
		}
		installBundle(
			state,
			state.fileSchema,
			state.fileBundleVersion,
			!state.fileIncomplete,
		);
	};

	const runExtendScript = (script: string): string => {
		try {
			const result = vm.runInNewContext(script, {
				$: {
					global: state.global,
					evalFile,
				},
				alert: () => undefined,
			});
			return typeof result === "string" ? result : "null";
		} catch (error) {
			return JSON.stringify({
				ok: false,
				alerted: true,
				error: { message: `ExtendScript failed: ${String(error)}` },
			});
		}
	};

	const win = {
		SystemPath: { EXTENSION: "extension" },
		__adobe_cep__: {
			getSystemPath: () =>
				options.extensionRoot ?? "C:/CEP/extensions/app.ty-plus",
			evalScript: (script: string, callback?: (result: string) => void) => {
				scripts.push(script);
				if (isProbeScript(script)) {
					state.probes += 1;
				}
				if (state.vanishOnCall && script.includes("host_bundle_missing")) {
					// The bundle never stays resident: every method call
					// observes an empty `$.global`, so the self-heal reload
					// can never produce a callable host (Issue #107).
					delete state.global.__TY_PLUS_HOST__;
				}
				callback?.(runExtendScript(script));
			},
		},
	} as unknown as Window;

	return {
		win,
		scripts,
		probeCount: () => state.probes,
		loadCount: () => state.loads,
		setResident: (resident, schema) => {
			if (resident === "absent") {
				delete state.global.__TY_PLUS_HOST__;
				return;
			}
			installBundle(
				state,
				schema ?? options.residentSchema ?? HOST_BUNDLE_SCHEMA_VERSION,
				options.residentBundleVersion ?? HOST_BUNDLE_VERSION,
				resident === "present",
			);
		},
		corruptResident: () => {
			state.global.__TY_PLUS_HOST__ = undefined;
		},
		setFailLoad: (value) => {
			state.failLoad = value;
		},
		setSilentLoadFailure: (value) => {
			state.silentLoadFailure = value;
		},
		setVanishOnCall: (value) => {
			state.vanishOnCall = value;
		},
	};
};

const anyExecutor = (win: Window) =>
	createCepHostExecutor(win, "after-effects");

const hostActions = (): ReadonlyArray<string | undefined> =>
	getEntries().map((entry) => entry.action);

beforeAll(() => {
	_setDevConsoleEnabled(false);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("createCepHostExecutor", () => {
	test("calls host methods through $.global.__TY_PLUS_HOST__ after loading the JSX bundle", async () => {
		const host = createFakeHost();
		const result = await anyExecutor(host.win)("ping", []);

		expect(result.value).toBe("pong");
		// probe -> load -> method call
		expect(host.scripts[2]).toContain("$.global['__TY_PLUS_HOST__']");
		expect(host.scripts[2]).not.toContain("${HOST_BUNDLE_NAMESPACE}");
		expect(host.scripts[2]).toContain("['ping']");
	});

	test("allows the easing UI to request AE label color names", async () => {
		const host = createFakeHost({
			methodResult: () => ({
				ok: true,
				hostId: "after-effects",
				value: { names: { "1": "Red" } },
			}),
		});
		const result = await anyExecutor(host.win)("getLabelColorNames", []);

		expect(result.value).toEqual({ names: { "1": "Red" } });
		expect(host.scripts[2]).toContain("['getLabelColorNames']");
	});

	test("surfaces a non-modal notification when host returns an execution failure", async () => {
		notificationStore.clear();
		const host = createFakeHost({
			methodResult: () => ({
				ok: false,
				error: { message: "Script file not found: C:/missing.jsx" },
			}),
		});

		await expect(
			anyExecutor(host.win)("runScriptFile", ["C:/missing.jsx"]),
		).rejects.toThrow("Script file not found");
		// Issue #72: no ExtendScript alert() script may be emitted; the
		// failure reaches the user through the in-panel notification store.
		expect(host.scripts.some(isAlertOnlyScript)).toBe(false);
		const entries = notificationStore.getNotifications();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.type).toBe("error");
		expect(entries[0]?.message).toContain("Script file not found");
	});

	test("notifies on host failure without any modal alert path", async () => {
		notificationStore.clear();
		const host = createFakeHost({
			methodResult: () => ({
				ok: false,
				error: { message: "Preset file not found: C:/missing.ffx" },
			}),
		});

		await expect(
			anyExecutor(host.win)("applyPreset", ["C:/missing.ffx"]),
		).rejects.toThrow("Preset file not found");
		expect(host.scripts.filter(isAlertOnlyScript)).toHaveLength(0);
		expect(notificationStore.getNotifications()).toHaveLength(1);
	});
});

// Issue #158 — the reference lives in a comment because a `#NNN` inside a
// string literal on a code line is indistinguishable from a 3-digit hex colour
// to design-tokens, which flags it as a colour literal.
describe("host bundle load coordinator", () => {
	// Repeated operations share one caller per (Window, HostId); cross-surface
	// deduplication is covered by the shared-engine cases below.
	test("an absent bundle is loaded exactly once across three operations", async () => {
		const host = createFakeHost({ resident: "absent" });

		await anyExecutor(host.win)("ping", []);
		await anyExecutor(host.win)("ping", []);
		await anyExecutor(host.win)("ping", []);

		expect(host.loadCount()).toBe(1);
		// The ready coordinator answers later calls without touching the host
		// bundle at all: one probe, one load, then method calls only.
		expect(host.probeCount()).toBe(1);
		expect(host.scripts.filter(isLoadScript)).toHaveLength(1);
	});

	test("20 concurrent first callers share a single probe and load", async () => {
		const host = createFakeHost({ resident: "absent" });
		// Twenty handles on one caller exercise concurrent operations.
		const callers = Array.from({ length: 20 }, () => anyExecutor(host.win));

		const results = await Promise.allSettled(
			callers.map((caller) => caller("ping", [])),
		);

		expect(results.every((r) => r.status === "fulfilled")).toBe(true);
		expect(host.probeCount(), "probe must be single-flight").toBe(1);
		expect(host.loadCount(), "$.evalFile must run exactly once").toBe(1);
		expect(host.scripts.filter(isLoadScript)).toHaveLength(1);
	});

	test("a compatible resident bundle is reused without $.evalFile", async () => {
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		await anyExecutor(host.win)("ping", []);
		await anyExecutor(host.win)("ping", []);

		expect(host.loadCount()).toBe(0);
		expect(host.scripts.filter(isLoadScript)).toHaveLength(0);
		expect(host.probeCount()).toBe(1);
	});

	test("an incompatible resident bundle reloads exactly once", async () => {
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION - 1,
			fileSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		await anyExecutor(host.win)("ping", []);
		expect(host.loadCount()).toBe(1);

		// The reload produced a compatible bundle, so the coordinator is
		// `ready`: the next call answers from state without probing again.
		await anyExecutor(host.win)("ping", []);
		expect(host.loadCount(), "the reloaded bundle is now compatible").toBe(1);
		expect(host.probeCount()).toBe(1);
		expect(host.scripts.filter(isLoadScript)).toHaveLength(1);
	});

	test("a failed load fails all 20 concurrent callers once, then retries on the next operation", async () => {
		const host = createFakeHost({ resident: "absent" });
		host.setFailLoad(true);

		const callers = Array.from({ length: 20 }, () => anyExecutor(host.win));
		const results = await Promise.allSettled(
			callers.map((caller) => caller("ping", [])),
		);

		expect(results.every((r) => r.status === "rejected")).toBe(true);
		expect(host.loadCount(), "one failed attempt, not twenty").toBe(1);

		// A failure is never cached permanently: the next operation gets a
		// fresh single-flight attempt.
		host.setFailLoad(false);
		await anyExecutor(host.win)("ping", []);
		expect(host.loadCount()).toBe(2);
		// probe (failed flight) + probe (retry flight); the ready fast path
		// then stops touching the host bundle entirely.
		expect(host.probeCount()).toBe(2);
	});

	test("a stale on-disk bundle is not reloaded on every operation", async () => {
		// The file on disk declares an older contract than this caller: the
		// first operation loads it once, every later operation must fail
		// fast rather than restart the reload storm.
		const host = createFakeHost({
			resident: "absent",
			fileSchema: HOST_BUNDLE_SCHEMA_VERSION - 1,
		});

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/schema mismatch/i,
		);
		expect(host.loadCount()).toBe(1);

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/schema mismatch/i,
		);
		expect(host.loadCount(), "no second $.evalFile for the same contract").toBe(
			1,
		);
		expect(host.probeCount()).toBe(2);
	});

	test("a fresh JS context reuses a resident reporting the current revision", async () => {
		// Panel reload: a new CEP window (fresh module state, empty
		// coordinator WeakMap) over the same AE host session, where a fully
		// compatible bundle — schema AND implementation revision — is
		// already resident. Neither axis may trigger a reload on its own.
		const first = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
			residentBundleVersion: HOST_BUNDLE_VERSION,
		});
		await anyExecutor(first.win)("ping", []);
		expect(first.loadCount()).toBe(0);

		const second = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
			residentBundleVersion: HOST_BUNDLE_VERSION,
		});
		await anyExecutor(second.win)("ping", []);
		expect(second.loadCount(), "a fresh context must not reload").toBe(0);
	});

	test("an old implementation revision with a current schema reloads once", async () => {
		// The exact bug this contract exists for: same schema, different
		// host-side code. An extension update without an AE restart leaves
		// the previous implementation resident; schema alone would reuse it
		// forever.
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
			residentBundleVersion: PREVIOUS_BUNDLE_VERSION,
			fileSchema: HOST_BUNDLE_SCHEMA_VERSION,
			fileBundleVersion: HOST_BUNDLE_VERSION,
		});

		await anyExecutor(host.win)("ping", []);

		expect(
			host.loadCount(),
			"schema matched but the implementation did not",
		).toBe(1);

		// The reloaded bundle is current, so the coordinator is `ready` and
		// later calls answer from state without touching the host again.
		await anyExecutor(host.win)("ping", []);
		expect(host.loadCount(), "the reloaded bundle is now current").toBe(1);
		expect(host.probeCount()).toBe(1);
	});

	test("two surfaces racing a stale implementation revision share one $.evalFile", async () => {
		// Same cross-surface seam as the cold-load race, but the resident
		// exists: both coordinators must reach the host block, and the block
		// itself has to decide — whichever surface runs first loads, the
		// other re-checks and skips.
		const stale = {
			resident: "present" as const,
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
			residentBundleVersion: PREVIOUS_BUNDLE_VERSION,
		};
		const engine = createFakeEngine(stale);
		const panel = createFakeHost(stale, engine);
		const dialog = createFakeHost(stale, engine);

		await Promise.all([
			anyExecutor(panel.win)("ping", []),
			anyExecutor(dialog.win)("ping", []),
		]);

		expect(
			engine.probes,
			"each surface probes for itself",
		).toBeGreaterThanOrEqual(2);
		expect(engine.loads, "one shared engine, one $.evalFile").toBe(1);
		expect(residentBundleVersionOf(engine)).toBe(HOST_BUNDLE_VERSION);
	});

	test("a stale on-disk implementation does not reload on every operation", async () => {
		// Resident AND disk are both behind: loading cannot fix it. The
		// first operation must attempt one load and then fail, and every
		// later operation must fail fast — never restart the reload.
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
			residentBundleVersion: PREVIOUS_BUNDLE_VERSION,
			fileSchema: HOST_BUNDLE_SCHEMA_VERSION,
			fileBundleVersion: PREVIOUS_BUNDLE_VERSION,
		});

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/implementation revision mismatch/i,
		);
		expect(host.loadCount()).toBe(1);

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/implementation revision mismatch/i,
		);
		expect(
			host.loadCount(),
			"no second $.evalFile for the same stale contract",
		).toBe(1);
		expect(host.probeCount()).toBe(2);
	});

	test("two surfaces racing a cold load share one $.evalFile", async () => {
		// One AE host session, two CEP windows (e.g. a panel and a modeless
		// dialog) both booting before anything is resident. Each surface has
		// its own JS context, hence its own coordinator WeakMap, so the
		// per-window single-flight cannot dedupe this — only the host global
		// can. Both probes observe `absent`; exactly one `$.evalFile` may run.
		const engine = createFakeEngine({ resident: "absent" });
		const panel = createFakeHost({ resident: "absent" }, engine);
		const dialog = createFakeHost({ resident: "absent" }, engine);

		await Promise.all([
			anyExecutor(panel.win)("ping", []),
			anyExecutor(dialog.win)("ping", []),
		]);

		expect(
			engine.probes,
			"each surface probes for itself",
		).toBeGreaterThanOrEqual(2);
		expect(engine.loads, "one shared engine, one $.evalFile").toBe(1);
		expect(residentSchemaOf(engine)).toBe(HOST_BUNDLE_SCHEMA_VERSION);
	});

	test("emits the structured lifecycle actions with a correlatable context", async () => {
		_resetBusForTests();
		const host = createFakeHost({ resident: "absent" });

		await anyExecutor(host.win)("ping", []);

		const actions = hostActions();
		expect(actions).toContain("host-bundle-probe");
		expect(actions).toContain("host-bundle-load-start");
		expect(actions).toContain("host-bundle-load-success");
		expect(actions).not.toContain("host-bundle-reuse");

		const entry = getEntries().find(
			(e) => e.action === "host-bundle-load-success",
		);
		expect(entry?.source).toBe("host-bridge");
		expect(entry?.context).toMatchObject({
			executorId: expect.stringMatching(/^exec-\d+$/),
			expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
			observedSchema: HOST_BUNDLE_SCHEMA_VERSION,
			reload: false,
		});
		expect(typeof entry?.context?.elapsedMs).toBe("number");
	});

	test("reuse is logged as probe + reuse, never as a load", async () => {
		_resetBusForTests();
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		await anyExecutor(host.win)("ping", []);

		const actions = hostActions();
		expect(actions).toContain("host-bundle-probe");
		expect(actions).toContain("host-bundle-reuse");
		expect(actions).not.toContain("host-bundle-load-start");
	});

	test("an incompatible resident bundle logs the reload reason", async () => {
		_resetBusForTests();
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION - 1,
			fileSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		await anyExecutor(host.win)("ping", []);

		const entry = getEntries().find(
			(e) => e.action === "host-bundle-reload-incompatible",
		);
		expect(entry).toBeDefined();
		expect(entry?.context).toMatchObject({
			expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
			observedSchema: HOST_BUNDLE_SCHEMA_VERSION - 1,
		});
	});

	test("a load failure is logged with a reason and no extension path", async () => {
		_resetBusForTests();
		const host = createFakeHost({ resident: "absent" });
		host.setFailLoad(true);

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow();

		const entry = getEntries().find(
			(e) => e.action === "host-bundle-load-failed",
		);
		expect(entry?.context).toMatchObject({
			reason: "eval-file-failed",
			expectedSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		// Issue #158: paths do not belong in the retained log.
		const serialized = JSON.stringify(getEntries());
		expect(serialized).not.toContain("jsx/ty-plus-host.jsx");
		expect(serialized).not.toContain("/extensions/app.ty-plus");
	});

	test("the expected schema and revision match the resident bundle declaration", () => {
		// `host-bundle.ext.ts` is a standalone ES3 bundle and cannot import
		// the contract module, so BOTH declarations are pinned here. Schema
		// and implementation revision are independent axes; each one can
		// drift silently because neither side can import the other.
		const bundleSource = readFileSync(
			fileURLToPath(new URL("../jsx/host-bundle.ext.ts", import.meta.url)),
			"utf8",
		);

		const declaredSchema = bundleSource.match(
			/const HOST_BUNDLE_SCHEMA_VERSION = (\d+);/,
		);
		expect(declaredSchema?.[1]).toBeDefined();
		expect(Number(declaredSchema?.[1])).toBe(HOST_BUNDLE_SCHEMA_VERSION);

		const declaredBundle = bundleSource.match(
			/const HOST_BUNDLE_VERSION = "([^"]+)";/,
		);
		expect(declaredBundle?.[1]).toBeDefined();
		expect(declaredBundle?.[1]).toBe(HOST_BUNDLE_VERSION);

		// Both must be data properties on the resident global so the probe
		// can read them without entering the method wrapper.
		expect(bundleSource).toContain(
			"__schemaVersion: HOST_BUNDLE_SCHEMA_VERSION",
		);
		expect(bundleSource).toContain("__bundleVersion: HOST_BUNDLE_VERSION");
	});

	// Issue #104 — after an abnormal teardown the resident global can be
	// left half-initialized (`$.global.__TY_PLUS_HOST__` present but
	// undefined). A `ready` coordinator must not keep trusting it, and a
	// load that produces no readable contract must not poison retries.
	test("a resident bundle lost after ready is reloaded once and the call heals", async () => {
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		await anyExecutor(host.win)("ping", []);
		expect(host.loadCount()).toBe(0);

		// The shared `$.global` is corrupted after this window's
		// coordinator already went `ready`: the key remains, the value is
		// undefined. The next call must re-probe, reload, and succeed.
		host.corruptResident();
		const result = await anyExecutor(host.win)("ping", []);

		expect(result.value).toBe("pong");
		expect(host.loadCount()).toBe(1);
		expect(host.probeCount()).toBe(2);
	});

	test("an absent fingerprint recorded at boot does not block self-heal", async () => {
		const host = createFakeHost({ resident: "absent" });

		// First operation probes absent, loads, and goes ready. The
		// pre-load "absent" fingerprint must NOT be recorded in
		// `loadedFor`: it is not a contract, and keeping it made the
		// post-corruption re-probe fail `incompatible-not-reloaded`
		// without ever reaching `$.evalFile` again.
		const first = await anyExecutor(host.win)("ping", []);
		expect(first.value).toBe("pong");
		expect(host.loadCount()).toBe(1);

		host.corruptResident();
		const second = await anyExecutor(host.win)("ping", []);

		expect(second.value).toBe("pong");
		expect(host.loadCount()).toBe(2);
	});

	test("a silently incomplete $.evalFile does not poison retries for an absent bundle", async () => {
		const host = createFakeHost({
			resident: "absent",
			silentLoadFailure: true,
		});

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/no readable contract/,
		);
		expect(host.loadCount()).toBe(1);

		// The failed flight recorded nothing: the next operation gets a
		// fresh probe + load instead of failing fast forever.
		host.setSilentLoadFailure(false);
		const result = await anyExecutor(host.win)("ping", []);

		expect(result.value).toBe("pong");
		expect(host.loadCount()).toBe(2);
	});

	test("a second host_bundle_missing report fails the call instead of looping", async () => {
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		await anyExecutor(host.win)("ping", []);
		// Corrupt the resident AND break the disk bundle: the self-heal
		// reload runs but still cannot produce a callable host, so the
		// call must surface the failure rather than retry forever.
		host.corruptResident();
		host.setSilentLoadFailure(true);

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/no readable contract|not resident/,
		);
		// probe + load for the reset flight; the method call then reports
		// the still-missing bundle and stops after one retry.
		expect(host.loadCount()).toBe(1);
	});

	// Issue #107 — the residual gaps left by #104: a persistent silent
	// failure must be bounded, and a resident object that carries the
	// compatibility markers but no callable methods is heal-worthy.
	test("a present-but-empty resident bundle is reloaded once and heals", async () => {
		// Markers match the expected contract exactly, yet no contract
		// method is callable — the residue a half-initialized
		// `$.global.__TY_PLUS_HOST__` can leave behind. The probe must
		// not reuse it; the conditional load must not skip `$.evalFile`.
		const host = createFakeHost({ resident: "empty" });

		const result = await anyExecutor(host.win)("ping", []);

		expect(result.value).toBe("pong");
		expect(host.loadCount()).toBe(1);
		expect(host.probeCount()).toBe(1);
	});

	test("a resident bundle that loses its methods after ready heals via host_method_missing", async () => {
		const host = createFakeHost({
			resident: "present",
			residentSchema: HOST_BUNDLE_SCHEMA_VERSION,
		});

		await anyExecutor(host.win)("ping", []);
		expect(host.loadCount()).toBe(0);

		// Abnormal teardown rewrites the resident into the present-but-
		// empty shape: markers intact, methods gone. The call reports
		// `host_method_missing`, which must take the same reset+reload
		// path as `host_bundle_missing`.
		host.setResident("empty");
		const result = await anyExecutor(host.win)("ping", []);

		expect(result.value).toBe("pong");
		expect(host.loadCount()).toBe(1);
		expect(host.probeCount()).toBe(2);
	});

	test("a disk bundle without contract methods fails fast after one load", async () => {
		// `$.evalFile` "succeeds" and installs the expected markers, but
		// the bundle on disk exposes no contract methods. The first
		// operation must attempt one load; every later operation must
		// fail fast on the recorded fingerprint — never reload.
		const host = createFakeHost({
			resident: "absent",
			fileIncomplete: true,
		});

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/missing contract methods/,
		);
		expect(host.loadCount()).toBe(1);

		await expect(anyExecutor(host.win)("ping", [])).rejects.toThrow(
			/missing contract methods/,
		);
		expect(
			host.loadCount(),
			"no second $.evalFile for the same incomplete contract",
		).toBe(1);
		expect(host.probeCount()).toBe(2);
	});

	test("a bundle that never stays resident is bounded by the load backoff", async () => {
		// The load reports success but every method call observes an
		// empty `$.global`: `host_bundle_missing` persists across the
		// self-heal reload. Each operation pays one heal cycle until the
		// consecutive-failure bound engages the cooldown.
		const host = createFakeHost({ resident: "absent", vanishOnCall: true });
		const caller = anyExecutor(host.win);

		for (let i = 0; i < 3; i += 1) {
			await expect(caller("ping", [])).rejects.toThrow(/not resident/);
		}
		// First operation pays probe+load twice (initial flight + heal
		// flight); later ones pay one probe+load each on the heal leg.
		expect(host.loadCount()).toBe(4);
		expect(host.probeCount()).toBe(4);

		// Inside the cooldown the next operations fail fast: no probe,
		// no `$.evalFile`, no second heal cycle.
		await expect(caller("ping", [])).rejects.toThrow(/backoff/);
		await expect(caller("ping", [])).rejects.toThrow(/backoff/);
		expect(host.loadCount()).toBe(4);
		expect(host.probeCount()).toBe(4);
	});

	test("a persistent silent $.evalFile failure backs off, then recovers after the cooldown", async () => {
		vi.useFakeTimers();
		try {
			const host = createFakeHost({
				resident: "absent",
				silentLoadFailure: true,
			});
			const caller = anyExecutor(host.win);

			// Three consecutive `post-load-unverifiable` flights reach the
			// backoff bound; each one still got a fresh probe + load.
			for (let i = 0; i < 3; i += 1) {
				await expect(caller("ping", [])).rejects.toThrow(
					/no readable contract/,
				);
			}
			expect(host.loadCount()).toBe(3);
			expect(host.probeCount()).toBe(3);

			// Inside the cooldown the next operation fails fast instead of
			// paying another probe + `$.evalFile` round-trip.
			await expect(caller("ping", [])).rejects.toThrow(/backoff/);
			expect(host.loadCount()).toBe(3);
			expect(host.probeCount()).toBe(3);

			// Once the cooldown elapses a fresh flight is allowed — and a
			// recovered host clears the counter for good.
			host.setSilentLoadFailure(false);
			vi.setSystemTime(Date.now() + 31_000);
			const result = await caller("ping", []);

			expect(result.value).toBe("pong");
			expect(host.loadCount()).toBe(4);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("evalScript result type guard (Issue #71)", () => {
	test("a non-string callback value resolves as null and is logged", async () => {
		_resetBusForTests();
		const win = {
			__adobe_cep__: {
				evalScript: (_script: string, callback?: (result: string) => void) => {
					// Some CEP hosts deliver a DOM Event instead of the script
					// result — the same value reported as "Uncaught
					// [object Event]".
					callback?.(new Event("error") as unknown as string);
				},
			},
		} as unknown as Window;

		// "null" parses to a null probe result rather than throwing inside
		// JSON.parse or leaking the Event into callers.
		await expect(probeAfterEffectsEvalScript(win)).resolves.toBeNull();

		const warns = getEntries().filter(
			(e) => e.source === "host-bridge" && e.level === "warn",
		);
		expect(warns.some((e) => e.message.includes("non-string result"))).toBe(
			true,
		);
	});

	test("a string callback value still passes through unchanged", async () => {
		_resetBusForTests();
		const win = {
			__adobe_cep__: {
				evalScript: (_script: string, callback?: (result: string) => void) => {
					callback?.('{"ok":true,"appName":"after effects"}');
				},
			},
		} as unknown as Window;

		await expect(probeAfterEffectsEvalScript(win)).resolves.toEqual({
			ok: true,
			appName: "after effects",
		});
	});
});
