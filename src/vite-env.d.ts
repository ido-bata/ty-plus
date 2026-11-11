/// <reference types="vite/client" />

// The wildcard `*.wasm` declaration in
// `src/management/preset/editor/vite-env.d.ts` only matches *relative*
// specifiers, so a bare import like
// `import x from "vscode-oniguruma/release/onig.wasm"` falls through to
// `typeof import("*.wasm")`, which is not assignable to `string`. Mirror
// the same module shape under the absolute path so the `atob(...)` call in
// `textmate.ts` typechecks in every project (main, test, extendscript).
declare module "vscode-oniguruma/release/onig.wasm" {
	const base64: string;
	export default base64;
}
