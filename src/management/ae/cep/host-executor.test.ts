import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeAll, describe, expect, test } from "vitest";
import {
	HOST_BUNDLE_SCHEMA_VERSION,
	HOST_BUNDLE_VERSION,
} from "@/management/ae/host/contract";
import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	getEntries,
} from "@/management/debug/logger";
import { createCepHostExecutor } from "./host-executor";

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
	/** What the resident `$.global.__TY_PLUS_HOST__` looks like on arrival. */
	readonly resident?: "absent" | "present";
	/** Schema the resident global reports (when `resident === "present"`). */
	readonly residentSchema?: number;
	/** Implementation revision the resident global reports. */
	readonly residentBundleVersion?: string;
	/** Schema the file on disk declares — what `$.evalFile` installs. */
	readonly fileSchema?: number;
	/** Implementation revision the file on disk installs. */
	readonly fileBundleVersion?: string;
	readonly extensionRoot?: string;
	/** Canned response for a host method call. */
	readonly methodResult?: () => Record<string, unknown>;
	/** Make `$.evalFile` fail (simulates a broken / locked bundle). */
	readonly failLoad?: boolean;
};

type FakeHost = {
	readonly win: Window;
	readonly scripts: string[];
	probeCount(): number;
	loadCount(): number;
	/** Mutate the resident global after construction (e.g. panel reload). */
	setResident(resident: "absent" | "present", schema?: number): void;
	setFailLoad(value: boolean): void;
};

/**
 * The ExtendScript engine side of the boundary: one `$.global` per AE host
 * session, shared by every CEP surface of the extension. The load script is
 * executed for real in a `node:vm` context against that shared global, so
 * these tests prove the script's own conditional-load logic instead of a
 * double's guess about it.
 */
type FakeEngine = {
	/** `$.global` of the shared engine. */
	readonly global: Record<string, unknown>;
	fileSchema: number;
	fileBundleVersion: string;
	failLoad: boolean;
	probes: number;
	loads: number;
};

const createFakeEngine = (options: FakeHostOptions = {}): FakeEngine => {
	const engine: FakeEngine = {
		global: {},
		fileSchema: options.fileSchema ?? HOST_BUNDLE_SCHEMA_VERSION,
		fileBundleVersion: options.fileBundleVersion ?? HOST_BUNDLE_VERSION,
		failLoad: options.failLoad ?? false,
		probes: 0,
		loads: 0,
	};
	if ((options.resident ?? "absent") === "present") {
		engine.global.__TY_PLUS_HOST__ = {
			__schemaVersion: options.residentSchema ?? HOST_BUNDLE_SCHEMA_VERSION,
			__bundleVersion: options.residentBundleVersion ?? HOST_BUNDLE_VERSION,
		};
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
 * Simulates the AE side of the boundary: `evalScript` responses for the
 * compatibility probe, the conditional `$.evalFile` block, and host method
 * calls, plus a resident `$.global.__TY_PLUS_HOST__` that survives across
 * CEP windows (an AE host session outlives panel reloads).
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

	const runLoadScript = (script: string): string => {
		try {
			const result = vm.runInNewContext(script, {
				$: {
					global: state.global,
					evalFile: (_path: string) => {
						state.loads += 1;
						if (state.failLoad) {
							throw new Error("Host bundle load failed: simulated");
						}
						state.global.__TY_PLUS_HOST__ = {
							__schemaVersion: state.fileSchema,
							__bundleVersion: state.fileBundleVersion,
						};
					},
				},
				alert: () => undefined,
			});
			return typeof result === "string" ? result : "null";
		} catch (error) {
			return JSON.stringify({
				ok: false,
				alerted: true,
				error: { message: `Host bundle load failed: ${String(error)}` },
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
				if (isLoadScript(script)) {
					callback?.(runLoadScript(script));
					return;
				}
				if (isProbeScript(script)) {
					state.probes += 1;
					const schema = residentSchemaOf(state);
					callback?.(
						JSON.stringify(
							schema === null
								? { ok: true, present: false }
								: {
										ok: true,
										present: true,
										schemaVersion: schema,
										bundleVersion: residentBundleVersionOf(state) ?? "",
									},
						),
					);
					return;
				}
				if (isAlertOnlyScript(script)) {
					callback?.("null");
					return;
				}
				callback?.(
					JSON.stringify(
						options.methodResult?.() ?? {
							ok: true,
							hostId: "after-effects",
							value: "pong",
						},
					),
				);
			},
		},
	} as unknown as Window;

	return {
		win,
		scripts,
		probeCount: () => state.probes,
		loadCount: () => state.loads,
		setResident: (resident, schema) => {
			if (resident === "present") {
				state.global.__TY_PLUS_HOST__ = {
					__schemaVersion: schema ?? -1,
					__bundleVersion: HOST_BUNDLE_VERSION,
				};
				return;
			}
			delete state.global.__TY_PLUS_HOST__;
		},
		setFailLoad: (value) => {
			state.failLoad = value;
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

	test("alerts through ExtendScript when host returns an unalerted execution failure", async () => {
		const host = createFakeHost({
			methodResult: () => ({
				ok: false,
				error: { message: "Script file not found: C:/missing.jsx" },
			}),
		});

		await expect(
			anyExecutor(host.win)("runScriptFile", ["C:/missing.jsx"]),
		).rejects.toThrow("Script file not found");
		expect(host.scripts.some(isAlertOnlyScript)).toBe(true);
	});

	test("does not send a duplicate alert when the host already alerted", async () => {
		const host = createFakeHost({
			methodResult: () => ({
				ok: false,
				alerted: true,
				error: { message: "Preset file not found: C:/missing.ffx" },
			}),
		});

		await expect(
			anyExecutor(host.win)("applyPreset", ["C:/missing.ffx"]),
		).rejects.toThrow("Preset file not found");
		expect(host.scripts.filter(isAlertOnlyScript)).toHaveLength(0);
	});
});

// Issue #158 — the reference lives in a comment because a `#NNN` inside a
// string literal on a code line is indistinguishable from a 3-digit hex colour
// to check-design-tokens, which flags it as a colour literal.
describe("host bundle load coordinator", () => {
	test("an absent bundle is loaded exactly once across three executors", async () => {
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
});
