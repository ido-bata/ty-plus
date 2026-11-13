/**
 * ExtendScript host bundle entry (`*.ext.ts`).
 *
 * The checked-in `ty-plus-host.bundle.js` is the full host until sources are migrated here.
 * `scripts/build/build-extendscript-host.ts` skips rebuilding while the stub marker is present
 * (override with `TY_PLUS_REBUILD_HOST=1`).
 */
// @ty-plus-host-stub

const installJsonPonyfill = () => {
	const root = $.global as unknown as {
		JSON?: {
			parse?: (text: string) => unknown;
			stringify?: (value: unknown) => string;
		};
	};
	if (!root.JSON) {
		root.JSON = {};
	}
	if (typeof root.JSON.parse !== "function") {
		const parseJson = (text: string): unknown => {
			const source = String(text);
			let index = 0;
			const fail = (): never => {
				throw new Error("Invalid JSON");
			};
			const skipWhitespace = (): void => {
				while (/\s/.test(source.charAt(index))) index += 1;
			};
			const parseString = (): string => {
				if (source.charAt(index) !== '"') fail();
				index += 1;
				let value = "";
				while (index < source.length) {
					const ch = source.charAt(index);
					index += 1;
					if (ch === '"') return value;
					if (ch !== "\\") {
						value += ch;
						continue;
					}
					const escaped = source.charAt(index);
					index += 1;
					if (escaped === "u") {
						const hex = source.substr(index, 4);
						if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
						value += String.fromCharCode(parseInt(hex, 16));
						index += 4;
						continue;
					}
					const escapes: Record<string, string> = {
						'"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t",
					};
					if (!Object.prototype.hasOwnProperty.call(escapes, escaped)) fail();
					value += escapes[escaped];
				}
				return fail();
			};
			const parseValue = (): unknown => {
				skipWhitespace();
				const ch = source.charAt(index);
				if (ch === '"') return parseString();
				if (ch === "[") {
					index += 1;
					const values: unknown[] = [];
					skipWhitespace();
					if (source.charAt(index) === "]") {
						index += 1;
						return values;
					}
					while (true) {
						values.push(parseValue());
						skipWhitespace();
						if (source.charAt(index) === "]") {
							index += 1;
							return values;
						}
						if (source.charAt(index) !== ",") fail();
						index += 1;
					}
				}
				if (ch === "{") {
					index += 1;
					const value: Record<string, unknown> = {};
					skipWhitespace();
					if (source.charAt(index) === "}") {
						index += 1;
						return value;
					}
					while (true) {
						skipWhitespace();
						const key = parseString();
						skipWhitespace();
						if (source.charAt(index) !== ":") fail();
						index += 1;
						value[key] = parseValue();
						skipWhitespace();
						if (source.charAt(index) === "}") {
							index += 1;
							return value;
						}
						if (source.charAt(index) !== ",") fail();
						index += 1;
					}
				}
				const remaining = source.slice(index);
				const literal = /^(true|false|null)/.exec(remaining);
				if (literal) {
					index += literal[0].length;
					return literal[0] === "true" ? true : literal[0] === "false" ? false : null;
				}
				const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remaining);
				if (!number) return fail();
				index += number[0].length;
				return Number(number[0]);
			};
			const value = parseValue();
			skipWhitespace();
			if (index !== source.length) fail();
			return value;
		};
		root.JSON.parse = parseJson;
	}
	if (typeof root.JSON.stringify !== "function") {
		const quote = (value: string) =>
			`"${String(value).replace(/[\\"\u0000-\u001f]/g, (ch) => {
				switch (ch) {
					case "\\":
						return "\\\\";
					case '"':
						return '\\"';
					case "\b":
						return "\\b";
					case "\f":
						return "\\f";
					case "\n":
						return "\\n";
					case "\r":
						return "\\r";
					case "\t":
						return "\\t";
					default: {
						const hex = ch.charCodeAt(0).toString(16);
						return `\\u${("0000" + hex).slice(-4)}`;
					}
				}
			})}"`;
		const stringifyValue = (value: unknown): string | undefined => {
			if (value === null) return "null";
			const kind = typeof value;
			if (kind === "string") return quote(value as string);
			if (kind === "number") return isFinite(value as number) ? String(value) : "null";
			if (kind === "boolean") return String(value);
			if (kind === "undefined" || kind === "function") return undefined;
			if (Object.prototype.toString.call(value) === "[object Array]") {
				const arr = value as unknown[];
				const parts: string[] = [];
				for (let i = 0; i < arr.length; i += 1) {
					const item = stringifyValue(arr[i]);
					parts.push(item === undefined ? "null" : item);
				}
				return `[${parts.join(",")}]`;
			}
			const obj = value as Record<string, unknown>;
			const pairs: string[] = [];
			for (const key in obj) {
				if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
				const item = stringifyValue(obj[key]);
				if (item !== undefined) {
					pairs.push(`${quote(key)}:${item}`);
				}
			}
			return `{${pairs.join(",")}}`;
		};
		root.JSON.stringify = (value: unknown) => stringifyValue(value) ?? "null";
	}
};

installJsonPonyfill();

const parseRawArgs = (rawArgs: string | undefined) => {
	const parsed = rawArgs ? JSON.parse(rawArgs) : [];
	return Object.prototype.toString.call(parsed) === "[object Array]"
		? parsed
		: [parsed];
};

const isArrayValue = (value: unknown): value is unknown[] =>
	Object.prototype.toString.call(value) === "[object Array]";

/**
 * Implementation revision of THIS file, exported on the resident global so
 * the CEP load coordinator can tell "same contract, different code" apart.
 *
 * MUST stay equal to `HOST_BUNDLE_VERSION` in
 * `src/management/ae/host/contract.ts`. This file is a standalone ES3
 * bundle and cannot import that module, so
 * `src/management/ae/cep/host-executor.test.ts` pins both declarations.
 *
 * Bump it whenever `host-bundle.ext.ts` changes runtime behaviour without
 * changing the exported contract (a host method fix, a helper change, a
 * replacement implementation). A contract change bumps
 * `HOST_BUNDLE_SCHEMA_VERSION` too. It is not the package version: an
 * unrelated packaging or UI bump must not force a host reload.
 */
const HOST_BUNDLE_VERSION = "workspace-preset-scriptui-panel-v4";

/**
 * Host API contract revision exported on the resident global so the CEP
 * caller can decide "reuse" vs "reload" without invoking a method.
 *
 * MUST stay equal to `HOST_BUNDLE_SCHEMA_VERSION` in
 * `src/management/ae/host/contract.ts`. This file is a standalone ES3
 * bundle and cannot import that module, so
 * `src/management/ae/cep/host-executor.test.ts` asserts the two
 * declarations match.
 */
const HOST_BUNDLE_SCHEMA_VERSION = 1;

/** ExtendScript (ES3) has no `String.prototype.trim`. */
const trimStr = (value: string): string => {
	if (!value) {
		return "";
	}
	return value.replace(/^\s+|\s+$/g, "");
};

const showExecutionFailureAlert = (message: string): void => {
	try {
		const userMessage = String(message)
			.replace(/^Error:\s*/, "")
			.replace(/\s+line=\S+.*$/, "");
		alert(`Ty Plus could not complete the action.\n\n${userMessage}`);
	} catch (_alertError) {
		// Some host states can reject modal UI; keep returning the structured error.
	}
};

const wrapCallable =
	(fn: (...args: any[]) => unknown) =>
	(rawArgs: string | undefined) => {
		try {
			return JSON.stringify({
				ok: true,
				hostId: "after-effects",
				value: fn.apply(null, parseRawArgs(rawArgs)),
			});
		} catch (error) {
			const message =
				String(error) +
				((error as { line?: unknown }).line
					? ` line=${String((error as { line?: unknown }).line)}`
					: "") +
				((error as { fileName?: unknown }).fileName
					? ` file=${String((error as { fileName?: unknown }).fileName)}`
					: "");
			showExecutionFailureAlert(message);
			return JSON.stringify({
				ok: false,
				error: {
					message,
					code: "AE_EVAL_FAILED",
				},
				alerted: true,
			});
		}
	};

const normalizedPathText = (filePath: string) =>
	String(filePath || "").replace(/\\/g, "/").toLowerCase();

/**
 * AE Support Files directory resolved self-contained inside ExtendScript.
 * Mirrors the CEP-side `buildReadAeAppRootViaExtendScript` rule so both
 * runtimes agree on the third allowed root. Returns "" when the host
 * does not expose `Folder.appPackage`, in which case nothing extra is
 * allowed (fail closed).
 */
const aeSupportFilesRoot = (): string => {
	try {
		const appPackage = Folder.appPackage as unknown as
			| {
					fsName?: unknown;
					parent?: { fsName?: unknown; name?: unknown; parent?: unknown };
			  }
			| undefined;
		if (
			!appPackage ||
			typeof appPackage.fsName !== "string" ||
			!appPackage.parent
		) {
			return "";
		}
		const osName = typeof $.os === "string" ? String($.os) : "";
		const base = appPackage.parent;
		if (/mac/i.test(osName)) {
			return normalizedPathText(String(base.fsName || ""));
		}
		let current:
			| { fsName?: unknown; name?: unknown; parent?: unknown }
			| undefined = base;
		let candidate = "";
		while (current) {
			const name = typeof current.name === "string" ? current.name : "";
			if (/support files/i.test(name)) {
				candidate = normalizedPathText(String(current.fsName || ""));
			}
			const parent = current.parent as
				| { fsName?: unknown; name?: unknown; parent?: unknown }
				| undefined;
			current =
				parent && typeof parent.fsName !== "undefined" ? parent : undefined;
		}
		if (candidate) {
			return candidate;
		}
		const baseFs = normalizedPathText(String(base.fsName || ""));
		return baseFs ? `${baseFs}/support files` : "";
	} catch (_supportRootError) {
		return "";
	}
};

/**
 * Base directory the operation worker resolves relative scan roots
 * against. On macOS `Folder.appPackage.fsName` is the `.app` bundle
 * itself, but plug-in folders (`Plug-ins`, `Support Files/Plug-ins`)
 * live next to it, so the parent is the correct root. Mirrors the
 * traversal `aeSupportFilesRoot` performs, without lowercasing the
 * path. Returns "" when the host exposes nothing usable.
 */
