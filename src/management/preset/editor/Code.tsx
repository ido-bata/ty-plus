import { activateMarkers, registerProviders } from "@volar/monaco";
import type { WorkerLanguageService } from "@volar/monaco/worker";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
// Side-effect imports: register Monaco's built-in JavaScript and TypeScript
// language services. Without these, `monaco.languages.setTokensProvider`
// throws "Cannot set tokens provider for unknown language <id>". The
// `editor.api.js` bundle is language-agnostic; contributions wire languages
// into `ILanguageService` at module-init time. We override their tokenizers
// with TextMate via `setTokensProvider` further down.
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import monacoEditorCss from "monaco-editor/min/vs/editor/editor.main.css?raw";
import { type JSX, useEffect, useRef, useState } from "react";
import { css, cx } from "@/styled-system/css";
import { ensureExtendscriptLanguage, initTextMate } from "./textmate";
import TsVolarWorker from "./typescript-worker?worker";
import { type ResizeGestureEvent, useEditorResize } from "./use-editor-resize";

const MONACO_STYLE_ID = "ty-plus-monaco-library-theme";
const EXTENDSCRIPT_THEME_ID = "ty-plus-extendscript";

const RESIZE_MIN_HEIGHT = 200;
const RESIZE_MAX_HEIGHT = 800;

let extendscriptThemeDefined = false;

const ensureMonacoLibraryTheme = () => {
	if (typeof document === "undefined") return;
	if (document.getElementById(MONACO_STYLE_ID)) return;

	const style = document.createElement("style");
	style.id = MONACO_STYLE_ID;
	style.textContent = monacoEditorCss;
	document.head.appendChild(style);
};

