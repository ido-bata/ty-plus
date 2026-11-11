/// <reference lib="webworker" />
import { createTypeScriptWorkerLanguageService } from "@volar/monaco/worker";
import { resolveFileLanguageId } from "@volar/typescript/lib/common.js";
import { initialize } from "monaco-editor/esm/vs/common/initialize.js";
import type { Uri, worker } from "monaco-editor/esm/vs/editor/editor.api.js";
import aeTypes from "types-for-adobe/AfterEffects/22.0/index.d.ts?raw";
import sharedGlobalTypes from "types-for-adobe/shared/global.d.ts?raw";
import sharedJavaScriptTypes from "types-for-adobe/shared/JavaScript.d.ts?raw";
import sharedScriptUiTypes from "types-for-adobe/shared/ScriptUI.d.ts?raw";
import sharedXmpTypes from "types-for-adobe/shared/XMPScript.d.ts?raw";
import { version as tsVersion } from "typescript";
import { create as createTypeScriptService } from "volar-service-typescript";
import { URI } from "vscode-uri";
import { supportsTypeScriptLanguageService } from "./ts-language-service-support";

// TS 7 split the compiler API into `typescript/unstable/*` subpaths. Volar
// 0.0.71 still imports the old `import * as ts from "typescript"` surface, so
// it cannot use the new `API`/`Snapshot` types directly. To keep the worker
// typechecking under TS 7 we hand Volar a `ts`-shaped proxy with the two
// members Volar's language-service plugins reach for (`version` and the
// `ScriptSnapshot.fromString` constructor). Runtime Volar/TS service behavior
// is degraded until volar-service-typescript ships a TS 7-compatible release.
// biome-ignore lint/suspicious/noExplicitAny: legacy ts-shape proxy for TS 7 / volar 0.0.71
const ts: any = {
	version: tsVersion,
	ScriptSnapshot: {
		fromString: (text: string) => ({
			getText: (_start: number, end: number) => text.slice(0, end),
			getLength: () => text.length,
			getChangeRange: () => undefined,
		}),
	},
};

// The proxy above cannot back a language service: `typescript-auto-import-cache`
// reads `ts.LanguageServiceMode.Semantic` and calls `ts.createProjectService`
// while Volar builds the service, and neither member exists on TS 7. Left
// ungated, the first diagnostics request threw a `TypeError` inside the Web
// Worker and killed it. Only hand Volar its plugins when the surface they
// need is actually there — see `ts-language-service-support.ts`.
const languageServicePlugins = supportsTypeScriptLanguageService(ts)
	? createTypeScriptService(ts)
	: [];

const VIRTUAL_DEFS: ReadonlyArray<readonly [string, string]> = [
	[
		"/node_modules/types-for-adobe/shared/JavaScript.d.ts",
		sharedJavaScriptTypes,
	],
	["/node_modules/types-for-adobe/shared/ScriptUI.d.ts", sharedScriptUiTypes],
	["/node_modules/types-for-adobe/shared/XMPScript.d.ts", sharedXmpTypes],
	["/node_modules/types-for-adobe/shared/global.d.ts", sharedGlobalTypes],
	["/node_modules/types-for-adobe/AfterEffects/22.0/index.d.ts", aeTypes],
] as const;

const COMPILER_OPTIONS = {
	allowJs: true,
	allowNonTsExtensions: true,
	// ExtendScript is JS at runtime (`.jsx`), but `types-for-adobe` ships
	// real `.d.ts` definitions. `checkJs: true` is what makes the Volar
	// service surface type errors (typos on `app.*` / `$.*`, assignment
	// to wrong-typed slots) as red squigglies in the editor instead of
	// staying silent. `strict: false` is kept because ExtendScript is
	// dynamic and a strict pass floods the gutter with false positives.
	checkJs: true,
	noLib: false,
	strict: false,
	target: "es2022",
	module: "esnext",
	moduleResolution: "bundler",
	esModuleInterop: false,
	skipLibCheck: true,
} as const;

// The `@volar/monaco` worker uses `model.uri.toString() === uri.toString()`
// (line 47 of `node_modules/@volar/monaco/worker.js`) to find the
// Monaco model that backs a given URI. The default `asUri`/`asFileName`
// pair uses `URI.file` and `uri.fsPath`, which only round-trip for
// `file://` URIs. For our main model URI
// (`inmemory://model/preset.jsx`):
//   - `asFileName(uri)` → `uri.fsPath` → `/preset.jsx`
//     (Monaco's `fsPath` for non-`file` schemes returns the raw path)
//   - `asUri("/preset.jsx")` → `URI.file("/preset.jsx")` → `file:///preset.jsx`
// The vscode-uri URI's `toString()` is `file:///preset.jsx` but the
// Monaco URI's `toString()` is `inmemory://model/preset.jsx` — they
// don't match, the model is never found, the script is never
// registered, and the TS service has no document to analyze. This
// was the root cause of the missing red squigglies after the
// `activateMarkers` wire-up: the diagnostic pipeline is correctly
// wired, but the worker silently has no source file. We detect the
// scheme and round-trip via `toString`/`URI.parse` for non-`file`
// URIs while keeping the standard `file://` behavior for the TS
// `sys` functions (which expect real file paths).
const asUri = (fileName: string): URI => {
	if (fileName.includes("://") && !fileName.startsWith("file://")) {
		return URI.parse(fileName);
	}
	return URI.file(fileName);
};
const asFileName = (uri: Uri): string => {
	if (uri.scheme !== "file") {
		return uri.toString();
	}
	return uri.fsPath;
};

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = () => {
	initialize((ctx: worker.IWorkerContext<Record<string, never>>) => {
		return createTypeScriptWorkerLanguageService({
			typescript: ts,
			compilerOptions: COMPILER_OPTIONS,
			uriConverter: { asUri, asFileName },
			workerContext: ctx,
			env: {
				workspaceFolders: [URI.parse("file:///")],
			},
			languagePlugins: [
				{
					// Delegate languageId detection to Volar's own
					// `resolveFileLanguageId` (handles .js, .jsx, .ts,
					// .tsx, .mjs, .cjs, .mts, .cts, .json). Without this
					// delegation, the main Monaco model URI
					// (`inmemory://model/preset.jsx` after the Code.tsx
					// fix) has no `.d.ts` suffix → this returns undefined
					// → `@volar/language-core/index.js:60` logs
					// `languageId not found for ...` and skips the
					// document entirely. The downstream effect is that
					// `volar-service-typescript`'s `isTsDocument` guard
					// short-circuits and no diagnostics are ever produced
					// — the `activateMarkers` subscription in Code.tsx
					// fires but the worker returns no markers.
					getLanguageId(scriptId) {
						return resolveFileLanguageId(scriptId.path);
					},
					createVirtualCode(scriptId, _languageId, _snapshot) {
						const fileName = asFileName(scriptId as unknown as Uri).replace(
							/\\/g,
							"/",
						);
						const hit = VIRTUAL_DEFS.find(([path]) =>
							fileName.endsWith(path.replace(/^\//, "")),
						);
						if (!hit) return undefined;
						return {
							id: scriptId.toString(),
							languageId: "typescript",
							snapshot: ts.ScriptSnapshot.fromString(hit[1]),
							mappings: [],
							embeddedCodes: [],
						};
					},
				},
			],
			languageServicePlugins,
		});
	});
};