const aeWorkerAppRoot = (): string => {
	try {
		const appPackage = Folder.appPackage as unknown as
			| {
					fsName?: unknown;
					parent?: { fsName?: unknown; name?: unknown; parent?: unknown };
			  }
			| undefined;
		if (!appPackage || typeof appPackage.fsName !== "string") {
			return "";
		}
		const fallback = String(appPackage.fsName);
		const osName = typeof $.os === "string" ? String($.os) : "";
		if (/mac/i.test(osName)) {
			const parent = appPackage.parent;
			return parent && typeof parent.fsName === "string"
				? String(parent.fsName)
				: fallback;
		}
		let current = appPackage.parent as
			| { fsName?: unknown; name?: unknown; parent?: unknown }
			| undefined;
		let baseFs = "";
		while (current) {
			const name = typeof current.name === "string" ? current.name : "";
			if (
				/support files/i.test(name) &&
				typeof current.fsName === "string"
			) {
				return String(current.fsName);
			}
			if (!baseFs && typeof current.fsName === "string") {
				baseFs = String(current.fsName);
			}
			current = current.parent as typeof current;
		}
		if (baseFs) {
			return `${baseFs}/support files`;
		}
		return fallback;
	} catch (_appRootError) {
		return "";
	}
};

/**
 * Root classification for authoring targets.
 *
 * The vocabulary is deliberately identical to the roots
 * `assertAllowedFilePath` accepts. An authoring target outside them would
 * be writable but never executable (`runScriptFile` / `applyPresetFile`
 * refuse it), so there is no fourth "user-selected" class: read,
 * execute, and write accept exactly the same set.
 */
type SaveRootClass = "ae-support" | "user-data" | "extension";

/** `dir/` and `dir` must classify to the same root. */
const normalizedDirText = (dirPath: string): string => {
	const normalized = normalizedPathText(dirPath);
	const trimmed = normalized.replace(/\/+$/, "");
	return trimmed.length > 0 ? trimmed : normalized;
};

/**
 * Segment-boundary containment check. `root + "/"` (never `root` alone as
 * a raw prefix) keeps `.../Support Files Evil/...` outside the
 * `.../Support Files` root on Windows.
 */
const isUnderRoot = (resolved: string, root: string): boolean =>
	root !== "" && (resolved === root || resolved.indexOf(`${root}/`) === 0);

const isAbsoluteFsText = (resolved: string): boolean =>
	/^[a-z]:\//.test(resolved) || resolved.indexOf("/") === 0;

/**
 * Single root authority shared by read, execute, and write. Resolution is
 * self-contained inside ExtendScript; it never imports CEP persistence
 * resolvers. Returns `null` when the path sits outside every allowed root
 * (fail closed when the host exposes no Support Files root).
 */
const classifyAllowedRoot = (resolved: string): SaveRootClass | null => {
	const userRoot = normalizedDirText(Folder.userData.fsName);
	if (isUnderRoot(resolved, userRoot)) {
		return "user-data";
	}
	const extensionRoot = normalizedDirText(new File($.fileName).parent.fsName);
	if (isUnderRoot(resolved, extensionRoot)) {
		return "extension";
	}
	const supportRoot = normalizedDirText(aeSupportFilesRoot());
	if (isUnderRoot(resolved, supportRoot)) {
		return "ae-support";
	}
	return null;
};

const assertAllowedFilePath = (filePath: string): string => {
	const file = new File(filePath);
	const resolved = normalizedPathText(file.fsName || filePath);
	if (classifyAllowedRoot(resolved) === null) {
		throw new Error(`Path is outside allowed roots: ${filePath}`);
	}
	return file.fsName || filePath;
};

/**
 * Save-directory authorization for preset authoring (Issue #160).
 *
 * The canonical default is the running AE app / Support Files tree, so
 * `Folder.userData` is never the yardstick for whether a save may happen.
 * The accepted set is exactly `classifyAllowedRoot`'s — the same roots
 * read and execute use — because a target outside them would be written
 * and persisted only to fail execution with
 * `Path is outside allowed roots`. Path authorization and privilege
 * escalation remain separate decisions: which root matched says nothing
 * about whether a privileged write will be needed later.
 */
const authorizeSaveDir = (
	saveDir: string,
): { path: string; rootClass: SaveRootClass } => {
	const folder = new Folder(saveDir);
	const rawPath = String(folder.fsName || saveDir);
	const resolved = normalizedDirText(rawPath);
	if (!resolved || !isAbsoluteFsText(resolved)) {
		throw new Error(`Save directory is not an absolute path: ${saveDir}`);
	}
	const rootClass = classifyAllowedRoot(resolved);
	if (rootClass === null) {
		throw new Error(`Save directory is outside allowed roots: ${saveDir}`);
	}
	return { path: rawPath, rootClass };
};

const baseName = (filePath: string) => {
	const normalized = String(filePath || "").replace(/\\/g, "/");
	const name = normalized.split("/").pop() || normalized;
	return name.replace(/\.(jsxbin|jsx|js)$/i, "");
};

const runScriptUIPanelFile = (filePath: string): boolean => {
	if (normalizedPathText(filePath).indexOf("/scripts/scriptui panels/") < 0) {
		return false;
	}
	const stem = baseName(filePath);
	const candidates = [stem, `${stem}.jsxbin`, `${stem}.jsx`, `${stem}.js`];
	for (let i = 0; i < candidates.length; i += 1) {
		const commandId = app.findMenuCommandId(candidates[i]);
		if (commandId && commandId > 0) {
			app.executeCommand(commandId);
			return true;
		}
	}
	return false;
};

const runScriptFile = (filePath: string) => {
	const file = new File(assertAllowedFilePath(filePath));
	if (!file.exists) {
		throw new Error(`Script file not found: ${filePath}`);
	}
	if (runScriptUIPanelFile(file.fsName || filePath)) {
		return;
	}
	$.evalFile(file);
};

const applyPresetFile = (filePath: string) => {
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp)) {
		throw new Error("Open a composition before applying a preset");
	}
	const file = new File(assertAllowedFilePath(filePath));
	if (!file.exists) {
		throw new Error(`Preset file not found: ${filePath}`);
	}
	if (comp.selectedLayers.length === 0 && comp.numLayers < 1) {
		throw new Error(
			"Add a layer or select a layer before applying this preset in an empty composition",
		);
	}
	const targetLayer =
		comp.selectedLayers.length > 0 ? comp.selectedLayers[0] : comp.layer(1);
	app.beginUndoGroup("Ty Plus: Apply Preset");
	try {
		targetLayer.applyPreset(file);
	} finally {
		app.endUndoGroup();
	}
};

const sequenceStem = (name: string): string => {
	const m = /^(.*?)(\d+)\.png$/i.exec(String(name || ""));
	return m ? `${m[1]}#${m[2].length}` : "";
};

const firstPngSequenceFile = (folderPath: string): File | null => {
	const folder = new Folder(folderPath);
	if (!folder.exists) return null;
	const list = folder.getFiles();
	if (!list) return null;
	const buckets: Record<string, File[]> = {};
	for (let i = 0; i < list.length; i += 1) {
		const item = list[i] as unknown as File | Folder | null;
		if (!(item instanceof File)) continue;
		const stem = sequenceStem(String(item.name || ""));
		if (!stem) continue;
		if (!buckets[stem]) buckets[stem] = [];
		buckets[stem].push(item);
	}
	let best: File[] | null = null;
	for (const key in buckets) {
		if (!Object.prototype.hasOwnProperty.call(buckets, key)) continue;
		const rows = buckets[key];
		if (rows.length < 2) continue;
		if (!best || rows.length > best.length) best = rows;
	}
	if (!best) return null;
	best.sort((a, b) => {
		const an = String(a.name || "").toLowerCase();
		const bn = String(b.name || "").toLowerCase();
		if (an < bn) return -1;
		if (an > bn) return 1;
		return 0;
	});
	return best[0] || null;
};

const addFootageFile = (filePath: string) => {
	const sequenceFile = firstPngSequenceFile(assertAllowedFilePath(filePath));
	const file = sequenceFile || new File(filePath);
	if (!file.exists) {
		throw new Error(`Footage file not found: ${filePath}`);
	}
	app.beginUndoGroup("Ty Plus: Add Footage");
	try {
		const options = new ImportOptions(file);
		if (sequenceFile) {
			options.sequence = true;
			try {
				options.forceAlphabetical = true;
			} catch (_forceAlphabetical) {}
		}
		const imported = app.project.importFile(options);
		const comp = app.project.activeItem as unknown as {
			layers?: { add(item: unknown): unknown };
		};
		if (comp.layers) {
			comp.layers.add(imported);
		}
		return { name: imported.name };
	} finally {
		app.endUndoGroup();
	}
};

/**
 * Verify whether a preset asset file still exists on disk.
 *
 * Issue #130: preset records persisted with stale `filePath` values surface
 * as the AE alert `Script file not found` on execute. This helper lets the
 * React side ask the host "is this absolute path currently a real file?"
 * so we can:
 *   1. detect records whose asset was removed/moved at startup, and
 *   2. re-verify the just-written asset before committing the catalog /
 *      workspace record.
 *
 * Returns `{ exists, path }`. `path` is the canonical `File.fsName` form so
 * callers can compare against the recorded value. Never throws — missing
 * paths are not an error here, just a `exists: false` signal.
 */
const verifyPresetAsset = (filePath: string) => {
	const safePath = trimStr(String(filePath ?? ""));
	if (!safePath) {
		return { exists: false, path: "" };
	}
	const file = new File(safePath);
	const canonical = String(file.fsName || safePath);
	let exists = false;
	try {
		exists = Boolean(file.exists);
	} catch (_readError) {
		exists = false;
	}
	return { exists, path: canonical };
};

const safeName = (name: string): string => {
	const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
	return cleaned || `preset_${Date.now()}`;
};

const joinPath = (dir: string, fileName: string): string =>
	String(dir).replace(/\\/g, "/").replace(/\/+$/, "") + "/" + fileName;

/** Read `saveDir` from an authoring payload and authorize it once. */
const authorizePayloadSaveDir = (
	payload: Record<string, unknown>,
	fallbackName: string,
	fileNameSuffix: string,
): { targetPath: string; rootClass: SaveRootClass } => {
	const saveDir = trimStr(String(payload.saveDir ?? ""));
	if (!saveDir) {
		throw new Error("saveDir is required");
	}
	const authorized = authorizeSaveDir(saveDir);
	const fileName = `${safeName(
		String(payload.name ?? fallbackName),
	)}${fileNameSuffix}`;
	const joined = joinPath(authorized.path, fileName);
	const target = new File(joined);
	return {
		targetPath: String(target.fsName || joined),
		rootClass: authorized.rootClass,
	};
};

/**
 * Animation preset (`.ffx`) save-root authorization. After Effects owns
 * the actual file write through its native Save Animation Preset dialog,
 * so this helper only resolves and authorizes the target.
 */