// VS Code's Dark+ color palette, expressed as Monaco theme rules keyed on
// TextMate scope prefixes. Monaco's rule matcher is prefix-based, so a
// rule for `entity.name.class` matches `entity.name.class.js`,
// `entity.name.class.tsx`, etc. The Volar LSP semantic-token rules (12
// short, single-name entries) sit AFTER the TM rules as the fallback for
// tokens that the TM grammar does not classify by a chain we recognize.
// All colors are Dark+ standard values; fontStyle italic on comments.
const ensureExtendscriptTheme = () => {
	if (extendscriptThemeDefined) return;
	monaco.editor.defineTheme(EXTENDSCRIPT_THEME_ID, {
		base: "vs-dark",
		inherit: true,
		rules: [
			// === TextMate scope-prefix rules (Dark+ parity) ===
			{ token: "comment", foreground: "6A9955", fontStyle: "italic" },
			{ token: "string", foreground: "CE9178" },
			{ token: "regexp", foreground: "D16969" },
			{ token: "constant.numeric", foreground: "B5CEA8" },
			{ token: "constant.language", foreground: "569CD6" },
			{ token: "constant.character.escape", foreground: "D7BA7D" },
			{ token: "keyword", foreground: "569CD6" },
			{ token: "keyword.control", foreground: "C586C0" },
			{ token: "storage", foreground: "569CD6" },
			{ token: "storage.type", foreground: "569CD6" },
			{ token: "entity.name.function", foreground: "DCDCAA" },
			{ token: "support.function", foreground: "DCDCAA" },
			{ token: "entity.name.class", foreground: "4EC9B0" },
			{ token: "entity.name.type", foreground: "4EC9B0" },
			{ token: "entity.name.type.module", foreground: "4EC9B0" },
			{ token: "support.class", foreground: "4EC9B0" },
			{ token: "entity.other.attribute-name", foreground: "9CDCFE" },
			{ token: "variable.parameter", foreground: "9CDCFE" },
			{ token: "meta.property-name", foreground: "9CDCFE" },
			{ token: "variable", foreground: "9CDCFE" },
			{ token: "entity.name.tag", foreground: "569CD6" },
			{
				token: "punctuation.definition.template-expression",
				foreground: "C586C0",
			},
			{ token: "invalid", foreground: "F44747" },
			// === Extended TextMate scope coverage (Dark+ parity) ===
			// The JS/TS grammars emit deeply chained scopes (e.g.
			// `source.js → meta.function.js → punctuation.definition.comment.js`).
			// Monaco's rule matcher is prefix-based, so the bare-suffix rules
			// above only catch the root scope; the inner punctuation/meta/
			// support scopes need their own entries to get the right color.
			// Punctuation / structural
			{ token: "punctuation.definition.comment", foreground: "6A9955" },
			{ token: "punctuation.definition.string", foreground: "CE9178" },
			{
				token: "punctuation.definition.string.begin",
				foreground: "CE9178",
			},
			{ token: "punctuation.definition.string.end", foreground: "CE9178" },
			{ token: "punctuation.accessor", foreground: "D4D4D4" },
			{ token: "punctuation.separator", foreground: "D4D4D4" },
			{ token: "punctuation.terminator", foreground: "D4D4D4" },
			{ token: "punctuation.section", foreground: "D4D4D4" },
			{ token: "punctuation.brackets", foreground: "D4D4D4" },
			// Meta (imports / exports / blocks / functions)
			{ token: "meta.import", foreground: "569CD6" },
			{ token: "meta.export", foreground: "569CD6" },
			{ token: "meta.function", foreground: "DCDCAA" },
			{ token: "meta.method", foreground: "DCDCAA" },
			{ token: "meta.class", foreground: "4EC9B0" },
			{ token: "meta.block", foreground: "D4D4D4" },
			{ token: "meta.object-literal", foreground: "D4D4D4" },
			{ token: "meta.object.member", foreground: "9CDCFE" },
			{ token: "meta.parameters", foreground: "9CDCFE" },
			{ token: "meta.property-list", foreground: "9CDCFE" },
			{ token: "meta.property-value", foreground: "CE9178" },
			// Markup / template literals
			{ token: "markup.heading", foreground: "569CD6" },
			{ token: "markup.inline.raw", foreground: "CE9178" },
			{ token: "string.template", foreground: "CE9178" },
			{
				token: "punctuation.definition.string.template.begin",
				foreground: "CE9178",
			},
			{
				token: "punctuation.definition.string.template.end",
				foreground: "CE9178",
			},
			{ token: "punctuation.section.embedded", foreground: "DCDCAA" },
			// Support (constants, types, variables — distinguishes ExtendScript globals)
			{ token: "support.constant", foreground: "4FC1FF" },
			{ token: "support.type", foreground: "4EC9B0" },
			{ token: "support.type.property-name", foreground: "9CDCFE" },
			// ExtendScript-specific globals declared as `var` in
			// `types-for-adobe/shared/global.d.ts` (app, $, system, …) come
			// out of the TS service as plain `variable` semantic tokens —
			// which the theme paints light blue, the same as user variables,
			// so they are visually indistinguishable from local script
			// identifiers. The extendscript grammar's `extendscript-globals`
			// pattern (grammars/Extendscript.tmLanguage.json) tags these
			// names with `support.type.extendscript`; TextMate scopes are
			// more specific than semantic tokens in Monaco's rule matcher
			// and win. We deliberately use blue (569CD6), the Dark+ keyword
			// color, instead of the light blue variable color, so the
			// distinction reads at a glance.
			{ token: "support.type.extendscript", foreground: "569CD6" },
			{ token: "support.variable", foreground: "9CDCFE" },
			{ token: "support.variable.property", foreground: "9CDCFE" },
			// Entities
			{ token: "entity.name.namespace", foreground: "4EC9B0" },
			{ token: "entity.other.inherited-class", foreground: "4EC9B0" },
			{ token: "variable.other.readwrite", foreground: "9CDCFE" },
			{ token: "variable.other.constant", foreground: "4FC1FF" },
			{ token: "variable.other.property", foreground: "9CDCFE" },
			// Preprocessor (ExtendScript `#target` / `#include` / etc.)
			{ token: "keyword.control.preprocessor", foreground: "C586C0" },
			{
				token: "keyword.control.preprocessor.extendscript",
				foreground: "C586C0",
			},
			{ token: "string.unquoted.preprocessor", foreground: "CE9178" },
			{
				token: "string.unquoted.preprocessor.extendscript",
				foreground: "CE9178",
			},
			// === Volar LSP semantic-token rules (fallback for bare types) ===
			{ token: "namespace", foreground: "4EC9B0" },
			{ token: "class", foreground: "4EC9B0" },
			{ token: "interface", foreground: "4EC9B0" },
			{ token: "enum", foreground: "4EC9B0" },
			{ token: "type", foreground: "4EC9B0" },
			{ token: "typeParameter", foreground: "4EC9B0" },
			{ token: "enumMember", foreground: "4FC1FF" },
			{ token: "function", foreground: "DCDCAA" },
			{ token: "method", foreground: "DCDCAA" },
			{ token: "variable", foreground: "9CDCFE" },
			{ token: "parameter", foreground: "9CDCFE" },
			{ token: "property", foreground: "9CDCFE" },
		],
		colors: {},
	});
	extendscriptThemeDefined = true;
};

