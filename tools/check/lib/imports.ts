/**
 * Lightweight TS-aware extractors for the tools/check/ scripts.
 *
 * Replaces the legacy `import ts from "typescript"` AST pipeline that these
 * tools previously used. TS 7 removed the public `createSourceFile` / parser
 * surface — only a token-level `createScanner` is exported from
 * `typescript/unstable/ast`, and there's no API to construct a `SourceFile`
 * from raw text. The tools don't need full semantic analysis, just the
 * specifier strings on import/export statements and the names of declared
 * symbols, so a line-by-line extractor (with block-comment stripping) is
 * sufficient.
 *
 * Tradeoffs vs. the legacy AST pipeline:
 * - Loses fidelity on pathological edge cases (e.g. an import keyword inside a
 *   template literal). In practice, import statements and top-level
 *   declarations never appear inside strings/templates in this codebase.
 * - Line numbers are derived from a UTF-16 substring scan rather than the TS
 *   line-map. CRLF handling is line-based and matches what the downstream
 *   classification logic expects.
 */

export type ImportEntry = {
	specifier: string;
	lineNumber: number;
	rawLine: string;
};

export type NamedSymbol = {
	name: string;
	line: number;
};

const IMPORT_FROM_RE =
	/(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']/g;

export const getImportEntries = (
	filePath: string,
	sourceText: string,
): ImportEntry[] => {
	const noBlockComments = sourceText.replace(/\/\*[\s\S]*?\*\//g, "");
	const lines = noBlockComments.split(/\r?\n/);
	const entries: ImportEntry[] = [];
	const seen = new Set<string>();

	const pushSpecifier = (specifier: string, lineNumber: number) => {
		const key = `${lineNumber}:${specifier}`;
		if (seen.has(key)) return;
		seen.add(key);
		entries.push({
			specifier,
			lineNumber,
			rawLine: sourceText.split(/\r?\n/)[lineNumber - 1]?.trim() ?? specifier,
		});
	};

	// Pre-pass: collapse lines that are continuations of a brace-balanced
	// statement that started on an earlier line (e.g. multi-line `import {…} from "…"`).
	const joinedLines: string[] = [];
	const joinStartByLine: number[] = [];
	let buffer = "";
	let bufferStart = 0;
	let depth = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const code = line.replace(/\/\/.*$/, "");
		if (buffer === "") {
			bufferStart = i + 1;
			buffer = code;
		} else {
			buffer = `${buffer} ${code}`;
		}
		for (const ch of code) {
			if (ch === "{") depth++;
			else if (ch === "}") depth--;
		}
		if (depth <= 0) {
			joinedLines.push(buffer);
			joinStartByLine.push(bufferStart);
			buffer = "";
			depth = 0;
		}
	}
	if (buffer !== "") {
		joinedLines.push(buffer);
		joinStartByLine.push(bufferStart);
	}

	for (let i = 0; i < joinedLines.length; i++) {
		const code = joinedLines[i];
		const lineNo = joinStartByLine[i];

		const fromMatch =
			/(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/.exec(
				code,
			);
		if (fromMatch && fromMatch[1]) {
			pushSpecifier(fromMatch[1], lineNo);
			continue;
		}

		const sideEffectMatch = /import\s+["']([^"']+)["']/.exec(code);
		if (sideEffectMatch && sideEffectMatch[1]) {
			pushSpecifier(sideEffectMatch[1], lineNo);
			continue;
		}

		const dynamicMatch = /\bimport\s*\(\s*["']([^"']+)["']/.exec(code);
		if (dynamicMatch && dynamicMatch[1]) {
			pushSpecifier(dynamicMatch[1], lineNo);
		}
	}

	void filePath;
	void IMPORT_FROM_RE;
	void SIDE_EFFECT_IMPORT_RE;
	void DYNAMIC_IMPORT_RE;

	entries.sort((a, b) => a.lineNumber - b.lineNumber);
	return entries;
};

const FUNCTION_DECL_RE =
	/(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(\w+)/;
const CLASS_DECL_RE =
	/(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)/;
const VAR_WITH_FUNCTION_INIT_RE =
	/(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+(\w+)\b[^=]*=\s*(?:async\s+)?(?:function\s*\*?\s*\w*\s*\(|\([^)]*\)\s*=>|[A-Za-z_]\w*\s*=>)/;
const METHOD_OR_PROPERTY_RE =
	/^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*(\w+)\s*[:=]\s*(?:async\s+)?(?:function\s*\*?\s*\w*\s*\(|\([^)]*\)\s*=>|[A-Za-z_]\w*\s*=>)/;

export const getNamedSymbols = (
	filePath: string,
	sourceText: string,
): NamedSymbol[] => {
	const noBlockComments = sourceText.replace(/\/\*[\s\S]*?\*\//g, "");
	const lines = noBlockComments.split(/\r?\n/);
	const symbols: NamedSymbol[] = [];
	const seen = new Set<string>();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNo = i + 1;
		const code = line.replace(/\/\/.*$/, "");

		const extract = (re: RegExp): string | null => {
			const m = re.exec(code);
			return m && m[1] ? m[1] : null;
		};

		const candidates: Array<string | null> = [
			extract(FUNCTION_DECL_RE),
			extract(CLASS_DECL_RE),
			extract(VAR_WITH_FUNCTION_INIT_RE),
			extract(METHOD_OR_PROPERTY_RE),
		];

		for (const name of candidates) {
			if (!name) continue;
			const key = `${lineNo}:${name}`;
			if (seen.has(key)) continue;
			seen.add(key);
			symbols.push({ name, line: lineNo });
			break;
		}
	}

	void filePath;
	return symbols;
};