const prepareAnimationPresetTarget = (payload: Record<string, unknown>) =>
	authorizePayloadSaveDir(payload, "AnimationPreset", ".ffx");

/**
 * Opens AE's native Save Animation Preset dialog. Authorization runs
 * again here so the dialog can never be opened for a path that was not
 * accepted by `authorizeSaveDir` in the first place. Directory creation
 * and post-save verification are CEP-side concerns.
 */
const openAnimationPresetSaveDialog = (payload: Record<string, unknown>) => {
	const target = prepareAnimationPresetTarget(payload);
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp) || comp.selectedLayers.length === 0) {
		throw new Error("Select at least one layer before saving an animation preset");
	}
	app.beginUndoGroup("Ty Plus: Save Animation Preset");
	try {
		comp.selectedLayers[0].selected = true;
		app.executeCommand(app.findMenuCommandId("Save Animation Preset..."));
		return {
			ok: true,
			presetPath: target.targetPath,
			rootClass: target.rootClass,
			manualSaveRequired: true,
			message:
				"After Effects opens the native Save Animation Preset dialog. Save to the shown path, then keep the registered preset.",
		};
	} finally {
		app.endUndoGroup();
	}
};

/**
 * Layer / Comp preset authoring preparation (Issue #160).
 *
 * ExtendScript owns only the AE-dependent parts: reading the saved
 * project path, generating the script content, and authorizing the
 * canonical target. The OS file write belongs to the CEP storage write
 * boundary so a permission failure can escalate to UAC instead of dying
 * as a dropped byte write.
 */
const prepareLayerCompPresetScript = (payload: Record<string, unknown>) => {
	const type = String(payload.type ?? "layer");
	const aepPath =
		app.project && app.project.file ? app.project.file.fsName : "";
	if (!aepPath) {
		throw new Error(
			"Save the After Effects project before creating this preset",
		);
	}
	const target = authorizePayloadSaveDir(
		payload,
		"LayerCompPreset",
		".jsx",
	);
	const script = [
		"// ty-plus: layer/comp preset",
		"(function(){",
		`  var projectPath = ${JSON.stringify(aepPath)};`,
		`  var presetType = ${JSON.stringify(type)};`,
		"  app.beginUndoGroup('Ty Plus: Apply Layer/Comp Preset');",
		"  try {",
		"    var importFile = new File(projectPath);",
		"    if (!importFile.exists) throw new Error('Source project not found: ' + projectPath);",
		"    app.open(importFile);",
		"  } finally {",
		"    app.endUndoGroup();",
		"  }",
		"})();",
		"",
	].join("\n");
	return { ...target, content: script };
};

/**
 * Code preset authoring preparation. The script body is authored in the
 * panel, so the host only resolves and authorizes the target path —
 * there is no AE-dependent content to generate and nothing to echo back.
 */
const prepareCodePresetScript = (payload: Record<string, unknown>) =>
	authorizePayloadSaveDir(payload, "CodePreset", ".jsx");

const prepareEasingPresetScript = (payload: Record<string, unknown>) => {
	const cubic = (payload.cubic as [number, number, number, number]) ?? [
		0.42, 0, 0.58, 1,
	];
	const rawPoints = payload.points as
		| [number, number, number, number, number, number][]
		| undefined;
	const pointsIsArray =
		rawPoints && Object.prototype.toString.call(rawPoints) === "[object Array]";
	const hasMulti = Boolean(pointsIsArray) && (rawPoints as unknown[]).length > 2;
	const pointsLiteral = hasMulti ? JSON.stringify(rawPoints) : "null";
	const labelColor = Number(payload.labelColor ?? 0) || 0;
	const target = authorizePayloadSaveDir(payload, "EasingPreset", ".jsx");
	const content = [
		"// ty-plus: easing preset",
		`// cubic: ${JSON.stringify(cubic)}`,
		`// points: ${pointsLiteral}`,
		`// labelColor: ${labelColor}`,
		"(function () {",
		"  var comp = app.project.activeItem;",
		"  if (!(comp instanceof CompItem)) { alert('Please select a composition.'); return; }",
		"  var props = comp.selectedProperties;",
		"  if (!props || props.length === 0) { alert('Please select at least one property to apply the easing.'); return; }",
		"  app.beginUndoGroup('ty-plus: apply easing preset');",
		`  var cubic = ${JSON.stringify(cubic)};`,
		`  var points = ${pointsLiteral};`,
		`  var labelColor = ${labelColor};`,
		"  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }",
		"  function lerpValue(a, b, t) {",
		"    if (isArray(a)) {",
		"      var out = [];",
		"      for (var i = 0; i < a.length; i++) { out.push(a[i] + (b[i] - a[i]) * t); }",
		"      return out;",
		"    }",
		"    return a + (b - a) * t;",
		"  }",
		"  function applyEasingToPair(p, k1, k2) {",
		"    p.setTemporalAutoBezierAtKey(k1, false);",
		"    p.setTemporalAutoBezierAtKey(k2, false);",
		"    p.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);",
		"    p.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);",
		"    var inEase1 = p.keyInTemporalEase(k1);",
		"    var outEase2 = p.keyOutTemporalEase(k2);",
		"    var dims = inEase1.length || outEase2.length || 1;",
		"    var outArr = [];",
		"    var inArr = [];",
		"    for (var d = 0; d < dims; d++) {",
		"      outArr.push(new KeyframeEase(0.5, 33));",
		"      inArr.push(new KeyframeEase(0.5, 33));",
		"    }",
		"    p.setTemporalEaseAtKey(k1, inEase1, outArr);",
		"    p.setTemporalEaseAtKey(k2, inArr, outEase2);",
		"    if (labelColor) {",
		"      p.setLabelAtKey(k1, labelColor);",
		"      p.setLabelAtKey(k2, labelColor);",
		"    }",
		"  }",
		"  function applyEasingMulti(p, k1, k2, pts) {",
		"    var t1 = Number(p.keyTime(k1));",
		"    var t2 = Number(p.keyTime(k2));",
		"    var dt = Math.max(0.000001, t2 - t1);",
		"    var v1 = p.keyValue(k1);",
		"    var v2 = p.keyValue(k2);",
		"    var created = [k1];",
		"    for (var i = 1; i < pts.length - 1; i++) {",
		"      var pnt = pts[i];",
		"      var newTime = t1 + pnt[0] * dt;",
		"      var newValue = lerpValue(v1, v2, pnt[1]);",
		"      var newKey = p.addKey(newTime);",
		"      p.setValueAtKey(newKey, newValue);",
		"      created.push(newKey);",
		"    }",
		"    created.push(k2);",
		"    if (labelColor) {",
		"      for (var i = 0; i < created.length; i++) { p.setLabelAtKey(created[i], labelColor); }",
		"    }",
		"    for (var i = 0; i < created.length - 1; i++) {",
		"      applyEasingToPair(p, created[i], created[i + 1]);",
		"    }",
		"  }",
		"  try {",
		"    var count = 0;",
		"    for (var i = 0; i < props.length; i++) {",
		"      var p = props[i];",
		"      var sel = p.selectedKeyframes;",
		"      if (sel.length >= 2) {",
		"        for (var j = 0; j < sel.length - 1; j++) {",
		"          var k1 = sel[j];",
		"          var k2 = sel[j + 1];",
		"          if (points && points.length > 2) {",
		"            applyEasingMulti(p, k1, k2, points);",
		"          } else {",
		"            applyEasingToPair(p, k1, k2);",
		"          }",
		"        }",
		"        count++;",
		"      }",
		"    }",
		"    if (count === 0) alert('Selected properties do not have enough keyframes.');",
		"  } catch (e) {",
		"    alert('Error applying easing: ' + e.toString());",
		"  } finally {",
		"    app.endUndoGroup();",
		"  }",
		"})();",
		"",
	].join("\n");
	return { ...target, content };
};

const setAnchorPoint = (payload: Record<string, unknown>) => {
	const position = String(payload.position ?? "center");
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp) || comp.selectedLayers.length === 0) {
		throw new Error("Select at least one layer before setting anchor point");
	}
	app.beginUndoGroup("Ty Plus: Set Anchor Point");
	try {
		let changed = 0;
		for (let i = 0; i < comp.selectedLayers.length; i += 1) {
			const layer = comp.selectedLayers[i] as unknown as {
				sourceRectAtTime?: (time: number, extents: boolean) => {
					left: number;
					top: number;
					width: number;
					height: number;
				};
				property?: (name: string) => {
					property?: (name: string) => { value: number[]; setValue: (value: number[]) => void };
				};
			};
			const rect = layer.sourceRectAtTime
				? layer.sourceRectAtTime(comp.time, false)
				: { left: 0, top: 0, width: 0, height: 0 };
			const transform = layer.property ? layer.property("ADBE Transform Group") : null;
			const anchorProp = transform?.property
				? transform.property("ADBE Anchor Point")
				: null;
			if (!anchorProp) continue;
			let x = rect.left + rect.width / 2;
			let y = rect.top + rect.height / 2;
			if (position.indexOf("left") >= 0) x = rect.left;
			if (position.indexOf("right") >= 0) x = rect.left + rect.width;
			if (position.indexOf("top") >= 0) y = rect.top;
			if (position.indexOf("bottom") >= 0) y = rect.top + rect.height;
			const current = anchorProp.value;
			anchorProp.setValue(current.length === 3 ? [x, y, current[2]] : [x, y]);
			changed += 1;
		}
		return { changed };
	} finally {
		app.endUndoGroup();
	}
};


