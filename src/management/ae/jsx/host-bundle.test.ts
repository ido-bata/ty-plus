import {
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { transformSync } from "@babel/core";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createOperationWorkerContextProvider } from "@/management/ipc/operation-worker-context";

const source = readFileSync(
	new URL("./host-bundle.ext.ts", import.meta.url),
	"utf8",
);

let generatedBundle = "";
let temporaryDirectory = "";

beforeAll(async () => {
	temporaryDirectory = mkdtempSync(join(tmpdir(), "ty-plus-host-bundle-"));
	const temporaryEs5Path = join(temporaryDirectory, "ty-plus-host.es5.jsx");
	const hostEntry = fileURLToPath(
		new URL("./host-bundle.ext.ts", import.meta.url),
	);
	await build({
		entryPoints: [hostEntry],
		outfile: temporaryEs5Path,
		format: "iife",
		globalName: "__TY_PLUS_HOST__",
		banner: {
			js: "// ty-plus ExtendScript bundle - DO NOT EDIT\n// Generated from TypeScript sources",
		},
		target: "es2020",
		minify: false,
		sourcemap: false,
		logLevel: "silent",
	});
	const babelResult = transformSync(readFileSync(temporaryEs5Path, "utf8"), {
		filename: "ty-plus-host.jsx",
		presets: [
			[
				"@babel/preset-env",
				{
					targets: { ie: "6" },
					modules: false,
				},
			],
			"@babel/preset-typescript",
		],
		assumptions: {
			arrayLikeIsIterable: true,
			constantReexports: true,
			ignoreFunctionLength: true,
			ignoreToPrimitiveHint: true,
			mutableTemplateObject: true,
			noClassCalls: true,
			noDocumentAll: true,
			objectRestNoSymbols: true,
			privateFieldsAsProperties: true,
			pureGetters: true,
			setClassMethods: true,
			setComputedProperties: true,
			setPublicClassFields: true,
			setSpreadProperties: true,
			skipForOfIteratorClosing: true,
			superIsCallableConstructor: true,
		},
		plugins: [
			"@babel/plugin-transform-arrow-functions",
			"@babel/plugin-transform-class-properties",
			"@babel/plugin-transform-private-methods",
			"@babel/plugin-transform-private-property-in-object",
		],
		sourceType: "script",
		compact: false,
	});
	if (!babelResult?.code) throw new Error("Host bundle generation returned no code");
	generatedBundle = babelResult.code;
});

afterAll(() => {
	if (temporaryDirectory)
		rmSync(temporaryDirectory, { recursive: true, force: true });
});

const createGeneratedBundleWindow = (
	appRoot: unknown,
	supportRoot: unknown,
	options?: Readonly<{ os?: string; appPackageParent?: unknown }>,
) => {
	const sandbox = {
		$: {
			fileName: "C:/Ty Plus/extension/jsx/ty-plus-host.jsx",
			global: {},
			...(options?.os ? { os: options.os } : {}),
		},
		Folder: {
			appPackage: {
				fsName: appRoot,
				...(options?.appPackageParent
					? { parent: options.appPackageParent }
					: {}),
			},
			userData: { fsName: supportRoot },
		},
		alert: () => undefined,
	};
	const scripts: string[] = [];
	const payloads: unknown[] = [];
	const win = {
		SystemPath: { EXTENSION: "extension" },
		__adobe_cep__: {
			getSystemPath: () => "C:/Ty Plus/extension",
			evalScript: (script: string, callback?: (result: string) => void) => {
				scripts.push(script);
				// Issue #158: the CEP load coordinator probes the resident
				// global before it will consider `$.evalFile`, so the fake
				// host has to answer from the sandbox it actually owns.
				const readResidentMarker = (
					key: "__schemaVersion" | "__bundleVersion",
				): number | string | null => {
					const resident = (
						sandbox.$.global as {
							__TY_PLUS_HOST__?: Record<string, unknown>;
						}
					).__TY_PLUS_HOST__;
					const value = resident === undefined ? undefined : resident[key];
					return typeof value === "number" || typeof value === "string"
						? value
						: null;
				};
				const readResidentSchema = (): number | null => {
					const value = readResidentMarker("__schemaVersion");
					return typeof value === "number" ? value : null;
				};
				// Read from the bundle that actually ran rather than a literal:
				// the probe answer has to be the resident implementation's own
				// revision or the coordinator's compatibility check is untested.
				const readResidentBundleVersion = (): string | null => {
					const value = readResidentMarker("__bundleVersion");
					return typeof value === "string" ? value : null;
				};
				if (script.includes("$.evalFile")) {
					runInNewContext(generatedBundle, sandbox, {
						filename: "ty-plus-host.jsx",
					});
					callback?.(
						JSON.stringify({
							ok: true,
							loaded: true,
							schemaVersion: readResidentSchema() ?? -1,
							bundleVersion: readResidentBundleVersion() ?? "",
						}),
					);
					return;
				}
				if (script.includes("__schemaVersion")) {
					const schema = readResidentSchema();
					callback?.(
						JSON.stringify(
							schema === null
								? { ok: true, present: false }
								: {
										ok: true,
										present: true,
										schemaVersion: schema,
										bundleVersion: readResidentBundleVersion() ?? "",
									},
						),
					);
					return;
				}
				const hostBundle = (sandbox.$.global as {
					__TY_PLUS_HOST__?: { getHostContext: (args: string) => string };
				}).__TY_PLUS_HOST__;
				const raw = hostBundle?.getHostContext("[]") ?? "null";
				try {
					const parsed = JSON.parse(raw) as { value?: unknown };
					payloads.push(parsed.value);
				} catch {
					payloads.push(undefined);
				}
				callback?.(raw);
			},
		},
	};
	return { win: win as unknown as Window, scripts, payloads };
};

