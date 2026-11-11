/**
 * Empty stub for Node.js builtins that some modules transitively import
 * from the CEP runtime side (e.g. `node:child_process` via
 * `src/management/ipc/transport.ts`). Vite externalizes these for browser
 * compatibility, which causes
 * `Error: Module "node:child_process" has been externalized for browser
 * compatibility. Cannot access "node:child_process.spawn" in client code.`
 * at first request.
 *
 * In Storybook we never actually need the Node-side behaviour — the
 * stories that reach this module only do so through decorative imports
 * that we cannot easily split out of the production code path without a
 * backward-compat shim. We export inert stand-ins so the optimizer scan
 * completes and the preview boots. Any code path that actually invokes
 * `spawn()` etc. from a story is broken by design (the story would never
 * have done anything useful at runtime anyway).
 *
 * The same file backs BOTH `node:fs` and `node:fs/promises` (see the
 * alias map in `main.ts`). Both surfaces are exported — top-level named
 * functions for `node:fs/promises` (e.g. `await import("node:fs/promises")
 * .then(m => m.readFile(...))`) AND a `promises` object for any code that
 * destructures from it. Missing either one yields
 * `undefined is not a function` at runtime once a story transitively
 * touches a storage/IPC barrel.
 */

const noop = () => undefined;
const noopAsync = async () => undefined;

export const spawn = noop;
export const execFileSync = noop;
export const ChildProcess = class {};

export const EventEmitter = class {
	constructor() {}
	on() {
		return this;
	}
	off() {
		return this;
	}
	emit() {
		return true;
	}
	removeListener() {
		return this;
	}
	addListener() {
		return this;
	}
	once() {
		return this;
	}
	listenerCount() {
		return 0;
	}
};

// `node:fs/promises` — top-level named exports. Real `node:fs/promises`
// exposes these directly on the module namespace, so callers like
// `await import("node:fs/promises").then(m => m.readFile(...))` must get
// back a callable, not `undefined`. Keep this list in sync with the
// `promises = { ... }` object below — both surfaces describe the same
// module.
export const readFile = noopAsync;
export const writeFile = noopAsync;
export const mkdir = noopAsync;
export const rm = noopAsync;
export const stat = noopAsync;
export const readdir = noopAsync;

export const promises = {
	readFile: noopAsync,
	writeFile: noopAsync,
	mkdir: noopAsync,
	rm: noopAsync,
	stat: noopAsync,
	readdir: noopAsync,
};

export const readFileSync = noop;
export const writeFileSync = noop;
export const existsSync = () => false;

export const createHash = () => ({
	update() {
		return this;
	},
	digest() {
		return "";
	},
});

export const randomBytes = (n = 0) => Buffer.alloc(n);

// `node:path` — Storybook's preview-api / builder / chromatic-style
// internals transitively import a wide range of path helpers
// (basename, delimiter, dirname, extname, isAbsolute, join, normalize,
// parse, posix, relative, resolve, sep, win32) during Vitest's
// rolldown-based test bundle pass. Returning inert stand-ins keeps the
// optimizer scan complete; nothing in the Storybook test render path
// actually evaluates a filesystem path through this alias. The `posix`
// and `win32` sub-modules are themselves proxies so they don't have to
// enumerate every nested function.
const pathProxy = new Proxy(
	{},
	{
		get: (_target, prop) => {
			if (prop === "sep") return "/";
			if (prop === "delimiter") return ":";
			if (prop === "posix" || prop === "win32") return pathProxy;
			// Default: a function returning "" for any other helper
			// (basename, dirname, extname, isAbsolute, join, normalize,
			// parse, relative, resolve, format, etc.). Storybook never
			// reads the result back from these calls under Vitest.
			return () => "";
		},
	},
);
export const basename = pathProxy.basename;
export const delimiter = pathProxy.delimiter;
export const dirname = pathProxy.dirname;
export const extname = pathProxy.extname;
export const isAbsolute = pathProxy.isAbsolute;
export const join = pathProxy.join;
export const normalize = pathProxy.normalize;
export const parse = pathProxy.parse;
export const posix = pathProxy.posix;
export const relative = pathProxy.relative;
export const resolve = pathProxy.resolve;
export const sep = pathProxy.sep;
export const win32 = pathProxy.win32;

export default {};