const getFontBrowserEntries = () => {
	/**
	 * `app.fonts.allFonts` is an array of *family groups*, each group being an array of
	 * {@link https://ae-scripting.docsforadobe.dev/text/fontsobject/ Font} objects (AE 24+).
	 * A flat `for` over the outer array yields inner arrays — no `postScriptName` → empty list.
	 */
	const toArray = (value: unknown): unknown[] => {
		if (!value) {
			return [];
		}
		if (Object.prototype.toString.call(value) === "[object Array]") {
			return value as unknown[];
		}
		const maybeList = value as { length?: unknown };
		if (typeof maybeList.length === "number" && maybeList.length >= 0) {
			const items: unknown[] = [];
			let index = 0;
			for (index = 0; index < maybeList.length; index += 1) {
				items.push((value as Record<number, unknown>)[index]);
			}
			return items;
		}
		return [];
	};

	const aeApp = app as unknown as {
		fonts?: {
			allFonts?: unknown;
		};
	};
	const allFontsRaw =
		aeApp.fonts && aeApp.fonts.allFonts ? aeApp.fonts.allFonts : null;
	if (!allFontsRaw) {
		return [];
	}

	const seen: Record<string, boolean> = {};
	const entries: {
		postScriptName: string;
		family: string;
		label: string;
		styleName?: string;
	}[] = [];

	const appendFont = (item: unknown): void => {
		if (!item || typeof item !== "object") {
			return;
		}
		const font = item as {
			postScriptName?: unknown;
			familyName?: unknown;
			nativeFamilyName?: unknown;
			fullName?: unknown;
			styleName?: unknown;
		};
		const postScriptName =
			typeof font.postScriptName === "string"
				? trimStr(font.postScriptName)
				: "";
		if (!postScriptName || seen[postScriptName]) {
			return;
		}
		seen[postScriptName] = true;
		const familyName =
			typeof font.familyName === "string" ? trimStr(font.familyName) : "";
		const nativeFamilyName =
			typeof font.nativeFamilyName === "string"
				? trimStr(font.nativeFamilyName)
				: "";
		const fullName =
			typeof font.fullName === "string" ? trimStr(font.fullName) : "";
		const family = familyName || nativeFamilyName || fullName || postScriptName;
		const style =
			typeof font.styleName === "string" ? trimStr(font.styleName) : "";
		const label = style ? `${family} ${style}` : family;
		const row: {
			postScriptName: string;
			family: string;
			label: string;
			styleName?: string;
		} = { postScriptName, family, label };
		if (style) {
			row.styleName = style;
		}
		entries.push(row);
	};

	const outer = toArray(allFontsRaw);
	let i = 0;
	for (i = 0; i < outer.length; i += 1) {
		const item = outer[i];
		const nested = toArray(item);
		let j = 0;
		if (nested.length > 0) {
			for (j = 0; j < nested.length; j += 1) {
				appendFont(nested[j]);
			}
			continue;
		}
		appendFont(item);
	}
	return entries;
};

const writeSelectedTextLayers = (payload: Record<string, unknown>) => {
	const font = String(payload.font ?? "");
	if (!font) throw new Error("font is required");
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp)) {
		throw new Error("Select text layers in an active composition");
	}
	let updated = 0;
	app.beginUndoGroup("Ty Plus: Apply Font");
	try {
		for (let i = 0; i < comp.selectedLayers.length; i += 1) {
			const layer = comp.selectedLayers[i] as unknown as { property?: (name: string) => unknown };
			const textProp = layer.property ? layer.property("ADBE Text Properties") as { property?: (name: string) => { value: unknown; setValue: (value: unknown) => void } } : null;
			const sourceText = textProp?.property ? textProp.property("ADBE Text Document") : null;
			if (!sourceText) continue;
			const doc = sourceText.value as { font?: string };
			doc.font = font;
			sourceText.setValue(doc);
			updated += 1;
		}
		return { updated };
	} finally {
		app.endUndoGroup();
	}
};

const readSelectedTextLayers = () => {
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp)) return [];
	const out = [];
	for (let i = 0; i < comp.selectedLayers.length; i += 1) {
		const layer = comp.selectedLayers[i] as unknown as { name?: string; property?: (name: string) => unknown };
		const textProp = layer.property ? layer.property("ADBE Text Properties") as { property?: (name: string) => { value: unknown } } : null;
		const sourceText = textProp?.property ? textProp.property("ADBE Text Document") : null;
		if (!sourceText) continue;
		const doc = sourceText.value as { font?: string };
		out.push({ layerName: String(layer.name ?? ""), font: String(doc.font ?? "") });
	}
	return out;
};

const AEX_NOISE_MATCH: Record<string, number> = {
	"ADBE Effect Parade": 1,
	"ADBE Transform Group": 1,
	"ADBE Mask Parade": 1,
	"ADBE Masks": 1,
	"ADBE Root Vectors Group": 1,
	"ADBE Material Options": 1,
	"ADBE Layer Styles": 1,
	"ADBE Layer Sets": 1,
	"ADBE Essential Properties": 1,
	"ADBE Timeline Pin": 1,
	"ADBE Audio Group": 1,
	"ADBE Audio": 1,
	"ADBE Project": 1,
};

const scanAexMatchNames = (filePath: string): string[] => {
	const f = new File(filePath);
	if (!f.exists) return [];
	f.encoding = "BINARY";
	if (!f.open("r")) return [];
	const maxBytes = 3145728;
	const size = typeof f.length === "number" && f.length > 0 ? f.length : maxBytes;
	const toRead = Math.min(size, maxBytes);
	const raw = f.read(toRead);
	f.close();
	if (!raw || raw.length < 8) return [];
	const seen: Record<string, number> = {};
	const out: string[] = [];
	for (let i = 0; i < raw.length - 4; i += 1) {
		if (raw.charCodeAt(i) !== 65) continue;
		if (raw.charCodeAt(i + 1) !== 68) continue;
		if (raw.charCodeAt(i + 2) !== 66) continue;
		if (raw.charCodeAt(i + 3) !== 69) continue;
		let j = i + 4;
		while (j < raw.length) {
			const ch = raw.charCodeAt(j);
			if (ch < 32 || ch > 126) break;
			j += 1;
		}
		if (j - i < 8) continue;
		const t = raw.substring(i, j);
		if (seen[t]) continue;
		if (AEX_NOISE_MATCH[t]) continue;
		if (t.indexOf("ADBEComp") === 0 && t.length < 16) continue;
		seen[t] = 1;
		out.push(t);
	}
	for (let a = 0; a < raw.length - 8; a += 1) {
		const c0 = raw.charCodeAt(a);
		if (c0 < 97 || c0 > 122) continue;
		let b = a;
		while (b < raw.length) {
			const ch2 = raw.charCodeAt(b);
			if (
				(ch2 >= 65 && ch2 <= 90) ||
				(ch2 >= 97 && ch2 <= 122) ||
				(ch2 >= 48 && ch2 <= 57) ||
				ch2 === 95 ||
				ch2 === 46
			) {
				b += 1;
				continue;
			}
			break;
		}
		if (b - a < 8 || b - a > 96) continue;
		const t2 = raw.substring(a, b);
		if (t2.indexOf(".") < 1) continue;
		if (t2.indexOf("com.") !== 0 && t2.indexOf("io.") !== 0 && t2.indexOf("net.") !== 0)
			continue;
		if (seen[t2]) continue;
		seen[t2] = 1;
		out.push(t2);
	}
	return out;
};

const collectAexPaths = (
	folder: Folder,
	depth: number,
	maxDepth: number,
	acc: string[],
	limit: number,
): void => {
	if (!folder || !folder.exists || depth > maxDepth || acc.length >= limit) return;
	if (/\.plugin$/i.test(String(folder.name || ""))) {
		collectPluginBundleBinaryPaths(folder, acc, limit);
		return;
	}
	const list = folder.getFiles();
	if (!list) return;
	for (let i = 0; i < list.length; i += 1) {
		const item = list[i] as unknown as File | Folder | null;
		if (!item) continue;
		if (item instanceof Folder) {
			collectAexPaths(item, depth + 1, maxDepth, acc, limit);
		} else if (item instanceof File) {
			const nm = item.name || "";
			if (/\.aex$/i.test(nm)) {
				const fp = String(item.fsName || item.fullName || "");
				if (fp) acc.push(fp);
			}
		}
		if (acc.length >= limit) return;
	}
};

const collectPluginBundleBinaryPaths = (
	bundle: Folder,
	acc: string[],
	limit: number,
): void => {
	if (!bundle || !bundle.exists || acc.length >= limit) return;
	const roots = [
		new Folder(String(bundle.fsName || bundle.fullName || "") + "/Contents/MacOS"),
		new Folder(String(bundle.fsName || bundle.fullName || "") + "/Contents/PlugIns"),
	];
	for (let r = 0; r < roots.length; r += 1) {
		collectPluginBundleFiles(roots[r], 0, acc, limit);
		if (acc.length >= limit) return;
	}
};

const collectPluginBundleFiles = (
	folder: Folder,
	depth: number,
	acc: string[],
	limit: number,
): void => {
	if (!folder || !folder.exists || depth > 4 || acc.length >= limit) return;
	const list = folder.getFiles();
	if (!list) return;
	for (let i = 0; i < list.length; i += 1) {
		const item = list[i] as unknown as File | Folder | null;
		if (!item) continue;
		if (item instanceof Folder) {
			collectPluginBundleFiles(item, depth + 1, acc, limit);
			continue;
		}
		if (item instanceof File) {
			const name = String(item.name || "");
			if (/\.(plist|strings|txt|json|xml|png|jpg|jpeg|icns)$/i.test(name)) {
				continue;
			}
			const fp = String(item.fsName || item.fullName || "");
			if (fp) acc.push(fp);
		}
		if (acc.length >= limit) return;
	}
};

const buildPluginEffectScanRows = (
	roots: unknown,
): { rows: { filePath: string; matchName: string; displayName: string }[] } => {
	if (!roots || !isArrayValue(roots)) {
		return { rows: [] };
	}
	const paths: string[] = [];
	for (let r = 0; r < roots.length; r += 1) {
		const p = trimStr(String((roots as unknown[])[r] ?? ""));
		if (!p) continue;
		// If the path points directly to a .aex or .plugin file, scan it as-is.
		// Otherwise treat it as a directory root and collect .aex paths recursively.
		if (/\.(aex|plugin)$/i.test(p)) {
			const f = new File(p);
			if (f.exists) {
				paths.push(p);
			}
		} else {
			collectAexPaths(new Folder(p), 0, 10, paths, 600);
		}
	}
	const rows: { filePath: string; matchName: string; displayName: string }[] = [];
	for (let j = 0; j < paths.length; j += 1) {
		const fp = paths[j];
		const names = scanAexMatchNames(fp);
		for (let k = 0; k < names.length; k += 1) {
			const mn = names[k];
			rows.push({ filePath: fp, matchName: mn, displayName: mn });
		}
	}
	return { rows };
};

const applyEffectByMatchName = (matchName: string) => {
	const m = trimStr(String(matchName || ""));
	if (!m) throw new Error("matchName is required");
	const installedEffects = getInstalledEffects().rows;
	let isInstalled = false;
	for (let i = 0; i < installedEffects.length; i += 1) {
		if (installedEffects[i].matchName === m) {
			isInstalled = true;
			break;
		}
	}
	if (!isInstalled) throw new Error(`Effect is not installed: ${m}`);
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp) || comp.selectedLayers.length === 0) {
		throw new Error("Select at least one layer before applying an effect");
	}
	let applied = 0;
	app.beginUndoGroup("Ty Plus: Apply effect");
	try {
		for (let i = 0; i < comp.selectedLayers.length; i += 1) {
			const layer = comp.selectedLayers[i] as unknown as {
				property?: (name: string) => { addProperty?: (name: string) => unknown } | null;
			};
			const parade = layer.property ? layer.property("ADBE Effect Parade") : null;
			if (!parade || typeof parade.addProperty !== "function") continue;
			parade.addProperty(m);
			applied += 1;
		}
		return { applied };
	} finally {
		app.endUndoGroup();
	}
};