describe("ExtendScript host bundle command wrappers", () => {
	test("passes already decoded scanPluginEffectRoots roots through the generic wrapper", () => {
		expect(source).toContain(
			"scanPluginEffectRoots: wrapCallable(buildPluginEffectScanRows)",
		);
	});

	test("scans macOS .plugin bundles for effect binaries", () => {
		expect(source).toContain("/\\.plugin$/i.test");
		expect(source).toContain("collectPluginBundleBinaryPaths");
		expect(source).toContain('"/Contents/MacOS"');
	});

	test("imports png sequence folders via ImportOptions.sequence", () => {
		expect(source).toContain("firstPngSequenceFile");
		expect(source).toContain("options.sequence = true");
		expect(source).toContain("options.forceAlphabetical = true");
	});

	test("passes already decoded applyEffectByMatchName value through the generic wrapper", () => {
		expect(source).toContain(
			"applyEffectByMatchName: wrapCallable(applyEffectByMatchName)",
		);
	});

	test("publishes align widget host methods used during panel startup", () => {
		expect(source).toContain("getSelectionCount: wrapCallable(getSelectionCount)");
		expect(source).toContain("alignLayers: wrapCallable");
	});

	test("publishes authoring preparation methods for preset creation dialogs", () => {
		expect(source).toContain("prepareAnimationPresetTarget: wrapCallable");
		expect(source).toContain("openAnimationPresetSaveDialog: wrapCallable");
		expect(source).toContain("prepareLayerCompPresetScript: wrapCallable");
		expect(source).toContain("prepareCodePresetScript: wrapCallable");
		expect(source).toContain("prepareEasingPresetScript: wrapCallable");
	});

	test("publishes the host bundle on $.global for CEP evalScript callers", () => {
		expect(source).toContain("$.global.__TY_PLUS_HOST__ = hostBundle;");
	});

	test("returns a structured wrapper failure without a modal alert", () => {
		// Issue #72: CEP-mediated calls must not raise ExtendScript alert();
		// the JS side surfaces the failure as a thrown error plus a
		// non-modal notification. Standalone .jsx generation keeps alert().
		expect(source).not.toContain("showExecutionFailureAlert");
		const failureIndex = source.indexOf('code: "AE_EVAL_FAILED"');
		expect(failureIndex).toBeGreaterThan(-1);
		expect(source).not.toContain("alerted: true");
	});

	test("does not reject animation presets only because no layer is selected", () => {
		expect(source).not.toContain(
			"Select at least one layer before applying a preset",
		);
		expect(source).toContain(
			"comp.selectedLayers.length > 0 ? comp.selectedLayers[0] : comp.layer(1)",
		);
	});

	test("installs JSON ponyfill before host methods use JSON parse/stringify", () => {
		const ponyfillIndex = source.indexOf("installJsonPonyfill();");
		const parseIndex = source.indexOf("const parseRawArgs");

		expect(ponyfillIndex).toBeGreaterThan(-1);
		expect(parseIndex).toBeGreaterThan(-1);
		expect(ponyfillIndex).toBeLessThan(parseIndex);
	});

	test("does not use Array.isArray because ExtendScript lacks it", () => {
		expect(source).not.toContain("Array.isArray(");
		expect(source).toContain('Object.prototype.toString.call(value) === "[object Array]"');
	});

	test("does not create authoring folders from ExtendScript", () => {
		// Directory creation for an authoring target is part of the write,
		// so it belongs to the CEP storage write boundary where a
		// permission failure can escalate (Issue #160). The recursive
		// `ensureFolder` walk that used to live here moved to
		// `src/management/storage/write/authoring-write.ts`.
		expect(source).not.toContain("const ensureFolder =");
		expect(source).not.toContain("f.create();");
	});

	test("selects the new last keyframe in the multi-point path so the user's selection is preserved after addKey shifts indices", () => {
		// Root cause regression: in the multi-point (bounce/elastic → curve)
		// path, applyEasing explicitly selects each new middle key with
		// `setSelectedAtKey(newKey, true)`, but the *final* key in the
		// `created` array (the new k2 — `k2 + created.length - 1` after
		// addKey shifts subsequent indices) is never re-selected. If the
		// user originally had every keyframe selected, the result is "all
		// but the last" — which is jarring when the user expects the eased
		// range to remain the active selection.
		const applyEasingIndex = source.indexOf("const applyEasing = (payload:");
		expect(applyEasingIndex).toBeGreaterThan(-1);

		// Locate the multi-point block: it is the `if (points.length > 2)`
		// branch that pushes the new k2 with `created.push(k2 + created.length - 1)`.
		const multiPointIndex = source.indexOf("if (points.length > 2)");
		expect(multiPointIndex).toBeGreaterThan(-1);
		// The if-block opens with `\t\t\t\tif (points.length > 2) {` and closes
		// with `\t\t\t\t}\n` at the same indentation. Find the closing brace
		// that immediately follows the opening one.
		const multiPointClose = source.indexOf(
			"\n\t\t\t\t}\n",
			multiPointIndex,
		);
		expect(multiPointClose).toBeGreaterThan(multiPointIndex);

		const multiPointBody = source.substring(
			multiPointIndex,
			multiPointClose,
		);
		// The new last keyframe (the value pushed via
		// `created.push(k2 + created.length - 1)`) must be re-selected so it
		// stays part of the active selection set. The middle-key loop already
		// calls `setSelectedAtKey(newKey, true)` for each inserted key, but
		// the final key (which the user did not originally select) is never
		// explicitly re-selected. Asserting on `created[created.length - 1]`
		// (or any variable that names that final pushed value) catches the
		// regression.
		expect(multiPointBody).toMatch(
			/setSelectedAtKey\(created\[created\.length\s*-\s*1\],\s*true\)/,
		);
	});

	test("routes detectedType from the applyEasing payload into the keyframe interpolation helper", () => {
		// applyEasing must pull the detected type out of the payload and pass it
		// to a per-pair interpolation switch so the AE keyframe row reflects
		// the user's chosen curve (linear/hold/easeIn/easeOut) instead of
		// always rendering as BEZIER.
		const applyEasingIndex = source.indexOf("const applyEasing = (payload:");
		const helperIndex = source.indexOf(
			"const applyInterpolationTypeForKeyPair = (",
		);
		expect(applyEasingIndex).toBeGreaterThan(-1);
		expect(helperIndex).toBeGreaterThan(-1);

		const applyEasingBody = source.substring(
			applyEasingIndex,
			helperIndex > applyEasingIndex ? helperIndex : source.length,
		);
		expect(applyEasingBody).toContain(
			'const detectedType = String(payload.detectedType ?? "bezier")',
		);
		expect(applyEasingBody).toContain(
			"applyInterpolationTypeForKeyPair(prop, k1, k2, detectedType)",
		);
		// The helper must be invoked from BOTH the multi-point path and the
		// single-pair path so procedural (bounce/elastic) outer k1/k2 also
		// honor the detected type when applicable.
		const helperInvocations = source.match(
			/applyInterpolationTypeForKeyPair\(prop, k1, k2, detectedType\)/g,
		);
		expect(helperInvocations?.length ?? 0).toBeGreaterThanOrEqual(2);
	});

	test("switches KeyframeInterpolationType by detected type for the outer (k1, k2) pair", () => {
		const helperIndex = source.indexOf(
			"const applyInterpolationTypeForKeyPair = (",
		);
		expect(helperIndex).toBeGreaterThan(-1);
		const helperEnd = source.indexOf("};\n", helperIndex);
		const helperBody = source.substring(helperIndex, helperEnd);

		// linear: both directions of both k1 and k2
		expect(helperBody).toContain('detectedType === "linear"');
		// The source uses tab-indented multi-line setInterpolationTypeAtKey
		// calls, so match the actual whitespace pattern.
		expect(helperBody).toContain(
			"KeyframeInterpolationType.LINEAR,\n\t\t\t\tKeyframeInterpolationType.LINEAR",
		);
		// hold: only k1
		expect(helperBody).toContain('detectedType === "hold"');
		expect(helperBody).toContain(
			"prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.HOLD)",
		);
		// easeIn: k1 incoming LINEAR, outgoing BEZIER
		expect(helperBody).toContain('detectedType === "easeIn"');
		expect(helperBody).toContain(
			"KeyframeInterpolationType.LINEAR,\n\t\t\t\tKeyframeInterpolationType.BEZIER",
		);
		// easeOut: k2 incoming BEZIER, outgoing LINEAR
		expect(helperBody).toContain('detectedType === "easeOut"');
		expect(helperBody).toContain(
			"KeyframeInterpolationType.BEZIER,\n\t\t\t\tKeyframeInterpolationType.LINEAR",
		);
		// bezier / easeInOut: fall through to the default BEZIER the segment
		// loop already set, so the helper must NOT override them.
	});

	test("publishes getLabelColorNames so the context menu can read AE's label names", () => {
		// The right-click menu rebuild nests per-curve-category submenus, each
		// populated with AE's actual user-defined label color names (or bundled
		// English defaults as fallback). The host must expose a method that
		// reads AE preferences for those names.
		expect(source).toContain(
			"getLabelColorNames: wrapCallable(readLabelColorNames)",
		);
	});

	test("readLabelColorNames reads AE preferences for label color names", () => {
		// AE stores label names in preferences with paths that vary by version,
		// so the implementation must try multiple known key shapes and skip
		// indices that produce no value rather than throw.
		expect(source).toContain(
			"const readLabelColorNames = (): {",
		);
		expect(source).toContain("getPrefAsString");
		expect(source).toContain("PREFType.PREF_Type_MACHINE_INDEPENDENT");
		// Section/key shape varies across AE versions (CC 2018 used
		// `Label Color - 1`; 2022+ uses `Label Color 1`; older builds used
		// `Label_Color_1`). The implementation must probe multiple shapes.
		expect(source).toContain("`Label Color - ${i}`");
		expect(source).toContain("`Label Color ${i}`");
		expect(source).toContain("`Label_Color_${i}`");
		// Returns a structured object with `names` keyed by color index 1-16
		// so React can merge it with bundled defaults on the consumer side.
		expect(source).toContain("names");
	});

	test("skips setTemporalEaseAtKey on the single-pair path when detectedType is linear or hold", () => {
		// Root cause regression: AE silently keeps the keyframe rendered as
		// BEZIER (Easy Ease) when setTemporalEaseAtKey runs before the LINEAR
		// override, so the bezier/ease setup MUST be skipped for these types.
		// Mirrors the legacy archive's applySimpleEase guard:
		// `if (detectedType !== "linear") { ... setTemporalEaseAtKey ... }`.
		expect(source).toContain(
			'if (detectedType !== "linear" && detectedType !== "hold") {',
		);
		// The setTemporalEaseAtKey calls for the outer (k1, k2) pair must sit
		// inside that guard, not outside it.
		const guardIndex = source.indexOf(
			'if (detectedType !== "linear" && detectedType !== "hold") {',
		);
		expect(guardIndex).toBeGreaterThan(-1);
		// Find the closing brace of the if-block. The body uses tabs and the
		// closing brace sits on its own line, so search for "\n\t\t\t\t}\n".
		const guardEnd = source.indexOf("\n\t\t\t\t}\n", guardIndex);
		const guardBody = source.substring(guardIndex, guardEnd);
		expect(guardBody).toContain(
			"prop.setTemporalEaseAtKey(k1, existingIn1, outArr)",
		);
		expect(guardBody).toContain(
			"prop.setTemporalEaseAtKey(k2, inArr, existingOut2)",
		);
	});

	test("defines a captureKeyframeValues callable exported by the host bundle", () => {
		expect(source).toMatch(/captureKeyframeValues/);
		const fnIndex = source.indexOf("const captureKeyframeValues =");
		expect(fnIndex).toBeGreaterThan(-1);
	});

	describe("preset asset consistency (Issue #130)", () => {
		test("publishes verifyPresetAsset so the React side can re-check the asset on disk", () => {
			// The contract surfaces `verifyPresetAsset` so the panel can:
	 //   1. detect stale records at startup,
	 //   2. gate the catalog persist on a positive existence check.
			expect(source).toContain(
				"verifyPresetAsset: wrapCallable((filePath: string) =>",
			);
		});

		test("verifyPresetAsset returns exists:false for empty paths without throwing", () => {
			// A missing/empty `filePath` is the common startup case (cloud
			// preset with no on-disk asset) — never an exception.
			const fnIndex = source.indexOf("const verifyPresetAsset =");
			expect(fnIndex).toBeGreaterThan(-1);
			const body = source.substring(fnIndex, fnIndex + 800);
			expect(body).toMatch(/safePath\s*=\s*trimStr\(String\(filePath/);
			expect(body).toMatch(/exists:\s*false/);
		});

		test("authoring preparation returns an authorized target instead of writing bytes", () => {
			// Issue #160 moves the byte write out of ExtendScript: a
			// protected-path `File.open("w")` failure could not escalate to
			// UAC, and a silently dropped write let the Issue #130 persist
			// step commit a record pointing at nothing. The write plus
			// read-back verification now live in
			// `src/management/storage/write/authoring-write.ts`, which runs
			// before `assertPresetAssetPresent` allows any catalog record.
			expect(source).not.toContain('file.open("w")');
			expect(source).not.toContain("PRESET_WRITE_FAILED:");
			expect(source).toContain("const prepareLayerCompPresetScript =");
			expect(source).toContain("const prepareCodePresetScript =");
			expect(source).toContain("const prepareEasingPresetScript =");
		});

		test("save-root authorization is shared by read and write", () => {
			// One authority, three consumers: `assertAllowedFilePath` for
			// read/execute and `authorizeSaveDir` for write both resolve
			// through `classifyAllowedRoot`, so the roots can never drift
			// apart again (the drift that produced Issue #160).
			expect(source).toContain("const classifyAllowedRoot = (");
			expect(source).toContain("const authorizeSaveDir = (");
			const classifyIndex = source.indexOf("const classifyAllowedRoot = (");
			const filePathIndex = source.indexOf("const assertAllowedFilePath = (");
			const saveDirIndex = source.indexOf("const authorizeSaveDir = (");
			expect(classifyIndex).toBeGreaterThan(-1);
			expect(filePathIndex).toBeGreaterThan(classifyIndex);
			expect(saveDirIndex).toBeGreaterThan(classifyIndex);
		});
	});

	test("applyEasing honors the targeting payload field (incoming/outgoing/both)", () => {
		expect(source).toMatch(/targeting/);
		// The targeting read should happen inside applyEasing, before
		// setTemporalEaseAtKey calls.
		const fnIndex = source.indexOf("const applyEasing = (payload:");
		expect(fnIndex).toBeGreaterThan(-1);
		const body = source.substring(fnIndex);
		expect(body).toMatch(/targeting/);
	});

	test("prepareEasingPresetScript generates a multi-point apply path when points is provided", () => {
		// Regression test for the critical review finding: the .jsx
		// script used to embed `points` as a header comment but never
		// reference it in the apply logic, so saved multi-ease presets
		// silently degraded to a single cubic on apply. The generated
		// code must branch on `points.length > 2` to call the
		// multi-point path.
		const fnIndex = source.indexOf("const prepareEasingPresetScript =");
		expect(fnIndex).toBeGreaterThan(-1);
		const body = source.substring(fnIndex);
		expect(body).toMatch(/function applyEasingMulti/);
		expect(body).toMatch(/if \(points && points\.length > 2\)/);
		expect(body).toMatch(/applyEasingMulti\(p, k1, k2, points\)/);
	});

	describe("applyLoopEasing (Issue #80 loop mode)", () => {
		test("declares applyLoopEasing and exports it from the host bundle", () => {
			expect(source).toMatch(/const applyLoopEasing =/);
			const fnIndex = source.indexOf("const applyLoopEasing =");
			expect(fnIndex).toBeGreaterThan(-1);
			const exports = source.substring(fnIndex);
			// hostBundle must surface applyLoopEasing so the CEP
			// executor can forward it. Find the hostBundle section
			// (defined later in the file) and require it appears there.
			expect(exports).toMatch(/applyLoopEasing:\s*wrapCallable/);
		});

		test("replicates the segment points loopCount times into the unit square", () => {
			const helperIndex = source.indexOf(
				"const buildLoopReplicatedPoints =",
			);
			expect(helperIndex).toBeGreaterThan(-1);
			const body = source.substring(
				helperIndex,
				helperIndex + 4000,
			);
			// The helper scales handle x-offsets by 1/loopCount so each
			// cycle's segment-relative handle coordinates stay correct.
			expect(body).toMatch(/loopCount/);
			expect(body).toMatch(/scale/);
			// It must skip the first point of cycle 0 (== k1) and the
			// last point of the final cycle (== k2) so we don't double-
			// write the outer keyframes.
			expect(body).toMatch(/i === 0 && j === 0/);
			expect(body).toMatch(/i === loopCount - 1 && j === last/);
		});

		test("applyLoopEasing falls back to applyEasing when loopCount < 2", () => {
			const fnIndex = source.indexOf("const applyLoopEasing =");
			expect(fnIndex).toBeGreaterThan(-1);
			const body = source.substring(fnIndex, fnIndex + 1500);
			// The branch must use the existing applyEasing path so the
			// caller still gets a single-cycle apply instead of silently
			// no-op'ing.
			expect(body).toMatch(/loopCount\s*<\s*2/);
			expect(body).toMatch(/return applyEasing\(payload\)/);
		});

		test("applyLoopEasing falls back to applyEasing when points lack interior keys", () => {
			// A 2-point curve has no interior points, so the multi-point
			// replication would have nothing to fill. We must fall through
			// to the regular 2-point apply path instead of producing zero
			// middle keys.
			const fnIndex = source.indexOf("const applyLoopEasing =");
			expect(fnIndex).toBeGreaterThan(-1);
			const body = source.substring(fnIndex, fnIndex + 2000);
			expect(body).toMatch(/segmentPoints\.length\s*<\s*3/);
			expect(body).toMatch(/return applyEasing\(payload\)/);
		});

		test("applyLoopEasing forces targeting to in when delegating to applyEasing", () => {
			// Loop only modifies the segments' incoming handles. The
			// payload handed to applyEasing must reflect that so the
			// targeting-gating logic skips the outgoing-side writes.
			const fnIndex = source.indexOf("const applyLoopEasing =");
			expect(fnIndex).toBeGreaterThan(-1);
			const body = source.substring(fnIndex, fnIndex + 2500);
			expect(body).toMatch(/loopPayload\.targeting\s*=\s*"in"/);
		});
	});

	test("publishes getHostContext to return appRoot from AE Folder.appPackage and support root", () => {
		const contextStart = source.indexOf("getHostContext: wrapCallable");
		const contextEnd = source.indexOf(
			"runScriptFile: wrapCallable",
			contextStart,
		);
		expect(contextStart).toBeGreaterThan(-1);
		expect(contextEnd).toBeGreaterThan(contextStart);

		const contextBody = source.slice(contextStart, contextEnd);
		const appRootDeclaration = contextBody.match(
			/const appRoot\s*=\s*[\s\S]*?;/,
		);
		expect(appRootDeclaration).not.toBeNull();
		expect(contextBody).toContain("Folder.appPackage");
		expect(contextBody).toContain("appRoot,");
		expect(contextBody).toContain("Folder.userData.fsName");
		expect(contextBody).not.toContain("app.path");
		expect(contextBody).not.toContain("app.version");
		expect(contextBody).not.toContain("aeVersion");
		expect(contextBody).not.toMatch(/appRoot\s*\|\|\s*["']{2}/);
	});

	test("evaluates the generated host bundle through the provider without path fallback or AE version identity", async () => {
		const fixture = createGeneratedBundleWindow(
			"C:/Program Files/Adobe/After Effects 日本語",
			"C:/Users/Example User/AppData/Roaming/Ty Plus",
		);
		const context = await createOperationWorkerContextProvider(fixture.win)();

		expect(context).toEqual({
			appRoot: "C:/Program Files/Adobe/After Effects 日本語",
			supportRoot: "C:/Users/Example User/AppData/Roaming/Ty Plus",
			sessionId: expect.stringMatching(/^ae-\d+$/u),
		});
		expect(fixture.payloads[0]).toEqual({
			appRoot: "C:/Program Files/Adobe/After Effects 日本語",
			supportRoot: "C:/Users/Example User/AppData/Roaming/Ty Plus",
			sessionId: expect.stringMatching(/^ae-\d+$/u),
		});
		expect(context).not.toHaveProperty("aeVersion");
		expect(
			fixture.scripts.filter((script) => script.includes("getHostContext")),
		).toHaveLength(1);
	});

	test("evaluates a macOS-shaped Folder.appPackage path without AE version identity", async () => {
		const fixture = createGeneratedBundleWindow(
			"/Applications/Adobe After Effects 2026/Adobe After Effects.app/Contents",
			"/Users/example/Library/Application Support/Ty Plus",
		);
		const context = await createOperationWorkerContextProvider(fixture.win)();

		expect(context.appRoot).toBe(
			"/Applications/Adobe After Effects 2026/Adobe After Effects.app/Contents",
		);
		expect(context).not.toHaveProperty("aeVersion");
	});

	test("resolves macOS appRoot to the .app parent so worker scan roots resolve", async () => {
		const fixture = createGeneratedBundleWindow(
			"/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app",
			"/Users/example/Library/Application Support/Ty Plus",
			{
				os: "Mac OS",
				appPackageParent: {
					fsName: "/Applications/Adobe After Effects 2026",
					name: "Adobe After Effects 2026",
				},
			},
		);
		const context = await createOperationWorkerContextProvider(fixture.win)();

		expect(context.appRoot).toBe("/Applications/Adobe After Effects 2026");
	});

	test.each([
		["missing", undefined],
		["non-string", 42],
		["relative", "After Effects/Contents"],
	])("rejects a %s Folder.appPackage root", async (_label, appRoot) => {
		const fixture = createGeneratedBundleWindow(
			appRoot,
			"C:/Users/Example User/AppData/Roaming/Ty Plus",
		);

		await expect(
			createOperationWorkerContextProvider(fixture.win)(),
		).rejects.toMatchObject({
			code: "host_context_missing",
			message: "Host context is invalid",
		});
		expect(fixture.payloads[0]).toMatchObject({
			supportRoot: "C:/Users/Example User/AppData/Roaming/Ty Plus",
			sessionId: expect.stringMatching(/^ae-\d+$/u),
		});
		if (typeof appRoot === "string") {
			expect(fixture.payloads[0]).toHaveProperty("appRoot", appRoot);
		} else {
			expect(fixture.payloads[0]).not.toHaveProperty("appRoot");
		}
	});

	describe("assertAllowedFilePath AE Support Files root (Issue #76)", () => {
		const makeFolderChain = (fsPath: string): Record<string, unknown> => {
			const absolute = fsPath.startsWith("/");
			const segments = fsPath.split("/").filter((s) => s.length > 0);
			let parent: Record<string, unknown> | undefined;
			let current = absolute ? "/" : "";
			for (const segment of segments) {
				current =
					current === "" || current === "/"
						? `${current}${segment}`
						: `${current}/${segment}`;
				const node: Record<string, unknown> = {
					fsName: current,
					absoluteURI: current,
					name: segment,
					parent,
					exists: true,
				};
				parent = node;
			}
			return parent as Record<string, unknown>;
		};

		const evaluateWithHost = (
			appPackageFsName: string | undefined,
			osName: string | undefined,
		): Record<string, (rawArgs: string) => string> => {
			const extensionFile = "C:/Ty Plus/extension/jsx/ty-plus-host.jsx";
			const folderChain =
				appPackageFsName === undefined
					? undefined
					: makeFolderChain(appPackageFsName);
			const sandbox: Record<string, unknown> = {
				$: {
					fileName: extensionFile,
					global: {},
					...(osName === undefined ? {} : { os: osName }),
				},
				Folder: {
					...(folderChain === undefined ? {} : { appPackage: folderChain }),
					userData: makeFolderChain("C:/Users/Example User/AppData/Roaming"),
				},
				File: function MockFile(this: Record<string, unknown>, p: string) {
					this.fsName = p;
					this.exists = false;
					const dir = p.split("/").slice(0, -1).join("/");
					this.parent = makeFolderChain(dir);
				},
				alert: () => undefined,
			};
			runInNewContext(generatedBundle, sandbox, {
				filename: "ty-plus-host.jsx",
			});
			return (
				sandbox.$ as {
					global: Record<string, Record<string, (rawArgs: string) => string>>;
				}
			).global.__TY_PLUS_HOST__;
		};

		test("allows a Support Files script on Windows via runScriptFile", () => {
			const host = evaluateWithHost(
				"C:/Program Files/Adobe/After Effects 2026/Support Files",
				undefined,
			);
			const raw = host.runScriptFile(
				JSON.stringify([
					"C:/Program Files/Adobe/After Effects 2026/Support Files/Scripts/ScriptUI Panels/ty-plus/panel.jsx",
				]),
			);
			// The guard passed: execution reached the existence check.
			expect(raw).toContain("Script file not found");
			expect(raw).not.toContain("outside allowed roots");
		});

		test("allows a Support Files preset on macOS via runScriptFile", () => {
			const host = evaluateWithHost(
				"/Applications/Adobe After Effects 2026/Adobe After Effects.app",
				"Macintosh",
			);
			const raw = host.runScriptFile(
				JSON.stringify([
					"/Applications/Adobe After Effects 2026/Scripts/preset.jsx",
				]),
			);
			expect(raw).toContain("Script file not found");
			expect(raw).not.toContain("outside allowed roots");
		});

		test("still rejects paths outside every allowed root", () => {
			const host = evaluateWithHost(
				"C:/Program Files/Adobe/After Effects 2026/Support Files",
				undefined,
			);
			const raw = host.runScriptFile(
				JSON.stringify(["C:/Windows/Temp/evil.jsx"]),
			);
			expect(raw).toContain("outside allowed roots");
		});

		test("keeps userData and extension roots allowed", () => {
			const host = evaluateWithHost(
				"C:/Program Files/Adobe/After Effects 2026/Support Files",
				undefined,
			);
			expect(
				host.runScriptFile(
					JSON.stringify([
						"C:/Users/Example User/AppData/Roaming/preset.ffx",
					]),
				),
			).toContain("Script file not found");
			expect(
				host.runScriptFile(
					JSON.stringify(["C:/Ty Plus/extension/jsx/tool.jsx"]),
				),
			).toContain("Script file not found");
		});

		test("fails closed when Folder.appPackage is missing", () => {
			const host = evaluateWithHost(undefined, undefined);
			expect(
				host.runScriptFile(
					JSON.stringify([
						"C:/Program Files/Adobe/After Effects 2026/Support Files/Scripts/panel.jsx",
					]),
				),
			).toContain("outside allowed roots");
			expect(
				host.runScriptFile(
					JSON.stringify([
						"C:/Users/Example User/AppData/Roaming/preset.ffx",
					]),
				),
			).toContain("Script file not found");
		});
	});
});

describe("preset authoring save-root authority (Issue #160)", () => {
	const SUPPORT_FILES =
		"D:/4_apps/adobe/Adobe After Effects 2026/Support Files";
	const USER_DATA = "C:/Users/Example User/AppData/Roaming";
	// Mirrors `assertAllowedFilePath`: the extension root is the folder that
	// contains the running host bundle (`$.fileName`).parent, i.e. the
	// bundled `jsx/` directory — read, execute, and write must agree.
	const EXTENSION_ROOT = "C:/Ty Plus/extension/jsx";

	const makeFolderChain = (fsPath: string): Record<string, unknown> => {
		const absolute = fsPath.startsWith("/");
		const segments = fsPath.split("/").filter((s) => s.length > 0);
		let parent: Record<string, unknown> | undefined;
		let current = absolute ? "/" : "";
		for (const segment of segments) {
			current =
				current === "" || current === "/"
					? `${current}${segment}`
					: `${current}/${segment}`;
			const node: Record<string, unknown> = {
				fsName: current,
				absoluteURI: current,
				name: segment,
				parent,
				exists: true,
			};
			parent = node;
		}
		return parent as Record<string, unknown>;
	};

	type AuthoringHostOptions = {
		appPackageFsName?: string;
		userDataFsName?: string;
		osName?: string;
		projectFilePath?: string | null;
		selectedLayers?: number;
	};

	const buildAuthoringHost = (options: AuthoringHostOptions = {}) => {
		const appPackageFsName = options.appPackageFsName ?? SUPPORT_FILES;
		const userDataFsName = options.userDataFsName ?? USER_DATA;
		const projectFilePath =
			options.projectFilePath === undefined
				? "D:/projects/demo.aep"
				: options.projectFilePath;

		const folderCtor = function Folder(
			this: Record<string, unknown>,
			path: string,
		) {
			this.fsName = String(path ?? "");
			this.exists = true;
		};
		(folderCtor as unknown as Record<string, unknown>).userData = {
			fsName: userDataFsName,
		};
		(folderCtor as unknown as Record<string, unknown>).appPackage =
			appPackageFsName === undefined
				? undefined
				: makeFolderChain(appPackageFsName);

		const fileCtor = function File(
			this: Record<string, unknown>,
			path: string,
		) {
			this.fsName = String(path ?? "");
			this.exists = false;
			const segments = String(path ?? "").replace(/\\/g, "/").split("/");
			this.name = segments[segments.length - 1] ?? "";
			this.parent = makeFolderChain(segments.slice(0, -1).join("/"));
		};

		const sandbox: Record<string, unknown> = {
			$: {
				fileName: `${EXTENSION_ROOT}/ty-plus-host.jsx`,
				global: {},
				...(options.osName === undefined ? {} : { os: options.osName }),
			},
			Folder: folderCtor,
			File: fileCtor,
			app: {
				project: {
					file:
						projectFilePath == null ? null : { fsName: projectFilePath },
					activeItem: {
						selectedLayers: new Array(options.selectedLayers ?? 1).fill({}),
					},
				},
				beginUndoGroup: () => undefined,
				endUndoGroup: () => undefined,
				findMenuCommandId: () => 0,
				executeCommand: () => undefined,
			},
			alert: () => undefined,
		};

		runInNewContext(generatedBundle, sandbox, {
			filename: "ty-plus-host.jsx",
		});
		return (
			sandbox.$ as {
				global: Record<string, Record<string, (rawArgs: string) => string>>;
			}
		).global.__TY_PLUS_HOST__;
	};

	const callPrepare = (
		host: Record<string, (rawArgs: string) => string>,
		method: string,
		input: Record<string, unknown>,
	): { ok: boolean; value?: Record<string, unknown>; error?: { message?: string } } => {
		const fn = host[method];
		expect(typeof fn).toBe("function");
		return JSON.parse(fn(JSON.stringify([input]))) as {
			ok: boolean;
			value?: Record<string, unknown>;
			error?: { message?: string };
		};
	};

	const layerCompInput = (saveDir: string, extra: Record<string, unknown> = {}) => ({
		name: "MyPreset",
		type: "comp",
		saveDir,
		...extra,
	});

	test("does not carry the stale userData-only save gate into production source", () => {
		// The whole reason Issue #160 exists: `assertAllowedSaveDir` only
		// allowed `Folder.userData`, so the canonical AE Support Files
		// target was rejected with `Save directory is outside user data:`
		// before any write or UAC consent could even be attempted. If the
		// stale policy comes back, this test fails.
		expect(source).not.toContain("Save directory is outside user data");
		expect(source).not.toContain("assertAllowedSaveDir");
		// The ExtendScript side must not own protected file writes any more.
		expect(source).not.toContain('file.open("w")');
	});

	test("accepts <AE Support Files>/Scripts/ty-plus/... instead of rejecting it", () => {
		const host = buildAuthoringHost({
			appPackageFsName: SUPPORT_FILES,
			projectFilePath: `${SUPPORT_FILES}/../../../projects/demo.aep`,
		});
		const result = callPrepare(
			host,
			"prepareLayerCompPresetScript",
			layerCompInput(`${SUPPORT_FILES}/Scripts/ty-plus/comp-presets`),
		);
		expect(result.error?.message ?? "").not.toContain("outside user data");
		expect(result.ok).toBe(true);
		expect(result.value?.rootClass).toBe("ae-support");
		const target = String(result.value?.targetPath ?? "").replace(/\\/g, "/");
		expect(target).toContain("/Scripts/ty-plus/comp-presets/MyPreset.jsx");
	});

	test("accepts the easing / code / animation authoring roots under Support Files", () => {
		const host = buildAuthoringHost({ appPackageFsName: SUPPORT_FILES });
		for (const [method, subfolder] of [
			["prepareEasingPresetScript", "easing"],
			["prepareCodePresetScript", "code-presets"],
			["prepareLayerCompPresetScript", "layer-presets"],
		] as const) {
			const input =
				method === "prepareEasingPresetScript"
					? layerCompInput(`${SUPPORT_FILES}/Scripts/ty-plus/${subfolder}`, {
							cubic: [0.42, 0, 0.58, 1],
						})
					: layerCompInput(`${SUPPORT_FILES}/Scripts/ty-plus/${subfolder}`);
			const result = callPrepare(host, method, input);
			expect(result.error?.message ?? "").not.toContain("outside user data");
			expect(result.ok).toBe(true);
			expect(result.value?.rootClass).toBe("ae-support");
		}
		const animation = callPrepare(
			host,
			"prepareAnimationPresetTarget",
			layerCompInput(`${SUPPORT_FILES}/Presets/ty-plus/presets`),
		);
		expect(animation.ok).toBe(true);
		expect(animation.value?.rootClass).toBe("ae-support");
	});

	test("normalizes backslashes and Windows casing before matching the root", () => {
		const host = buildAuthoringHost({ appPackageFsName: SUPPORT_FILES });
		const backslashed = layerCompInput(
			"D:\\4_apps\\adobe\\Adobe After Effects 2026\\Support Files\\Scripts\\ty-plus\\comp-presets",
		);
		const mixedCase = layerCompInput(
			"D:/4_apps/Adobe/Adobe After Effects 2026/SUPPORT FILES/Scripts/ty-plus/comp-presets",
		);
		for (const input of [backslashed, mixedCase]) {
			const result = callPrepare(host, "prepareLayerCompPresetScript", input);
			expect(result.ok).toBe(true);
			expect(result.value?.rootClass).toBe("ae-support");
		}
	});

	test("keeps userData and the extension root allowed as authoring targets", () => {
		const host = buildAuthoringHost({ appPackageFsName: SUPPORT_FILES });
		const userData = callPrepare(
			host,
			"prepareLayerCompPresetScript",
			layerCompInput(`${USER_DATA}/ty-plus/layer-presets`),
		);
		expect(userData.ok).toBe(true);
		expect(userData.value?.rootClass).toBe("user-data");

		const extension = callPrepare(
			host,
			"prepareCodePresetScript",
			layerCompInput(`${EXTENSION_ROOT}/presets/code`),
		);
		expect(extension.ok).toBe(true);
		expect(extension.value?.rootClass).toBe("extension");
	});

	test("rejects a Support Files prefix collision such as 'Support Files Evil/...'", () => {
		const host = buildAuthoringHost({ appPackageFsName: SUPPORT_FILES });
		const result = callPrepare(
			host,
			"prepareLayerCompPresetScript",
			layerCompInput(
				"D:/4_apps/adobe/Adobe After Effects 2026/Support Files Evil/Scripts/ty-plus/comp-presets",
			),
		);
		expect(result.ok).toBe(false);
		expect(result.error?.message).toContain("outside allowed roots");
		expect(result.error?.message ?? "").not.toContain("outside user data");
	});

	test("rejects an arbitrary path so an authored preset can never be un-executable", () => {
		// read / execute go through `assertAllowedFilePath` with the same
		// three roots. A target outside them would be written, verified and
		// persisted only to fail execution with `Path is outside allowed
		// roots`, so authoring refuses it up front instead.
		const host = buildAuthoringHost({ appPackageFsName: SUPPORT_FILES });
		const result = callPrepare(
			host,
			"prepareLayerCompPresetScript",
			layerCompInput("D:/Somewhere Else/my-presets"),
		);
		expect(result.ok).toBe(false);
		expect(result.error?.message).toContain("outside allowed roots");
	});

	test("ignores a stray userSelected flag instead of opening an un-executable target", () => {
		const host = buildAuthoringHost({ appPackageFsName: SUPPORT_FILES });
		const result = callPrepare(
			host,
			"prepareCodePresetScript",
			layerCompInput("D:/Somewhere Else/my-presets", { userSelected: true }),
		);
		expect(result.ok).toBe(false);
		expect(result.error?.message).toContain("outside allowed roots");
	});

	test("root classification never implies a privilege escalation", () => {
		// Path authorization and privilege escalation are different
		// decisions (docs/architecture/storage/preset-assets.md). The
		// prepared target carries only its root class; no elevation request
		// is implied by the classification itself.
		const host = buildAuthoringHost({ appPackageFsName: SUPPORT_FILES });
		const result = callPrepare(
			host,
			"prepareAnimationPresetTarget",
			layerCompInput(`${SUPPORT_FILES}/Presets/ty-plus/presets`),
		);
		expect(result.ok).toBe(true);
		expect(result.value).not.toHaveProperty("elevationRequested");
	});

	test("uses Folder.appPackage's parent as the macOS authoring root", () => {
		// On macOS `aeSupportFilesRoot()` returns `appPackage.parent`, i.e.
		// the AE install folder that holds Scripts / Presets — not the
		// `.app` bundle. Pin the derivation so a change to either branch
		// cannot silently widen or narrow the write root.
		const host = buildAuthoringHost({
			appPackageFsName:
				"/Applications/Adobe After Effects 2026/Adobe After Effects.app",
			userDataFsName: "/Users/example/Library/Application Support/Ty Plus",
			osName: "Macintosh",
		});
		const accepted = callPrepare(
			host,
			"prepareCodePresetScript",
			layerCompInput(
				"/Applications/Adobe After Effects 2026/Scripts/ty-plus/code-presets",
			),
		);
		expect(accepted.ok).toBe(true);
		expect(accepted.value?.rootClass).toBe("ae-support");

		const rejected = callPrepare(
			host,
			"prepareCodePresetScript",
			layerCompInput("/Users/example/Desktop/my-presets"),
		);
		expect(rejected.ok).toBe(false);
		expect(rejected.error?.message).toContain("outside allowed roots");
	});

	test("prepare helpers return content for AE-dependent assets and never write bytes", () => {
		const host = buildAuthoringHost({
			appPackageFsName: SUPPORT_FILES,
			projectFilePath: "D:/projects/demo.aep",
		});
		const layerComp = callPrepare(
			host,
			"prepareLayerCompPresetScript",
			layerCompInput(`${SUPPORT_FILES}/Scripts/ty-plus/layer-presets`),
		);
		expect(layerComp.ok).toBe(true);
		expect(typeof layerComp.value?.content).toBe("string");
		expect(String(layerComp.value?.content)).toContain("D:/projects/demo.aep");

		const easing = callPrepare(
			host,
			"prepareEasingPresetScript",
			layerCompInput(`${SUPPORT_FILES}/Scripts/ty-plus/easing`, {
				cubic: [0.1, 0.2, 0.3, 0.4],
			}),
		);
		expect(easing.ok).toBe(true);
		expect(String(easing.value?.content)).toContain("ty-plus: easing preset");

		// Code content is authored in the panel; the host only authorizes
		// and resolves the canonical target path.
		const code = callPrepare(
			host,
			"prepareCodePresetScript",
			layerCompInput(`${SUPPORT_FILES}/Scripts/ty-plus/code-presets`),
		);
		expect(code.ok).toBe(true);
		expect(code.value).not.toHaveProperty("content");
	});

	test("layer/comp preparation still requires a saved After Effects project", () => {
		const host = buildAuthoringHost({
			appPackageFsName: SUPPORT_FILES,
			projectFilePath: null,
		});
		const result = callPrepare(
			host,
			"prepareLayerCompPresetScript",
			layerCompInput(`${SUPPORT_FILES}/Scripts/ty-plus/layer-presets`),
		);
		expect(result.ok).toBe(false);
		expect(result.error?.message).toContain(
			"Save the After Effects project",
		);
	});
});