const ensureMonacoEnvironment = () => {
	if (typeof window === "undefined") return;

	const win = window as Window & {
		MonacoEnvironment?: {
			getWorker: (moduleId: string, label: string) => Worker;
		};
	};

	if (win.MonacoEnvironment?.getWorker) return;

	win.MonacoEnvironment = {
		getWorker: (_moduleId, _label) => {
			// Volar worker (typescript-worker.ts) handles JavaScript/TypeScript
			// language services via createWebWorker below. Returning a generic
			// editor worker here satisfies Monaco's contract without loading
			// the now-unused built-in TS worker bundle.
			return new EditorWorker();
		},
	};
};

let volarWorker: monaco.editor.MonacoWebWorker<WorkerLanguageService> | null =
	null;

const ensureVolarWorker = () => {
	if (!volarWorker) {
		volarWorker = monaco.editor.createWebWorker<WorkerLanguageService>({
			worker: new TsVolarWorker(),
		});
	}
	return volarWorker;
};

// Same language configuration for JavaScript and TypeScript — Monaco
// already has defaults for these ids, but those defaults don't pin the
// comment/auto-closing/surrounding behavior for `notIn: ["string"]` (the
// classic "double-`"`" bug). Registering the same object to both ids
// makes ExtendScript and TS behave identically. The preprocessor
// directives (#target, #include) live at line start and don't need
// `indentationRules` special-casing.
const EXTENDSCRIPT_LANG_CONFIG: monaco.languages.LanguageConfiguration = {
	comments: { lineComment: "//", blockComment: ["/*", "*/"] },
	brackets: [
		["{", "}"],
		["[", "]"],
		["(", ")"],
	],
	autoClosingPairs: [
		{ open: "{", close: "}" },
		{ open: "[", close: "]" },
		{ open: "(", close: ")" },
		{ open: '"', close: '"', notIn: ["string"] },
		{ open: "'", close: "'", notIn: ["string", "comment"] },
		{ open: "`", close: "`", notIn: ["string", "comment"] },
		{ open: "/*", close: " */", notIn: ["string"] },
	],
	surroundingPairs: [
		{ open: "{", close: "}" },
		{ open: "[", close: "]" },
		{ open: "(", close: ")" },
		{ open: '"', close: '"' },
		{ open: "'", close: "'" },
		{ open: "`", close: "`" },
	],
	indentationRules: {
		increaseIndentPattern: /({[^}]*|\([^)]*|\[[^\]]*|^\s*(?:case|default)\b)/,
		decreaseIndentPattern: /^\s*[}\])]/,
	},
};

let languageConfigRegistered = false;

const ensureLanguageConfigurations = () => {
	if (languageConfigRegistered) return;
	// `monaco.languages.setLanguageConfiguration` throws
	// `Cannot set configuration for unknown language <id>` if the language
	// is not registered first. `javascript` and `typescript` are registered
	// by the basic-languages contribution imports at the top of this file;
	// `extendscript` is registered here (the same call is also made from
	// `initTextMate`, but that path is async and would not gate this
	// synchronous init). The guard in `ensureExtendscriptLanguage` makes
	// the double-call a no-op.
	ensureExtendscriptLanguage();
	for (const lang of ["javascript", "typescript", "extendscript"] as const) {
		monaco.languages.setLanguageConfiguration(lang, EXTENDSCRIPT_LANG_CONFIG);
	}
	languageConfigRegistered = true;
};

// VS Code-style snippet expansions. The body uses Monaco's tab-stop
// syntax ($1, $2, ...; $0 is the final cursor). We register one
// provider per language; Monaco merges the results with the Volar
// completion items.
const SNIPPETS: Record<
	string,
	{ prefix: string; body: string; description: string }
