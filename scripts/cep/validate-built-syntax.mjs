import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SCRIPT_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);

/**
 * @typedef {{
 *   filePath: string;
 *   message: string;
 *   line: number;
 *   column: number;
 * }} SyntaxValidationError
 */

/**
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listGeneratedScriptFiles(rootDir) {
	if (!fs.existsSync(rootDir)) return [];
	const entries = fs.readdirSync(rootDir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listGeneratedScriptFiles(fullPath));
			continue;
		}
		if (!entry.isFile()) continue;
		if (!SCRIPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
			continue;
		files.push(fullPath);
	}

	return files;
}

/**
 * @param {string} filePath
 * @returns {SyntaxValidationError[]}
 */
export function validateScriptFileSyntax(filePath) {
	const text = fs.readFileSync(filePath, "utf8");
	const sourceFile = ts.createSourceFile(
		filePath,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);

	return sourceFile.parseDiagnostics.map((diag) => {
		const start = diag.start ?? 0;
		const pos = sourceFile.getLineAndCharacterOfPosition(start);
		return {
			filePath,
			message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
			line: pos.line + 1,
			column: pos.character + 1,
		};
	});
}

/**
 * @param {string} distRoot
 * @returns {{ checkedFiles: string[]; errors: SyntaxValidationError[] }}
 */
export function validateGeneratedScripts(distRoot) {
	const checkedFiles = listGeneratedScriptFiles(distRoot);
	const errors = checkedFiles.flatMap((filePath) =>
		validateScriptFileSyntax(filePath),
	);
	return { checkedFiles, errors };
}

/**
 * @typedef {{
 *   env?: Record<string, string | undefined>;
 *   existsSync?: (p: string) => boolean;
 *   readdirSync?: (p: string) => fs.Dirent[];
 *   platform?: NodeJS.Platform;
 * }} AfterFxLookupOptions
 */

/**
 * @param {AfterFxLookupOptions} [options]
 * @returns {string | null}
 */
export function findAfterFxExecutable(options = {}) {
	const env = options.env ?? process.env;
	const existsSync = options.existsSync ?? fs.existsSync;
	const readdirSync =
		options.readdirSync ?? ((p) => fs.readdirSync(p, { withFileTypes: true }));
	const platform = options.platform ?? process.platform;
	if (platform !== "win32") return null;

	const explicit = env.AFTERFX_PATH;
	if (explicit && existsSync(explicit)) return explicit;

	const programFiles = env.ProgramFiles ?? "C:\\Program Files";
	const adobeRoot = path.join(programFiles, "Adobe");
	if (!existsSync(adobeRoot)) return null;

	const entries = readdirSync(adobeRoot)
		.filter(
			(entry) =>
				entry.isDirectory() && /^Adobe After Effects/i.test(entry.name),
		)
		.sort((a, b) => b.name.localeCompare(a.name, "en"));

	for (const entry of entries) {
		const supportFilesDir = path.join(adobeRoot, entry.name, "Support Files");
		const appRootDir = path.join(adobeRoot, entry.name);
		const candidates = [
			path.join(supportFilesDir, "afterfx.com"),
			path.join(supportFilesDir, "afterfx.exe"),
			path.join(appRootDir, "afterfx.com"),
			path.join(appRootDir, "afterfx.exe"),
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) return candidate;
		}
	}
	return null;
}

function createHostCheckScript(targetScriptPath, resultFilePath) {
	const targetLiteral = JSON.stringify(targetScriptPath.replace(/\\/g, "/"));
	const resultLiteral = JSON.stringify(resultFilePath.replace(/\\/g, "/"));
	return [
		"var __typlusResult = { ok: false, message: '', line: 0, fileName: '' };",
		"try {",
		`  var __target = new File(${targetLiteral});`,
		"  if (!__target.exists) {",
		"    throw new Error('Target ExtendScript file not found: ' + __target.fsName);",
		"  }",
		"  $.evalFile(__target);",
		"  __typlusResult.ok = true;",
		"} catch (e) {",
		"  __typlusResult.ok = false;",
		"  __typlusResult.message = e && e.toString ? e.toString() : String(e);",
		"  __typlusResult.line = e && e.line ? e.line : 0;",
		"  __typlusResult.fileName = e && e.fileName ? String(e.fileName) : '';",
		"}",
		"try {",
		`  var __out = new File(${resultLiteral});`,
		"  __out.encoding = 'UTF-8';",
		"  __out.open('w');",
		"  var __msg = String(__typlusResult.message || '').replace(/\\r\\n|\\r|\\n/g, '\\\\n');",
		"  var __fn = String(__typlusResult.fileName || '').replace(/\\r\\n|\\r|\\n/g, '\\\\n');",
		"  __out.write((__typlusResult.ok ? '1' : '0') + '\\n' + __msg + '\\n' + String(__typlusResult.line || 0) + '\\n' + __fn);",
		"  __out.close();",
		"} catch (_e) {}",
	].join("\n");
}

/**
 * @param {string} raw
 * @returns {{ ok: boolean; message: string; line: number; fileName: string } | null}
 */