/**
 * Returns all effects installed in After Effects via `app.effects`.
 * Restored from archive/management-ae-jsx-aeft/assets/effects-catalog.ts.
 * Used by plugin preset operation to reliably resolve match names without
 * relying on fragile binary (.aex) scanning.
 */
const getInstalledEffects = (): {
	rows: { displayName: string; matchName: string; category: string }[];
} => {
	const rows: { displayName: string; matchName: string; category: string }[] = [];
	const effectsRoot = (
		app as unknown as {
			effects?: { length?: number; [key: number]: unknown };
		}
	).effects;
	if (!effectsRoot || !effectsRoot.length) {
		return { rows };
	}
	for (let idx = 1; idx <= (effectsRoot.length as number); idx += 1) {
		const effect = effectsRoot[idx] as
			| { displayName?: string; matchName?: string; category?: string }
			| undefined;
		if (!effect || (!effect.displayName && !effect.matchName)) continue;
		const matchName = trimStr(String(effect.matchName || ""));
		if (!matchName) continue;
		rows.push({
			displayName: trimStr(String(effect.displayName || matchName)),
			matchName,
			category: trimStr(String(effect.category || "")),
		});
	}
	return { rows };
};

const getSelectionCount = () => {
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp)) {
		return { count: 0 };
	}
	const selectedLayers = (comp as unknown as { selectedLayers?: unknown[] })
		.selectedLayers;
	return { count: selectedLayers ? selectedLayers.length : 0 };
};

const alignLayers = (input: { action?: string; target?: string }) => {
	const action = trimStr(String(input.action || ""));
	const target = trimStr(String(input.target || "selection"));
	if (!action) {
		throw new Error("align action is required");
	}
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedLayers" in comp)) {
		throw new Error("Select at least one layer in an active composition");
	}
	const selected = comp.selectedLayers;
	if (!selected || selected.length < 1) {
		throw new Error("Select at least one layer before aligning");
	}

	const getLayerBounds = (layer: any, time: number) => {
		const rect = layer.sourceRectAtTime(time, false);
		if (typeof layer.toComp === "function") {
			const p1 = layer.toComp([rect.left, rect.top, 0]);
			const p2 = layer.toComp([rect.left + rect.width, rect.top, 0]);
			const p3 = layer.toComp([rect.left, rect.top + rect.height, 0]);
			const p4 = layer.toComp([
				rect.left + rect.width,
				rect.top + rect.height,
				0,
			]);
			const pts = [p1, p2, p3, p4];
			let minX = 1e12;
			let minY = 1e12;
			let maxX = -1e12;
			let maxY = -1e12;
			for (let i = 0; i < pts.length; i += 1) {
				if (pts[i][0] < minX) minX = pts[i][0];
				if (pts[i][1] < minY) minY = pts[i][1];
				if (pts[i][0] > maxX) maxX = pts[i][0];
				if (pts[i][1] > maxY) maxY = pts[i][1];
			}
			return {
				left: minX,
				top: minY,
				right: maxX,
				bottom: maxY,
				centerX: (minX + maxX) / 2,
				centerY: (minY + maxY) / 2,
			};
		}
		const transform = layer.property("ADBE Transform Group");
		const position = transform ? transform.property("ADBE Position").value : [0, 0];
		const anchor = transform ? transform.property("ADBE Anchor Point").value : [0, 0];
		const scale = transform ? transform.property("ADBE Scale").value : [100, 100];
		const scaleX = scale[0] / 100;
		const scaleY = scale[1] / 100;
		const width = rect.width * scaleX;
		const height = rect.height * scaleY;
		const left = position[0] + (rect.left - anchor[0]) * scaleX;
		const top = position[1] + (rect.top - anchor[1]) * scaleY;
		return {
			left,
			top,
			right: left + width,
			bottom: top + height,
			centerX: left + width / 2,
			centerY: top + height / 2,
		};
	};

	const applyDelta = (layer: any, dx: number, dy: number): void => {
		const transform = layer.property("ADBE Transform Group");
		if (!transform) return;
		const pos = transform.property("ADBE Position");
		if (!pos) return;
		const value = pos.value;
		let dpX = dx;
		let dpY = dy;
		try {
			const currentPosComp = layer.toComp(value);
			const targetPosLocal = layer.fromComp([
				currentPosComp[0] + dx,
				currentPosComp[1] + dy,
			]);
			dpX = targetPosLocal[0] - value[0];
			dpY = targetPosLocal[1] - value[1];
		} catch (_error) {}
		const next =
			value.length === 3
				? [value[0] + dpX, value[1] + dpY, value[2]]
				: [value[0] + dpX, value[1] + dpY];
		if (pos.numKeys > 0 && layer.containingComp) {
			pos.setValueAtTime(layer.containingComp.time, next);
			return;
		}
		pos.setValue(next);
	};

	const makeIndexed = (bounds: unknown[]) => {
		const out: { idx: number; b: any }[] = [];
		for (let i = 0; i < bounds.length; i += 1) out.push({ idx: i, b: bounds[i] });
		return out;
	};

	const bounds: any[] = [];
	let minLeft = 1e12;
	let maxRight = -1e12;
	let minTop = 1e12;
	let maxBottom = -1e12;
	for (let i = 0; i < selected.length; i += 1) {
		const b = getLayerBounds(selected[i], comp.time);
		bounds.push(b);
		if (b.left < minLeft) minLeft = b.left;
		if (b.right > maxRight) maxRight = b.right;
		if (b.top < minTop) minTop = b.top;
		if (b.bottom > maxBottom) maxBottom = b.bottom;
	}

	if (target === "comp") {
		minLeft = 0;
		maxRight = comp.width;
		minTop = 0;
		maxBottom = comp.height;
	}

	const centerX = (minLeft + maxRight) / 2;
	const centerY = (minTop + maxBottom) / 2;

	app.beginUndoGroup("Ty Plus: Align Layers");
	try {
		if (action === "distribute-h" || action === "distribute-v") {
			const distribute = makeIndexed(bounds);
			if (distribute.length <= 2) return { changed: 0 };
			if (action === "distribute-h") {
				distribute.sort((a, b) => a.b.centerX - b.b.centerX);
				const start = distribute[0].b.centerX;
				const end = distribute[distribute.length - 1].b.centerX;
				const step = (end - start) / (distribute.length - 1);
				for (let i = 0; i < distribute.length; i += 1) {
					applyDelta(
						selected[distribute[i].idx],
						start + step * i - distribute[i].b.centerX,
						0,
					);
				}
			} else {
				distribute.sort((a, b) => a.b.centerY - b.b.centerY);
				const start = distribute[0].b.centerY;
				const end = distribute[distribute.length - 1].b.centerY;
				const step = (end - start) / (distribute.length - 1);
				for (let i = 0; i < distribute.length; i += 1) {
					applyDelta(
						selected[distribute[i].idx],
						0,
						start + step * i - distribute[i].b.centerY,
					);
				}
			}
			return { changed: distribute.length };
		}

		let changed = 0;
		for (let i = 0; i < selected.length; i += 1) {
			const current = bounds[i];
			if (action === "align-left") {
				applyDelta(selected[i], minLeft - current.left, 0);
			} else if (action === "align-right") {
				applyDelta(selected[i], maxRight - current.right, 0);
			} else if (action === "align-center-h") {
				applyDelta(selected[i], centerX - current.centerX, 0);
			} else if (action === "align-top") {
				applyDelta(selected[i], 0, minTop - current.top);
			} else if (action === "align-bottom") {
				applyDelta(selected[i], 0, maxBottom - current.bottom);
			} else if (action === "align-center-v") {
				applyDelta(selected[i], 0, centerY - current.centerY);
			} else {
				throw new Error(`Unsupported align action: ${action}`);
			}
			changed += 1;
		}
		return { changed };
	} finally {
		app.endUndoGroup();
	}
};

const clampEasingNumber = (value: unknown, fallback: number): number => {
	const n = Number(value);
	if (!isFinite(n)) return fallback;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
};

const easingAverageSlope = (
	axisA: number,
	valueA: number,
	axisB: number,
	valueB: number,
	fallback: number,
): number => {
	const dx = axisB - axisA;
	if (Math.abs(dx) < 0.000001) return fallback;
	return (valueB - valueA) / dx;
};

const easingInfluence = (axisA: number, axisB: number): number => {
	const amount = Math.abs(axisB - axisA) * 100;
	if (amount < 0.1) return 0.1;
	if (amount > 100) return 100;
	return amount;
};

const selectedKeyframePairs = (prop: any): number[][] => {
	const out: number[][] = [];
	if (!prop || !prop.numKeys || prop.numKeys < 2) return out;
	const selected: number[] = [];
	try {
		const raw = prop.selectedKeys;
		if (raw && raw.length) {
			for (let i = 0; i < raw.length; i += 1) selected.push(Number(raw[i]));
		}
	} catch (_error) {}
	if (selected.length >= 2) {
		selected.sort((a, b) => a - b);
		for (let j = 0; j < selected.length - 1; j += 1) {
			out.push([selected[j], selected[j + 1]]);
		}
		return out;
	}
	for (let k = 1; k < prop.numKeys; k += 1) out.push([k, k + 1]);
	return out;
};

const collectSelectedAnimatedProperties = (): any[] => {
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedProperties" in comp)) {
		throw new Error("Select keyframes in an active composition");
	}
	const props = (comp as unknown as { selectedProperties?: unknown[] })
		.selectedProperties;
	if (!props || props.length === 0) {
		throw new Error("Select at least one animated property");
	}
	const out: any[] = [];
	for (let i = 0; i < props.length; i += 1) {
		const prop = props[i] as any;
		if (prop && prop.numKeys && prop.numKeys >= 2) out.push(prop);
	}
	if (out.length === 0) {
		throw new Error("Select at least two keyframes on an animated property");
	}
	return out;
};