> = {
	if: {
		prefix: "if",
		body: "if ($1) {\n\t$0\n}",
		description: "if block",
	},
	else: {
		prefix: "else",
		body: "else {\n\t$0\n}",
		description: "else block",
	},
	for: {
		prefix: "for",
		body: "for (let ${1:i} = 0; $1 < ${2:N}; $1++) {\n\t$0\n}",
		description: "for loop",
	},
	while: {
		prefix: "while",
		body: "while ($1) {\n\t$0\n}",
		description: "while loop",
	},
	fn: {
		prefix: "fn",
		body: "function ${1:name}($2) {\n\t$0\n}",
		description: "function",
	},
	try: {
		prefix: "try",
		body: "try {\n\t$1\n} catch (${2:e}) {\n\t$0\n}",
		description: "try / catch",
	},
	log: {
		prefix: "log",
		body: "$.writeln(${1:value});",
		description: "ExtendScript log",
	},
};

const snippetDisposables: monaco.IDisposable[] = [];

const ensureSnippets = () => {
	if (snippetDisposables.length > 0) return;
	for (const lang of ["javascript", "typescript"] as const) {
		snippetDisposables.push(
			monaco.languages.registerCompletionItemProvider(lang, {
				provideCompletionItems: (model, position) => {
					const word = model.getWordUntilPosition(position);
					const range = new monaco.Range(
						position.lineNumber,
						word.startColumn,
						position.lineNumber,
						word.endColumn,
					);
					const suggestions = Object.values(SNIPPETS).map((s) => ({
						label: s.prefix,
						kind: monaco.languages.CompletionItemKind.Snippet,
						insertText: s.body,
						insertTextRules:
							monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: s.description,
						range,
					}));
					return { suggestions };
				},
			}),
		);
	}
};

export type CodeEditorValue = string;

export type CodeEditorProps = {
	value: CodeEditorValue;
	onChange: (value: CodeEditorValue) => void;
	language?: string;
	readOnly?: boolean;
	className?: string;
};

const createMonacoEditor = (
	container: HTMLElement,
	model: monaco.editor.ITextModel,
	isReadOnly: boolean,
	onChangeCallback: (value: string) => void,
) => {
	const instance = monaco.editor.create(container, {
		model,
		theme: EXTENDSCRIPT_THEME_ID,
		readOnly: isReadOnly,
		automaticLayout: true,
		minimap: { enabled: false },
		scrollBeyondLastLine: false,
		fontSize: 13,
		lineNumbers: "on",
		renderLineHighlight: "line",
		padding: { top: 8, bottom: 8 },
		// VS Code-grade niceties (all in IEditorOptions for Monaco 0.55.1):
		"semanticHighlighting.enabled": true,
		tabCompletion: "on",
		bracketPairColorization: { enabled: true },
		matchBrackets: "always",
		guides: { bracketPairs: true, indentation: true },
		renderWhitespace: "selection",
		quickSuggestions: { other: true, comments: false, strings: false },
		quickSuggestionsDelay: 0,
		parameterHints: { enabled: true, cycle: true },
		suggestOnTriggerCharacters: true,
		acceptSuggestionOnEnter: "on",
		formatOnPaste: true,
		stickyScroll: { enabled: true },
		folding: true,
		foldingStrategy: "indentation",
		links: true,
		selectionHighlight: true,
		occurrencesHighlight: "singleFile",
		cursorBlinking: "smooth",
		cursorSmoothCaretAnimation: "on",
		smoothScrolling: true,
		mouseWheelZoom: false,
	});

	instance.onDidChangeModelContent(() => {
		onChangeCallback(instance.getValue());
	});

	return instance;
};

// ── ResizeHandle sub-component ─────────────────────────────────────────────────

const resizeHandleClass = css({
	height: "3",
	cursor: "ns-resize",
	touchAction: "none",
	userSelect: "none",
});

const editorShellClass = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	overflow: "hidden",
});

const editorErrorClass = css({
	display: "flex",
	alignItems: "flex-start",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "status.error",
	backgroundColor: "status.error/10",
	padding: "2",
	fontSize: "xs",
	color: "status.error",
});