function parseHostCheckResult(raw) {
	const text = String(raw ?? "");
	if (!text) return null;
	const lines = text.split(/\r?\n/);
	if (lines.length < 3) return null;
	return {
		ok: lines[0] === "1",
		message: String(lines[1] ?? "").replace(/\\n/g, "\n"),
		line: Number(lines[2] ?? 0) || 0,
		fileName: String(lines[3] ?? "").replace(/\\n/g, "\n"),
	};
}

/**
 * @param {string} jsxEntryPath
 * @returns {{ ok: true } | { ok: false; reason: string; message?: string; line?: number; fileName?: string }}
 */
export function validateWithAfterFx(jsxEntryPath) {
	const afterfxPath = findAfterFxExecutable();
	if (!afterfxPath) {
		return { ok: false, reason: "afterfx-not-found" };
	}

	const tempBase = path.join(
		os.tmpdir(),
		`typlus-es-check-${Date.now()}-${Math.random().toString(16).slice(2)}`,
	);
	const runnerPath = `${tempBase}.jsx`;
	const resultPath = `${tempBase}.json`;

	try {
		fs.writeFileSync(
			runnerPath,
			createHostCheckScript(jsxEntryPath, resultPath),
			"utf8",
		);
		const proc = spawnSync(afterfxPath, ["-r", runnerPath], {
			encoding: "utf8",
			timeout: 120000,
		});

		if (proc.status !== 0) {
			return {
				ok: false,
				reason: "afterfx-execution-failed",
				message: (proc.stderr || proc.stdout || "").trim(),
			};
		}

		if (!fs.existsSync(resultPath)) {
			return {
				ok: false,
				reason: "afterfx-result-missing",
				message: "After Effects run completed but no result file was produced.",
			};
		}

		const raw = fs.readFileSync(resultPath, "utf8");
		const parsed = parseHostCheckResult(raw);
		if (!parsed) {
			return {
				ok: false,
				reason: "afterfx-result-invalid",
				message: `Invalid host check result payload (len=${raw.length}). stdout=${(proc.stdout || "").trim()} stderr=${(proc.stderr || "").trim()}`,
			};
		}
		if (parsed?.ok) return { ok: true };
		return {
			ok: false,
			reason: "extendscript-parse-error",
			message: parsed?.message || "Unknown ExtendScript parse error",
			line: typeof parsed?.line === "number" ? parsed.line : 0,
			fileName: typeof parsed?.fileName === "string" ? parsed.fileName : "",
		};
	} catch (e) {
		return {
			ok: false,
			reason: "afterfx-check-crashed",
			message: e instanceof Error ? e.message : String(e),
		};
	} finally {
		for (const p of [runnerPath, resultPath]) {
			try {
				if (fs.existsSync(p)) fs.unlinkSync(p);
			} catch {
				// ignore temp cleanup failures
			}
		}
	}
}

/**
 * @param {string} distRoot
 * @returns {number}
 */
export function runSyntaxValidation(
	distRoot = path.resolve(process.cwd(), "dist", "cep"),
) {
	const requireHostCheck = /^(1|true|yes)$/i.test(
		String(process.env.CEP_REQUIRE_AFTERFX_CHECK ?? ""),
	);
	const { checkedFiles, errors } = validateGeneratedScripts(distRoot);

	if (checkedFiles.length === 0) {
		console.warn(
			`[build:syntax-check] no generated scripts found under: ${distRoot}`,
		);
		return 0;
	}

	if (errors.length === 0) {
		console.log(
			`[build:syntax-check] OK (${checkedFiles.length} files checked)`,
		);
		const jsxEntryPath = path.join(distRoot, "jsx", "index.js");
		const hostCheck = validateWithAfterFx(jsxEntryPath);
		if (hostCheck.ok) {
			console.log(
				"[build:syntax-check] ExtendScript host check OK (afterfx.com)",
			);
			return 0;
		}
		if (hostCheck.reason === "afterfx-not-found") {
			if (requireHostCheck) {
				console.error(
					"[build:syntax-check] ExtendScript host check required but afterfx.com was not found (set AFTERFX_PATH).",
				);
				return 1;
			}
			console.warn(
				"[build:syntax-check] ExtendScript host check skipped: afterfx.com not found (set AFTERFX_PATH to enable).",
			);
			return 0;
		}
		if (hostCheck.reason === "extendscript-parse-error") {
			console.error(
				"[build:syntax-check] ExtendScript parse error detected by afterfx.com:",
			);
			const location = hostCheck.fileName
				? `${hostCheck.fileName}${hostCheck.line ? `:${hostCheck.line}` : ""}`
				: jsxEntryPath;
			console.error(`  - ${location} ${hostCheck.message}`);
			return 1;
		}
		console.error(
			`[build:syntax-check] ExtendScript host check failed (${hostCheck.reason}): ${
				hostCheck.message || "unknown error"
			}`,
		);
		return 1;
	}

	console.error(
		`[build:syntax-check] Found ${errors.length} syntax error(s) in generated scripts:`,
	);
	for (const error of errors) {
		const relativePath = path.relative(process.cwd(), error.filePath);
		console.error(
			`  - ${relativePath}:${error.line}:${error.column} ${error.message}`,
		);
	}
	return 1;
}

const isEntry =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
	const distRoot = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
	process.exitCode = runSyntaxValidation(distRoot);
}
