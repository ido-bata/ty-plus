/// <reference types="vite/client" />

// `import.meta.glob` is provided by `vite/client`; importing the triple-slash
// reference above makes it available in clean-install CI runs where the
// project typeRoots do not pull it in transitively.

declare module "*.wasm" {
	// The oniguruma WASM is inlined as a base64 string by
	// `inlineOnigurumaWasmPlugin` in vite.config.ts. Vite's default `?url`
	// form would produce an absolute path that fails in CEP's `file://`
	// origin, so we use the raw binary form. Vite serves the module as a
	// base64 string default export, which `atob` accepts directly.
	const base64: string;
	export default base64;
}