const easingPropertyFollowers = (prop: any): any[] => {
	try {
		if (prop && prop.canSeparateDimensions && !prop.dimensionsSeparated) {
			prop.dimensionsSeparated = true;
		}
	} catch (_separate) {}
	try {
		if (prop && prop.dimensionsSeparated && prop.getSeparationFollower) {
			const value = prop.value;
			const dims = isArrayValue(value) ? value.length : 0;
			const out: any[] = [];
			for (let i = 0; i < dims; i += 1) {
				const follower = prop.getSeparationFollower(i);
				if (follower && follower.numKeys && follower.numKeys >= 2) {
					out.push(follower);
				}
			}
			if (out.length > 0) return out;
		}
	} catch (_followers) {}
	return [prop];
};

const collectEasingTargetProperties = (): any[] => {
	const props = collectSelectedAnimatedProperties();
	const out: any[] = [];
	for (let i = 0; i < props.length; i += 1) {
		const followers = easingPropertyFollowers(props[i]);
		for (let j = 0; j < followers.length; j += 1) out.push(followers[j]);
	}
	return out;
};

const getEasingSelectionCount = () => {
	const comp = app.project && app.project.activeItem;
	if (!comp || !("selectedProperties" in comp)) return { pairs: 0 };
	const props = (comp as unknown as { selectedProperties?: unknown[] })
		.selectedProperties;
	if (!props || props.length === 0) return { pairs: 0 };
	let pairs = 0;
	for (let i = 0; i < props.length; i += 1) {
		const prop = props[i] as any;
		if (!prop || !prop.numKeys || prop.numKeys < 2) continue;
		let selectedKeys: number[] = [];
		try {
			const raw = prop.selectedKeys;
			if (raw && raw.length) {
				for (let k = 0; k < raw.length; k += 1) {
					selectedKeys.push(Number(raw[k]));
				}
			}
		} catch (_e) {
			selectedKeys = [];
		}
		if (selectedKeys.length >= 2) {
			selectedKeys.sort((a, b) => a - b);
			pairs += selectedKeys.length - 1;
		} else {
			pairs += Math.max(0, prop.numKeys - 1);
		}
	}
	return { pairs };
};

const easingValueDim = (value: unknown, dim: number): number => {
	if (typeof value === "number") return value;
	if (isArrayValue(value)) {
		const raw = value[dim] !== undefined ? value[dim] : value[0];
		const n = Number(raw);
		return isFinite(n) ? n : 0;
	}
	return 0;
};

const easingValueDims = (value: unknown): number =>
	isArrayValue(value) ? Math.max(1, value.length) : 1;

const easingInterpolateValue = (
	start: unknown,
	end: unknown,
	t: number,
): unknown => {
	if (!isArrayValue(start) && !isArrayValue(end)) {
		return easingValueDim(start, 0) + (easingValueDim(end, 0) - easingValueDim(start, 0)) * t;
	}
	const dims = Math.max(easingValueDims(start), easingValueDims(end));
	const out = [];
	for (let i = 0; i < dims; i += 1) {
		const a = easingValueDim(start, i);
		out.push(a + (easingValueDim(end, i) - a) * t);
	}
	return out;
};

const clampEasingSpeed = (value: number): number => {
	if (!isFinite(value)) return 0;
	if (value > 1000000) return 1000000;
	if (value < -1000000) return -1000000;
	return value;
};

const safeEasingSlope = (dy: number, dx: number): number => {
	if (!isFinite(dy) || !isFinite(dx)) return 1;
	if (Math.abs(dx) < 0.000001) return dy >= 0 ? 100000 : -100000;
	return dy / dx;
};

const easingLabelColor = (value: unknown): number => {
	const n = Number(value);
	if (!isFinite(n)) return 9;
	if (n < 0) return -1;
	if (n > 16) return 16;
	return Math.round(n);
};

const setEasingLabelAtKey = (prop: any, key: number, labelColor: number): void => {
	if (labelColor < 0) return;
	try { prop.setLabelAtKey(key, labelColor); } catch (_label) {}
};

// Read AE's user-defined label color names (Edit > Preferences > Labels) so
// the easing right-click menu can render AE's actual labels instead of
// hardcoded English defaults. Section/key shape varies across AE versions
// (CC 2018 used `Label Color - 1`; 2022+ uses `Label Color 1`; older builds
// used `Label_Color_1`), so try each known shape in order and fall through
// when the preference is missing.
const readLabelColorNames = (): { names: Record<string, string> } => {
	const names: Record<string, string> = {};
	const appPrefs = (app as unknown as {
		preferences?: {
			getPrefAsString: (
				section: string,
				key: string,
				type: number,
			) => string;
		};
	}).preferences;
	if (!appPrefs || typeof appPrefs.getPrefAsString !== "function") {
		return { names };
	}
	const keyShapeFor = (i: number): string[] => [
		`Label Color - ${i}`,
		`Label Color ${i}`,
		`Label_Color_${i}`,
		`LabelColor${i}`,
	];
	const section = "Main Pref Section";
	for (let i = 1; i <= 16; i += 1) {
		const shapes = keyShapeFor(i);
		let resolved = "";
		for (let s = 0; s < shapes.length; s += 1) {
			const key = shapes[s];
			try {
				const value = appPrefs.getPrefAsString(
					section,
					key,
					PREFType.PREF_Type_MACHINE_INDEPENDENT,
				);
				if (typeof value === "string" && trimStr(value)) {
					resolved = trimStr(value);
					break;
				}
			} catch (_pref) {
				// Ignore individual read failures and try the next shape.
			}
		}
		if (resolved) {
			names[String(i)] = resolved;
		}
	}
	return { names };
};

const coerceEasingPoints = (value: unknown): number[][] => {
	if (!isArrayValue(value)) return [];
	const out: number[][] = [];
	for (let i = 0; i < value.length; i += 1) {
		const row = value[i] as unknown;
		if (isArrayValue(row)) {
			const nums = [];
			for (let j = 0; j < 6; j += 1) nums.push(Number(row[j] ?? 0));
			if (isFinite(nums[0]) && isFinite(nums[1])) out.push(nums);
			continue;
		}
		if (row && typeof row === "object") {
			const item = row as {
				x?: unknown;
				y?: unknown;
				hIn?: { x?: unknown; y?: unknown };
				hOut?: { x?: unknown; y?: unknown };
			};
			const x = Number(item.x);
			const y = Number(item.y);
			if (!isFinite(x) || !isFinite(y)) continue;
			out.push([
				x,
				y,
				Number(item.hIn?.x ?? 0),
				Number(item.hIn?.y ?? 0),
				Number(item.hOut?.x ?? 0),
				Number(item.hOut?.y ?? 0),
			]);
		}
	}
	out.sort((a, b) => a[0] - b[0]);
	return out.length >= 2 ? out : [];
};

// Map detected easing type to AE KeyframeInterpolationType for the outer
// (k1, k2) pair so the keyframe row reflects the curve shape (linear/hold/
// easeIn/easeOut) instead of always rendering as BEZIER.
// KeyframeInterpolationType: LINEAR=6612, BEZIER=6613, HOLD=6614
const applyInterpolationTypeForKeyPair = (
	prop: Property,
	k1: number,
	k2: number,
	detectedType: string,
): void => {
	try {
		if (detectedType === "linear") {
			prop.setInterpolationTypeAtKey(
				k1,
				KeyframeInterpolationType.LINEAR,
				KeyframeInterpolationType.LINEAR,
			);
			prop.setInterpolationTypeAtKey(
				k2,
				KeyframeInterpolationType.LINEAR,
				KeyframeInterpolationType.LINEAR,
			);
		} else if (detectedType === "hold") {
			prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.HOLD);
		} else if (detectedType === "easeIn") {
			prop.setInterpolationTypeAtKey(
				k1,
				KeyframeInterpolationType.LINEAR,
				KeyframeInterpolationType.BEZIER,
			);
		} else if (detectedType === "easeOut") {
			prop.setInterpolationTypeAtKey(
				k2,
				KeyframeInterpolationType.BEZIER,
				KeyframeInterpolationType.LINEAR,
			);
		}
		// For bezier and easeInOut, keep the default BEZIER interpolation.
	} catch (_e) {}
};

