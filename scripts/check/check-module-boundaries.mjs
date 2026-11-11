import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const ROOT = process.cwd();
const SYSTEM_ROOT = path.join(ROOT, "src", "js", "system");

const isTsFile = (filePath) =>
	filePath.endsWith(".ts") || filePath.endsWith(".tsx");

const listFiles = async (dirPath) => {
	/** @type {string[]} */
	const out = [];
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await listFiles(full)));
			continue;
		}
		if (entry.isFile() && isTsFile(full)) out.push(full);
	}
	return out;
};

const toPos = (sourceFile, pos) => {
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
	return { line: line + 1, col: character + 1 };
};

const isBannedSystemImport = (specifier) => {
	if (specifier.startsWith("@ui")) return "system must not import @ui";
	if (specifier.startsWith("@infra")) return "system must not import @infra";

	// Catch relative/absolute paths that traverse into ui/infra.
	const normalized = specifier.replaceAll("\\", "/");
	const segments = normalized
		.split("/")
		.filter((seg) => seg.length > 0 && seg !== "." && seg !== "..");
	if (segments.includes("ui")) return "system must not import ui";
	if (segments.includes("infra")) return "system must not import infra";
	return null;
};

const getModuleSpecifiers = (sourceFile) => {
	/** @type {Array<{ specifier: string; pos: number }>} */
	const specs = [];

	/** @param {ts.Node} node */
	const visit = (node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			const ms = node.moduleSpecifier;
			if (ms && ts.isStringLiteral(ms)) {
				specs.push({ specifier: ms.text, pos: ms.getStart(sourceFile) });
			}
		}

		if (ts.isCallExpression(node)) {
			// require("...")
			if (
				ts.isIdentifier(node.expression) &&
				node.expression.text === "require" &&
				node.arguments.length >= 1 &&
				ts.isStringLiteral(node.arguments[0])
			) {
				specs.push({
					specifier: node.arguments[0].text,
					pos: node.arguments[0].getStart(sourceFile),
				});
			}

			// import("...")
			if (
				node.expression.kind === ts.SyntaxKind.ImportKeyword &&
				node.arguments.length >= 1 &&
				ts.isStringLiteral(node.arguments[0])
			) {
				specs.push({
					specifier: node.arguments[0].text,
					pos: node.arguments[0].getStart(sourceFile),
				});
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return specs;
};

const run = async () => {
	const files = await listFiles(SYSTEM_ROOT);

	/** @type {Array<{ file: string; line: number; col: number; specifier: string; reason: string }>} */
	const violations = [];

	for (const file of files) {
		const text = await fs.readFile(file, "utf8");
		const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
		const sourceFile = ts.createSourceFile(
			file,
			text,
			ts.ScriptTarget.Latest,
			true,
			kind,
		);

		for (const entry of getModuleSpecifiers(sourceFile)) {
			const reason = isBannedSystemImport(entry.specifier);
			if (!reason) continue;
			const pos = toPos(sourceFile, entry.pos);
			violations.push({
				file: path.relative(ROOT, file),
				line: pos.line,
				col: pos.col,
				specifier: entry.specifier,
				reason,
			});
		}
	}

	if (violations.length === 0) return;

	console.log("[boundaries] module boundary violations found:");
	for (const v of violations) {
		console.log(`- ${v.file}:${v.line}:${v.col} ${v.reason} (${v.specifier})`);
	}
	process.exitCode = 1;
};

await run();
