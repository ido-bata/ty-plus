// TextMate-based syntax highlighting for Monaco. Loads the oniguruma WASM
// regex engine, builds a vscode-textmate Registry with the vendored
// JavaScript / TypeScript grammars, and exposes a `setTokensProvider` for
// each language.
//
// Token-flow contract: vscode-textmate's `tokenizeLine()` returns tokens
// with full scope chains (e.g. `["source.js", "meta.class.js",
// "entity.name.class.js"]`); Monaco's `TokensProvider` API expects each
// token's `scopes` to be a single space-separated string. We collapse the
// chain to the **deepest** scope so the theme rule prefix-matcher (e.g.
// `entity.name.class` → `entity.name.class.js`) picks the most specific
// match. The Monaco theme lists `ITokenThemeRule`s keyed on TM scope
// prefixes; color is owned by the theme rules, not by the encoded metadata.

import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import * as oniguruma from "vscode-oniguruma";
import onigurumaWasmBase64 from "vscode-oniguruma/release/onig.wasm";
import {
	type IGrammar,
	INITIAL,
	type IOnigLib,
	parseRawGrammar,
	Registry,
	type StateStack,
} from "vscode-textmate";

import extendscriptGrammarSource from "./grammars/Extendscript.tmLanguage.json?raw";
import javascriptGrammarSource from "./grammars/JavaScript.tmLanguage.json?raw";
import typescriptGrammarSource from "./grammars/TypeScript.tmLanguage.json?raw";

type SupportedLanguage = "javascript" | "typescript" | "extendscript";
type MonacoIState = monaco.languages.IState;

const SCOPE_FOR_LANGUAGE: Record<SupportedLanguage, string> = {
	javascript: "source.js",
	typescript: "source.ts",
	extendscript: "source.jsx.extendscript",
};

let extendscriptLanguageRegistered = false;
export const ensureExtendscriptLanguage = () => {
	if (extendscriptLanguageRegistered) return;
	monaco.languages.register({
		id: "extendscript",
		extensions: [".jsx", ".extendscript"],
		aliases: ["ExtendScript", "extendscript"],
	});
	extendscriptLanguageRegistered = true;
};

let registryPromise: Promise<Registry> | null = null;

const getRegistry = (): Promise<Registry> => {
	if (registryPromise) return registryPromise;
	registryPromise = (async () => {
		// WASM is inlined as a base64 string by the Vite plugin in
		// vite.config.ts (`inlineOnigurumaWasmPlugin`). Vite's `?raw`
		// would mangle high bytes by decoding the binary as UTF-8 (e.g.
		// 0xB8 becomes U+FFFD). Base64 round-trips all 256 byte values
		// intact, and inlining avoids the `?url` fetch that fails in
		// CEP's `file://` origin.
		const binary = atob(onigurumaWasmBase64);
		const wasmBytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			wasmBytes[i] = binary.charCodeAt(i);
		}
		await oniguruma.loadWASM(wasmBytes.buffer);
		return new Registry({
			onigLib: Promise.resolve<IOnigLib>({
				createOnigScanner: (sources) =>
					new oniguruma.OnigScanner(sources) as unknown as ReturnType<
						IOnigLib["createOnigScanner"]
					>,
				createOnigString: (str) =>
					new oniguruma.OnigString(str) as unknown as ReturnType<
						IOnigLib["createOnigString"]
					>,
			}),
			loadGrammar: async (scopeName) => {
				if (scopeName === SCOPE_FOR_LANGUAGE.javascript) {
					return parseRawGrammar(
						javascriptGrammarSource,
						"JavaScript.tmLanguage.json",
					);
				}
				if (scopeName === SCOPE_FOR_LANGUAGE.typescript) {
					return parseRawGrammar(
						typescriptGrammarSource,
						"TypeScript.tmLanguage.json",
					);
				}
				if (scopeName === SCOPE_FOR_LANGUAGE.extendscript) {
					return parseRawGrammar(
						extendscriptGrammarSource,
						"Extendscript.tmLanguage.json",
					);
				}
				return null;
			},
		});
	})();
	return registryPromise;
};

const loadGrammar = async (
	languageId: SupportedLanguage,
): Promise<IGrammar> => {
	const registry = await getRegistry();
	const scopeName = SCOPE_FOR_LANGUAGE[languageId];
	const grammar = await registry.loadGrammarWithConfiguration(
		scopeName,
		/* initialLanguage */ 1,
		/* configuration */ {},
	);
	if (!grammar) {
		throw new Error(`Failed to load TextMate grammar for ${scopeName}`);
	}
	return grammar;
};

const collapseScopes = (scopes: readonly string[]): string => {
	// vscode-textmate's first scope is the root (e.g. "source.js"). The
	// deepest scope is what Monaco should match against in its theme
	// rules. If the array is empty, fall back to the empty string and
	// let the theme's catch-all default apply.
	return scopes[scopes.length - 1] ?? "";
};

const makeTokensProvider = (
	grammar: IGrammar,
): monaco.languages.TokensProvider => {
	return {
		getInitialState: () => INITIAL as unknown as MonacoIState,
		tokenize: (
			line: string,
			state: MonacoIState,
		): monaco.languages.ILineTokens => {
			const result = grammar.tokenizeLine(line, state as unknown as StateStack);
			const tokens: monaco.languages.IToken[] = result.tokens.map((t) => ({
				startIndex: t.startIndex,
				scopes: collapseScopes(t.scopes),
			}));
			return {
				tokens,
				endState: result.ruleStack as unknown as MonacoIState,
			};
		},
	};
};

export type TextMateInit = {
	javascript: monaco.IDisposable;
	typescript: monaco.IDisposable;
	extendscript: monaco.IDisposable;
};

export const initTextMate = async (): Promise<TextMateInit> => {
	// Eager-load all three grammars so the first editor mount is fast. The
	// grammar is captured by closure, making the per-line `tokenize` call
	// synchronous (Monaco's `TokensProvider.tokenize` returns ILineTokens,
	// not a Promise). The extendscript grammar is a thin wrapper that
	// includes `source.js` plus preprocessor patterns, so the JS grammar
	// is loaded first to satisfy the `include` reference. The JS grammar
	// itself is not used as a `setTokensProvider` (see the `javascript:`
	// branch below) but it MUST be in the Registry for the extendscript
	// grammar's `{ "include": "source.js" }` to resolve.
	ensureExtendscriptLanguage();
	const [, tsGrammar, esGrammar] = await Promise.all([
		loadGrammar("javascript"),
		loadGrammar("typescript"),
		loadGrammar("extendscript"),
	]);
	return {
		// The extendscript grammar is used for the `javascript` model id
		// because the editor's `editorLanguage` is `javascript` for
		// ExtendScript content (the Volar TS service's `isTsDocument`
		// guard rejects any other language id, so the model must be
		// `javascript` for semantic tokens to flow). The extendscript
		// grammar already includes `source.js` via `{ "include":
		// "source.js" }`, so JS tokenization is preserved AND the
		// preprocessor directives (`#target` / `#include` / etc.) gain
		// highlighting. The `extendscript` Monaco id is also kept
		// registered with the same grammar as a fallback for any
		// future dialog that opens the editor with that id directly.
		javascript: monaco.languages.setTokensProvider(
			"javascript",
			makeTokensProvider(esGrammar),
		),
		typescript: monaco.languages.setTokensProvider(
			"typescript",
			makeTokensProvider(tsGrammar),
		),
		extendscript: monaco.languages.setTokensProvider(
			"extendscript",
			makeTokensProvider(esGrammar),
		),
	};
};