function ResizeHandle(props: {
	editorHeight: number;
	onResizeStart: (event: ResizeGestureEvent) => void;
	onResizeMove: (event: ResizeGestureEvent) => void;
	onResizeEnd: (event: ResizeGestureEvent) => void;
	onResizeMouseStart: (event: React.MouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
	const {
		editorHeight,
		onResizeStart,
		onResizeMove,
		onResizeEnd,
		onResizeMouseStart,
	} = props;
	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			tabIndex={0}
			aria-label="Resize code editor"
			aria-valuenow={editorHeight}
			aria-valuemin={RESIZE_MIN_HEIGHT}
			aria-valuemax={RESIZE_MAX_HEIGHT}
			onPointerDown={onResizeStart}
			onPointerMove={onResizeMove}
			onPointerUp={onResizeEnd}
			onPointerCancel={onResizeEnd}
			onMouseDown={onResizeMouseStart}
			className={resizeHandleClass}
			style={{ cursor: "ns-resize" }}
			data-ty-code-resize-handle=""
		/>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

export function CodeEditor(props: CodeEditorProps): JSX.Element {
	const {
		value,
		onChange,
		language = "javascript",
		readOnly = false,
		className,
	} = props;
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const editorReadyRef = useRef(false);
	const onChangeRef = useRef(onChange);
	const valueRef = useRef(value);
	const [volarError, setVolarError] = useState<string | null>(null);
	const {
		editorHeight,
		onResizeStart,
		onResizeMove,
		onResizeEnd,
		onResizeMouseStart,
	} = useEditorResize({
		minHeight: RESIZE_MIN_HEIGHT,
		maxHeight: RESIZE_MAX_HEIGHT,
	});

	// Update refs after render to avoid React Compiler warning
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => {
		valueRef.current = value;
	}, [value]);

	useEffect(() => {
		if (!containerRef.current) return () => {};

		ensureMonacoLibraryTheme();
		ensureExtendscriptTheme();
		ensureMonacoEnvironment();
		ensureLanguageConfigurations();
		ensureSnippets();

		const abortController = new AbortController();
		const isAborted = () => abortController.signal.aborted;
		let tmDisposables: monaco.IDisposable[] = [];
		let volarDisposables: monaco.IDisposable[] = [];
		let layoutRaf: number | null = null;
		let layoutTimer: ReturnType<typeof setTimeout> | null = null;
		// The editor model is always `javascript` (or whatever the caller
		// passed) — NEVER `extendscript` — even for ExtendScript content.
		// The Volar TS service plugin's `isTsDocument` guard at
		// `volar-service-typescript/lib/plugins/semantic.js:777` only
		// returns semantic tokens for `languageId ∈ {javascript,
		// typescript, javascriptreact, typescriptreact}`. Any other id
		// (including `extendscript`) short-circuits the provider, so
		// `app`, `$` etc. would be classified by TextMate as plain
		// variables. The TextMate tokenizer still uses the extendscript
		// grammar (see textmate.ts) so preprocessor directives are
		// highlighted. The unused `extendscript` Monaco id is kept
		// registered for future direct use.
		const editorLanguage =
			language === "extendscript" ? "javascript" : language;

		// Give the main model a URI with a file extension matching
		// `editorLanguage` so the Volar worker's `getLanguageId`
		// plugin can classify it as a JS/TS document. Monaco's
		// default `inmemory://model/N` URI has no extension, which
		// would make the worker return `undefined` for `languageId`
		// and `@volar/language-core/index.js:60` would skip the
		// document entirely — no diagnostics, no red squigglies.
		const modelExtension = editorLanguage === "typescript" ? "ts" : "jsx";

		// Create the editor synchronously so a working surface is visible
		// immediately, then layer TextMate + Volar in the background. If
		// either enhancement fails (WASM fetch, grammar parse, worker spawn)
		// the editor must still render — TextMate is a quality-of-life
		// improvement, not a prerequisite.
		let editor: monaco.editor.IStandaloneCodeEditor | null = null;
		let model: monaco.editor.ITextModel | null = null;
		// Single shared cleanup used by both the catch path (editor/model
		// creation threw) and the effect return. Re-running it is safe
		// because every handle is nulled or guarded, and the abort signal
		// keeps the async TextMate/Volar branches from racing against a
		// torn-down surface.
		const cleanup = () => {
			abortController.abort();
			if (layoutRaf !== null) {
				cancelAnimationFrame(layoutRaf);
				layoutRaf = null;
			}
			if (layoutTimer !== null) {
				clearTimeout(layoutTimer);
				layoutTimer = null;
			}
			for (const d of tmDisposables) d.dispose();
			for (const d of volarDisposables) d.dispose();
			const currentEditor = editorRef.current;
			if (currentEditor) {
				currentEditor.dispose();
				editorRef.current = null;
			}
			// The model is pre-created (see `monaco.editor.createModel`
			// below) and passed to the editor via the `model` option,
			// so Monaco does NOT own it — `editor.dispose()` leaves it
			// in the global model registry. Dispose it explicitly to
			// avoid leaking the model across re-renders.
			model?.dispose();
			model = null;
			editor = null;
			editorReadyRef.current = false;
		};
		try {
			const modelUri = monaco.Uri.parse(
				`inmemory://model/preset.${modelExtension}`,
			);
			model = monaco.editor.createModel(
				valueRef.current,
				editorLanguage,
				modelUri,
			);
			editor = createMonacoEditor(
				containerRef.current,
				model,
				readOnly,
				(next) => {
					if (editorReadyRef.current) {
						onChangeRef.current(next);
					}
				},
			);
			editorRef.current = editor;
			editorReadyRef.current = true;

			layoutRaf = requestAnimationFrame(() => {
				if (!isAborted()) editor?.layout();
			});
			layoutTimer = setTimeout(() => {
				if (!isAborted()) editor?.layout();
			}, 0);
		} catch (err) {
			console.error("[CodeEditor] Failed to create Monaco editor:", err);
			if (!isAborted()) {
				setVolarError(
					err instanceof Error ? err.message : "Editor creation failed",
				);
			}
			cleanup();
			return cleanup;
		}

		// TextMate + Volar are best-effort. The first tokenize pass may run
		// without providers (no syntax coloring yet); once setTokensProvider
		// resolves, Monaco re-tokenizes the visible lines.
		initTextMate()
			.then((tm) => {
				if (isAborted()) {
					tm.javascript.dispose();
					tm.typescript.dispose();
					tm.extendscript.dispose();
					return;
				}
				tmDisposables = [tm.javascript, tm.typescript, tm.extendscript];
			})
			.catch((err: unknown) => {
				console.error("[CodeEditor] TextMate init failed:", err);
				if (!isAborted()) {
					setVolarError(
						`TextMate: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			})
			.then(async () => {
				if (isAborted()) return;
				const syncUri = editor?.getModel()?.uri;
				if (!syncUri) return;
				const worker = ensureVolarWorker();
				if (!worker) return;
				try {
					volarDisposables = [
						activateMarkers(
							worker,
							["javascript", "typescript"],
							"ty-plus-volar",
							() => (syncUri ? [syncUri] : []),
							monaco.editor,
						),
					];
					const providers = await Promise.all(
						(["javascript", "typescript"] as const).map((lang) =>
							registerProviders(
								worker,
								lang,
								() => (syncUri ? [syncUri] : []),
								monaco.languages,
							),
						),
					);
					if (isAborted()) return;
					volarDisposables = providers;
					setVolarError(null);
				} catch (err) {
					console.error("[CodeEditor] Volar worker init failed:", err);
					if (!isAborted()) {
						setVolarError(
							err instanceof Error ? err.message : "Volar worker init failed",
						);
					}
				}
			})
			.catch(() => {
				// upstream handlers already logged + reported
			});

		return () => {
			if (layoutTimer !== null) clearTimeout(layoutTimer);
			if (layoutRaf !== null) cancelAnimationFrame(layoutRaf);
			cleanup();
		};
	}, [language, readOnly]);

	// Sync external value changes
	useEffect(() => {
		if (editorReadyRef.current && editorRef.current && !readOnly) {
			const current = editorRef.current.getValue();
			if (current !== value) {
				editorRef.current.setValue(value);
			}
		}
	}, [value, readOnly]);

	return (
		<div className={cx(editorShellClass, className)}>
			{volarError && (
				<div role="alert" className={editorErrorClass}>
					[Volar] {volarError}
				</div>
			)}
			<div
				ref={containerRef}
				style={{
					width: "100%",
					height: `${editorHeight}px`,
					minHeight: `${RESIZE_MIN_HEIGHT}px`,
				}}
			/>
			<ResizeHandle
				editorHeight={editorHeight}
				onResizeStart={onResizeStart}
				onResizeMove={onResizeMove}
				onResizeEnd={onResizeEnd}
				onResizeMouseStart={onResizeMouseStart}
			/>
		</div>
	);
}