const applyEasing = (payload: Record<string, unknown>) => {
	const rawCubic = isArrayValue(payload.cubic) ? payload.cubic : [];
	const x1 = clampEasingNumber(rawCubic[0], 0.16);
	const y1 = clampEasingNumber(rawCubic[1], 1);
	const x2 = clampEasingNumber(rawCubic[2], 0.3);
	const y2 = clampEasingNumber(rawCubic[3], 1);
	const mode = String(payload.applyMode ?? "pair") === "single" ? "single" : "pair";
	const points = coerceEasingPoints(payload.points);
	const labelColor = easingLabelColor(payload.labelColor ?? 9);
	const detectedType = String(payload.detectedType ?? "bezier");
	const targeting =
		payload.targeting === "in" || payload.targeting === "out"
			? payload.targeting
			: "both";
	const props = collectEasingTargetProperties();
	const outInfluence = easingInfluence(0, x1);
	const inInfluence = easingInfluence(x2, 1);
	const outSlope = safeEasingSlope(y1, x1);
	const inSlope = safeEasingSlope(1 - y2, 1 - x2);
	let changed = 0;
	// Per-step errors from the multi-point path. Bare catches below push
	// here so the React side can surface the actual ExtendScript error
	// message instead of the apply silently no-opping. Always returned
	// (empty array on success) so callers can rely on the shape.
	const errors: string[] = [];
	app.beginUndoGroup("Ty Plus: Apply Easing");
	try {
		for (let p = 0; p < props.length; p += 1) {
			const prop = props[p];
			const selectedPairs = selectedKeyframePairs(prop);
			const tasks: { k1: number; k2: number; remove: number[] }[] = [];
			if (mode === "single" && selectedPairs.length > 0) {
				const keys = [selectedPairs[0][0]];
				for (let i = 0; i < selectedPairs.length; i += 1) keys.push(selectedPairs[i][1]);
				tasks.push({ k1: keys[0], k2: keys[keys.length - 1], remove: keys.slice(1, -1) });
			} else {
				for (let i = selectedPairs.length - 1; i >= 0; i -= 1) {
					tasks.push({ k1: selectedPairs[i][0], k2: selectedPairs[i][1], remove: [] });
				}
			}
			for (let q = 0; q < tasks.length; q += 1) {
				const task = tasks[q];
				const k1 = task.k1;
				let k2 = task.k2;
				for (let r = task.remove.length - 1; r >= 0; r -= 1) {
					try { prop.removeKey(task.remove[r]); } catch (e) { errors.push("removeKey: " + String(e)); }
				}
				if (task.remove.length > 0) k2 = k1 + 1;
				if (points.length > 2) {
					const created = [k1];
					const t1 = Number(prop.keyTime(k1));
					const t2 = Number(prop.keyTime(k2));
					const dt = Math.max(0.000001, t2 - t1);
					const v1 = prop.keyValue(k1);
					const v2 = prop.keyValue(k2);
					for (let r = 1; r < points.length - 1; r += 1) {
						const pnt = points[r];
						const newTime = t1 + clampEasingNumber(pnt[0], 0) * dt;
						const newValue = easingInterpolateValue(v1, v2, pnt[1]);
						const newKey = prop.addKey(newTime);
						try { prop.setValueAtKey(newKey, newValue); } catch (e) { errors.push("setValueAtKey: " + String(e)); }
						try { prop.setSelectedAtKey(newKey, true); } catch (e) { errors.push("setSelectedAtKey newKey: " + String(e)); }
						setEasingLabelAtKey(prop, newKey, labelColor);
						created.push(newKey);
					}
					created.push(k2 + created.length - 1);
					for (let r = 0; r < created.length - 1; r += 1) {
						const a = created[r];
						const b = created[r + 1];
						const pA = points[r];
						const pB = points[r + 1];
						const segDt = Math.max(0.000001, Number(prop.keyTime(b)) - Number(prop.keyTime(a)));
						const vA = prop.keyValue(a);
						const vB = prop.keyValue(b);
						let existingInA: unknown[] = [];
						let existingOutB: unknown[] = [];
						let dims = 1;
						try {
							existingInA = prop.keyInTemporalEase(a);
							existingOutB = prop.keyOutTemporalEase(b);
							dims = existingInA.length || existingOutB.length || 1;
						} catch (e) { errors.push("readTemporalEase: " + String(e)); }
						const hOutX = Math.abs(pA[4]) < 0.01 ? 0.01 : pA[4];
						const hInX = Math.abs(pB[2]) < 0.01 ? -0.01 : pB[2];
						const outInf = easingInfluence(0, hOutX);
						const inInf = easingInfluence(0, hInX);
						const slopeOut = safeEasingSlope(pA[5], hOutX);
						const slopeIn = safeEasingSlope(pB[3], hInX);
						const outArr = [];
						const inArr = [];
						for (let d = 0; d < dims; d += 1) {
							let avgSpeed = (easingValueDim(vB, d) - easingValueDim(vA, d)) / segDt;
							try { if (prop.isSpatial) avgSpeed = Math.abs(avgSpeed); } catch (e) { errors.push("isSpatial: " + String(e)); }
							outArr.push(new KeyframeEase(clampEasingSpeed(avgSpeed * slopeOut), outInf));
							inArr.push(new KeyframeEase(clampEasingSpeed(avgSpeed * slopeIn), inInf));
						}
						// kease-style handle targeting: "in" only modifies the
						// segment's incoming (b's hIn); "out" only modifies the
						// segment's outgoing (a's hOut); "both" writes both.
						// The auto-bezier / interpolation-type writes are gated
						// alongside the ease writes so the "untouched" side
						// keeps its existing flags too.
						if (targeting !== "in") {
							try { prop.setTemporalAutoBezierAtKey(a, false); } catch (e) { errors.push("setTemporalAutoBezierAtKey a: " + String(e)); }
							try { prop.setInterpolationTypeAtKey(a, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) { errors.push("setInterpolationTypeAtKey a: " + String(e)); }
							try { prop.setTemporalEaseAtKey(a, existingInA, outArr); } catch (e) { errors.push("setTemporalEaseAtKey a: " + String(e)); }
						}
						if (targeting !== "out") {
							try { prop.setTemporalAutoBezierAtKey(b, false); } catch (e) { errors.push("setTemporalAutoBezierAtKey b: " + String(e)); }
							try { prop.setInterpolationTypeAtKey(b, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) { errors.push("setInterpolationTypeAtKey b: " + String(e)); }
							try { prop.setTemporalEaseAtKey(b, inArr, existingOutB); } catch (e) { errors.push("setTemporalEaseAtKey b: " + String(e)); }
						}
						setEasingLabelAtKey(prop, a, labelColor);
						setEasingLabelAtKey(prop, b, labelColor);
					}
					// Re-select the outer keyframes. The middle-key loop above
					// already calls setSelectedAtKey(newKey, true) for each
					// inserted key, but the new k1 (which the user originally
					// selected) and the new k2 (which the user did NOT select
					// before applying — addKey only re-uses existing selection
					// indices, not the user's intent) are never re-asserted.
					// Leaving them off leaves the property looking like
					// "all-but-the-last" is selected, which is jarring when
					// the user expected the eased range to stay active.
					try { prop.setSelectedAtKey(k1, true); } catch (e) { errors.push("setSelectedAtKey k1: " + String(e)); }
					try { prop.setSelectedAtKey(created[created.length - 1], true); } catch (e) { errors.push("setSelectedAtKey last: " + String(e)); }
					applyInterpolationTypeForKeyPair(prop, k1, k2, detectedType);
					changed += 1;
					continue;
				}
				const t1 = Number(prop.keyTime(k1));
				const t2 = Number(prop.keyTime(k2));
				const dt = Math.max(0.000001, t2 - t1);
				const v1 = prop.keyValue(k1);
				const v2 = prop.keyValue(k2);
				let existingIn1: unknown[] = [];
				let existingOut2: unknown[] = [];
				let dims = 1;
				try {
					existingIn1 = prop.keyInTemporalEase(k1);
					existingOut2 = prop.keyOutTemporalEase(k2);
					dims = existingIn1.length || existingOut2.length || 1;
				} catch (_error) {}
				const outArr = [];
				const inArr = [];
				for (let d = 0; d < dims; d += 1) {
					let avgSpeed = (easingValueDim(v2, d) - easingValueDim(v1, d)) / dt;
					try { if (prop.isSpatial) avgSpeed = Math.abs(avgSpeed); } catch (_spatial) {}
					outArr.push(new KeyframeEase(clampEasingSpeed(avgSpeed * outSlope), outInfluence));
					inArr.push(new KeyframeEase(clampEasingSpeed(avgSpeed * inSlope), inInfluence));
				}
				// Skip the BEZIER+ease set when the user picked a linear curve;
				// AE silently keeps the keyframe rendered as BEZIER (Easy Ease)
				// if setTemporalEaseAtKey ran first. Same applies to HOLD.
				if (detectedType !== "linear" && detectedType !== "hold") {
					// kease-style handle targeting: "in" only modifies k2's hIn;
					// "out" only modifies k1's hOut; "both" writes both. The
					// auto-bezier / interpolation-type writes are gated
					// alongside so the "untouched" side keeps its existing flags.
					if (targeting !== "in") {
						try { prop.setTemporalAutoBezierAtKey(k1, false); } catch (_a) {}
						try { prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (_c) {}
						try { prop.setTemporalEaseAtKey(k1, existingIn1, outArr); } catch (_d) {}
					}
					if (targeting !== "out") {
						try { prop.setTemporalAutoBezierAtKey(k2, false); } catch (_b) {}
						try { prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (_cb) {}
						try { prop.setTemporalEaseAtKey(k2, inArr, existingOut2); } catch (_e) {}
					}
				}
				setEasingLabelAtKey(prop, k1, labelColor);
				setEasingLabelAtKey(prop, k2, labelColor);
				applyInterpolationTypeForKeyPair(prop, k1, k2, detectedType);
				// Re-assert selection on the eased range. Without this, the
				// sequence of setTemporalEaseAtKey / setInterpolationTypeAtKey
				// / setLabelAtKey calls above can leave the property with
				// nothing selected (AE's internal selection state does not
				// survive those writes across all property types), and the
				// user's "active range" silently goes dim. Re-asserting on
				// k1 and k2 is sufficient for the 2-keyframe case because no
				// new keys were inserted.
				try { prop.setSelectedAtKey(k1, true); } catch (e) { errors.push("setSelectedAtKey k1: " + String(e)); }
				try { prop.setSelectedAtKey(k2, true); } catch (e) { errors.push("setSelectedAtKey k2: " + String(e)); }
				changed += 1;
			}
		}
		return { changed, cubic: [x1, y1, x2, y2], points: points.length, errors };
	} finally {
		app.endUndoGroup();
	}
};

// Replicate a single-cycle curve points array into `loopCount` cycles that
// fit inside the (0,1) x (0,1) unit square. Returns the input unchanged
// when there's nothing to replicate (less than 2 points, or a single
// cycle) so the caller can fall through to the regular multi-point apply
// path. Handle x-offsets are scaled by 1/loopCount because each cycle
// occupies 1/loopCount of the total time range; y-offsets stay the same
// because value scale does not change between cycles.
//
// The React side sends a normalized single-cycle curve (x in [0,1], y in
// [0,1]). Inflating the array here, on the ExtendScript side, keeps
// segment-relative handle coordinates from drifting across replication
// boundaries (which they would if React tried to scale them).
const buildLoopReplicatedPoints = (
	segmentPoints: number[][],
	loopCount: number,
): number[][] => {
	if (segmentPoints.length < 2) return segmentPoints;
	if (loopCount < 2) return segmentPoints;
	const last = segmentPoints.length - 1;
	const out: number[][] = [];
	for (let i = 0; i < loopCount; i += 1) {
		const offset = i / loopCount;
		const scale = 1 / loopCount;
		for (let j = 0; j < segmentPoints.length; j += 1) {
			// Skip the original segment endpoints when they coincide with
			// the outer keyframes (k1 for cycle 0 / p0, k2 for the final
			// cycle / p_last). All other points are emitted so the curve
			// is piecewise continuous across cycle boundaries.
			if (i === 0 && j === 0) continue;
			if (i === loopCount - 1 && j === last) continue;
			const pnt = segmentPoints[j];
			out.push([
				offset + clampEasingNumber(pnt[0], 0) * scale,
				pnt[1],
				pnt[2] * scale,
				pnt[3],
				pnt[4] * scale,
				pnt[5],
			]);
		}
	}
	out.sort((a, b) => a[0] - b[0]);
	return out;
};

// Apply a single curve shape replicated N times across the (k1, k2) range.
// Loop mode only makes sense for the `in` targeting: outgoing and both
// targeting fall back to a single-cycle apply. When the payload cannot
// support loop replication (loopCount < 2 or only two points / no
// multi-point shape), fall through to applyEasing so the caller still
// gets the same single-cycle behavior they would have without this
// command.
const applyLoopEasing = (payload: Record<string, unknown>) => {
	const loopCount = Math.max(
		0,
		Math.floor(Number(payload.loopCount ?? 1)),
	);
	if (loopCount < 2) {
		return applyEasing(payload);
	}
	const segmentPoints = coerceEasingPoints(payload.points);
	if (segmentPoints.length < 3) {
		// No interior points: the multi-point path can't replicate a
		// 2-point cubic. Defer to applyEasing's regular 2-point path so
		// the user's intent (a curve in a single cycle) still applies.
		return applyEasing(payload);
	}
	const replicated = buildLoopReplicatedPoints(segmentPoints, loopCount);
	const loopPayload: Record<string, unknown> = {
		...payload,
		points: replicated,
	};
	// Loop is an in-targeting-only operation; force targeting to "in" so
	// applyEasing's targeting-gating logic only writes the segments'
	// incoming handles. The outer keyframes' outgoing handles are kept
	// as the user already had them.
	loopPayload.targeting = "in";
	return applyEasing(loopPayload);
};

const captureEasingCurve = () => {
	const props = collectEasingTargetProperties();
	for (let p = 0; p < props.length; p += 1) {
		const prop = props[p];
		const pairs = selectedKeyframePairs(prop);
		if (pairs.length === 0) continue;
		if (pairs.length > 1) {
			const first = pairs[0][0];
			const last = pairs[pairs.length - 1][1];
			const t1 = Number(prop.keyTime(first));
			const t2 = Number(prop.keyTime(last));
			const v1 = prop.keyValue(first);
			const v2 = prop.keyValue(last);
			const dt = Math.max(0.000001, t2 - t1);
			const dv = easingValueDim(v2, 0) - easingValueDim(v1, 0);
			const keys: number[] = [first];
			for (let i = 0; i < pairs.length; i += 1) keys.push(pairs[i][1]);
			const points: any[] = [];
			for (let i = 0; i < keys.length; i += 1) {
				const key = keys[i];
				const x = (Number(prop.keyTime(key)) - t1) / dt;
				const rawValue = easingValueDim(prop.keyValue(key), 0);
				const y =
					Math.abs(dv) < 0.000001 ? x : (rawValue - easingValueDim(v1, 0)) / dv;
				let hIn = { x: 0, y: 0 };
				let hOut = { x: 0, y: 0 };
				try {
					const inEase = prop.keyInTemporalEase(key);
					const outEase = prop.keyOutTemporalEase(key);
					const prevKey = key > 1 ? key - 1 : key;
					const nextKey = key < prop.numKeys ? key + 1 : key;
					const prevDt = Math.max(0.000001, Number(prop.keyTime(key)) - Number(prop.keyTime(prevKey)));
					const nextDt = Math.max(0.000001, Number(prop.keyTime(nextKey)) - Number(prop.keyTime(key)));
					const inInf = inEase && inEase.length ? Number(inEase[0].influence) / 100 : 0;
					const outInf = outEase && outEase.length ? Number(outEase[0].influence) / 100 : 0;
					hIn = { x: -inInf * (prevDt / dt), y: 0 };
					hOut = { x: outInf * (nextDt / dt), y: 0 };
				} catch (_ease) {}
				points.push({ x, y, hIn, hOut });
			}
			return { cubic: [0.33, 0, 0.67, 1], points };
		}
		const k1 = pairs[0][0];
		const k2 = pairs[0][1];
		try {
			const outEase = prop.keyOutTemporalEase(k1);
			const inEase = prop.keyInTemporalEase(k2);
			const outInf = outEase && outEase.length ? Number(outEase[0].influence) : 33;
			const inInf = inEase && inEase.length ? Number(inEase[0].influence) : 33;
			const x1 = clampEasingNumber(outInf / 100, 0.33);
			const x2 = clampEasingNumber(1 - inInf / 100, 0.67);
			return { cubic: [x1, 1, x2, 1] };
		} catch (_error) {}
	}
	throw new Error("Could not read easing from the selected keyframes");
};

const captureKeyframeValues = () => {
	const props = collectEasingTargetProperties();
	const out = { values: [] as number[][] };
	for (let p = 0; p < props.length; p += 1) {
		const prop = props[p];
		const n = prop.numKeys;
		for (let i = 1; i <= n; i += 1) {
			try {
				const v = prop.keyValue(i);
				if (isArrayValue(v)) {
					out.values.push(v.map((entry) => Number(entry)));
				} else if (typeof v === "number" && isFinite(v)) {
					out.values.push([Number(v)]);
				} else {
					out.values.push([0]);
				}
			} catch (_e) {
				out.values.push([0]);
			}
		}
	}
	return { value: out };
};

const getEasingClipboardPath = () => {
	const base = Folder.userData.fsName;
	return { value: { path: base + "/Aescripts/TyPlus/easing-clipboard.json" } };
};

const pasteKeyframeValues = (input: { values?: number[][] }) => {
	const values = isArrayValue(input?.values) ? input.values : [];
	const props = collectEasingTargetProperties();
	const errors: string[] = [];
	app.beginUndoGroup("Ty Plus: Paste Values");
	try {
		for (let p = 0; p < props.length; p += 1) {
			const prop = props[p];
			const n = prop.numKeys;
			for (let i = 1; i <= n; i += 1) {
				if (i - 1 >= values.length) break;
				const v = values[i - 1];
				try {
					prop.setValueAtKey(i, v);
				} catch (e) {
					errors.push("setValueAtKey: " + String(e));
				}
			}
		}
	} finally {
		app.endUndoGroup();
	}
	return { value: { errors } };
};

const hostBundle = {
	// Compatibility markers read by the CEP load coordinator's probe.
	// Data properties, not `wrapCallable` methods: the probe must be able
	// to read them without entering the host method wrapper. Both are
	// required: `__schemaVersion` alone cannot detect a host-side
	// implementation update that keeps the exported contract unchanged.
	__schemaVersion: HOST_BUNDLE_SCHEMA_VERSION,
	__bundleVersion: HOST_BUNDLE_VERSION,
	ping: wrapCallable(() => ({ ok: true, value: HOST_BUNDLE_VERSION })),
	getHostContext: wrapCallable(() => {
		const appPackage = Folder.appPackage;
		const appRoot = aeWorkerAppRoot() ||
			(appPackage &&
			typeof (appPackage as { fsName?: unknown }).fsName === "string"
				? (appPackage as { fsName: string }).fsName
				: undefined);
		const supportRoot = Folder.userData.fsName;
		return {
			appRoot,
			supportRoot: supportRoot,
			sessionId: `ae-${Date.now()}`,
		};
	}),
	runScriptFile: wrapCallable(runScriptFile),
	applyPreset: wrapCallable(applyPresetFile),
	addFootage: wrapCallable((input: { filePath?: string }) =>
		addFootageFile(String(input.filePath ?? "")),
	),
	// Issue #130: lets the React side ask the host whether the recorded
	// preset asset is still on disk. Used at startup to mark stale records
	// and after every write as a sanity check before persisting.
	verifyPresetAsset: wrapCallable((filePath: string) =>
		verifyPresetAsset(String(filePath ?? "")),
	),
		setAnchorPoint: wrapCallable((payload: Record<string, unknown>) =>
		setAnchorPoint(payload),
	),
		getFontBrowserEntries: wrapCallable(getFontBrowserEntries),
	writeSelectedTextLayers: wrapCallable((payload: Record<string, unknown>) =>
		writeSelectedTextLayers(payload),
	),
	readSelectedTextLayers: wrapCallable(readSelectedTextLayers),
	// Issue #160: authoring helpers resolve/authorize the target and hand
	// AE-dependent content back to CEP. The OS file write happens in the
	// CEP storage write boundary so it can escalate to UAC on a permission
	// failure and read the bytes back before any metadata is committed.
	prepareAnimationPresetTarget: wrapCallable(
		(payload: Record<string, unknown>) => prepareAnimationPresetTarget(payload),
	),
	openAnimationPresetSaveDialog: wrapCallable(
		(payload: Record<string, unknown>) => openAnimationPresetSaveDialog(payload),
	),
	prepareLayerCompPresetScript: wrapCallable(
		(payload: Record<string, unknown>) => prepareLayerCompPresetScript(payload),
	),
	prepareCodePresetScript: wrapCallable((payload: Record<string, unknown>) =>
		prepareCodePresetScript(payload),
	),
	prepareEasingPresetScript: wrapCallable((payload: Record<string, unknown>) =>
		prepareEasingPresetScript(payload),
	),
	scanPluginEffectRoots: wrapCallable(buildPluginEffectScanRows),
	applyEffectByMatchName: wrapCallable(applyEffectByMatchName),
	getSelectionCount: wrapCallable(getSelectionCount),
	getEasingSelectionCount: wrapCallable(getEasingSelectionCount),
	alignLayers: wrapCallable((input: { action?: string; target?: string }) =>
		alignLayers(input),
	),
	applyEasing: wrapCallable((payload: Record<string, unknown>) =>
		applyEasing(payload),
	),
	applyLoopEasing: wrapCallable((payload: Record<string, unknown>) =>
		applyLoopEasing(payload),
	),
	captureEasingCurve: wrapCallable(captureEasingCurve),
	captureKeyframeValues: wrapCallable(captureKeyframeValues),
	getEasingClipboardPath: wrapCallable(getEasingClipboardPath),
	pasteKeyframeValues: wrapCallable(pasteKeyframeValues),
	getLabelColorNames: wrapCallable(readLabelColorNames),

	// Issue #147 round-3 Blocker 3 + round-4 Blocker B — host-state-
	// oracle probes for the scenario-spec computer-use runner.  AE's
	// scripting API does NOT expose `app.settingsVisibility` or
	// `app.onlineState`; both were synthetic probes in round-2.
	// Round-3 replaces them with real ExtendScript probes that read
	// panel-published state out of `$.global`; round-4 (Blocker B)
	// removes the settings-dialog probe (the AE native Settings
	// dialog cannot be reliably probed from CEP — the panel state for
	// the ty-plus CEP Settings dialog is now addressed via a panel-
	// state-oracle `[data-settings-sidebar]` selector on the Gherkin
	// step instead of a host-state-oracle probe).
	//
	// Published by the panel when the cloud gateway probe resolves to
	// "reachable" / "degraded" / "unreachable".  Values: "online" /
	// "degraded" / "offline".  AE itself does not have an
	// `app.onlineState`; the panel keeps its own connectivity state
	// (`runtime-gateway-health.ts`) and forwards every transition to
	// `$.global.tyPlusOnlineState` via `runCepEvalScript` so the
	// ExtendScript probe reads what production actually writes.
	tyPlusProbeOnlineState: wrapCallable(() => {
		const v = ($.global as { tyPlusOnlineState?: unknown })
			.tyPlusOnlineState;
		return { value: typeof v === "string" ? v : "offline" };
	}),
};

$.global.__TY_PLUS_HOST__ = hostBundle;
