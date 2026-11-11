// Central diagnostic logger (Issue #129).
//
// The Release build runs `vite.config.ts#dropConsoleLogInfoPlugin`, which
// strips `console.log` and `console.info` calls from every shipped file. The
// legacy debug-console relied on the panel calling `console.log/info` directly,
// so the in-memory buffer received nothing in production even though the
// monkey-patched interceptor was installed.
//
// `logger.ts` is the canonical sink for diagnostic events. It owns:
//   - the ring buffer of `LogEntry`
//   - the subscriber set the debug console UI listens on
//   - per-source loggers (`createLogger(source)`) so call sites do not have to
//     thread a source string through every log call
//   - convenience helpers (`logInfo` / `logWarn` / `logError` / `logDebug` /
//     `logLog`) for ad-hoc one-off events
//
// The legacy `interceptor.ts` continues to monkey-patch `console.*` and
// forwards intercepted calls into `logger.log` so any call site that has not
// migrated yet still contributes to the diagnostic sink.
//
// `vite.config.ts#dropConsoleLogInfoPlugin` whitelists this file path so
// `console.*` calls inside it (currently only used for DevTools visibility
// during development) survive the production transform. Production log
// emission never relies on `console.*` going through — the ring buffer is the
// source of truth.
//
// The ring buffer's default capacity is 1000, matching the upper bound
// adopted in Issue #79 for the shared-log retention cap and the in-memory
// buffer cap. The capacity is configurable for tests.

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

/**
 * Identifies which surface / subsystem produced a log entry.
 *
 * Kept as a closed union: new sources must be added here, otherwise the
 * TypeScript narrowing around `LogEntry.source` leaks `string`.
 */
export type LogSource =
	| "panel"
	| "modeless"
	| "host-bridge"
	| "online-runtime"
	| "preset-execution"
	| "operation-worker"
	| "debug-console"
	| "workspace"
	| "boot"
	| "console-interceptor";

export type LogContext = Readonly<Record<string, unknown>>;

export type LogEntry = {
	readonly id: string;
	readonly level: LogLevel;
	readonly source: LogSource;
	/** ms since epoch; sortable, no Date object lifetime concerns */
	readonly timestamp: number;
	readonly message: string;
	/** Optional short identifier of the call site's action (e.g. "boot", "probe"). */
	readonly action?: string;
	/** Optional structured context. Free-form but treated as opaque JSON. */
	readonly context?: LogContext;
};

export type LogSubscriber = (entries: readonly LogEntry[]) => void;

export type LogOptions = {
	action?: string;
	context?: LogContext;
};

export type SurfaceLogger = {
	info(message: string, opts?: LogOptions): void;
	warn(message: string, opts?: LogOptions): void;
	error(message: string, opts?: LogOptions): void;
	log(message: string, opts?: LogOptions): void;
	debug(message: string, opts?: LogOptions): void;
};

const DEFAULT_CAPACITY = 1000;

/**
 * Process-wide ring buffer + subscriber fan-out.
 *
 * Implemented as a class so tests can construct isolated instances via
 * `_installTestBus` while production code uses the singleton returned by
 * `getBus()`.
 */
export class LogBus {
	private readonly _capacity: number;
	private _buffer: LogEntry[] = [];
	private _subscribers = new Set<LogSubscriber>();
	private _seq = 0;

	constructor(capacity: number = DEFAULT_CAPACITY) {
		if (!Number.isFinite(capacity) || capacity <= 0) {
			throw new Error(`LogBus capacity must be > 0, got ${capacity}`);
		}
		this._capacity = Math.floor(capacity);
	}

	get capacity(): number {
		return this._capacity;
	}

	emit(entry: LogEntry): void {
		this._buffer.push(entry);
		if (this._buffer.length > this._capacity) {
			// Drop oldest. The 1000-entry cap means we never approach JS heap
			// limits and the per-message size cap (256 / 4096 bytes) keeps each
			// entry bounded regardless of payload.
			this._buffer.shift();
		}
		for (const sub of this._subscribers) {
			try {
				sub(this._buffer);
			} catch (err) {
				// Subscribers must not break the bus. Re-throw in development so
				// test failures surface; in production swallow so a misbehaving
				// UI does not silently drop subsequent logs.
				if (readEnv("NODE_ENV") !== "production") {
					throw err;
				}
			}
		}
	}

	subscribe(fn: LogSubscriber): () => void {
		this._subscribers.add(fn);
		// Emit the current buffer immediately so a late subscriber does not
		// have to wait for the next event to render.
		try {
			fn(this._buffer);
		} catch {
			/* subscriber init failure is the subscriber's problem */
		}
		return () => {
			this._subscribers.delete(fn);
		};
	}

	getEntries(): readonly LogEntry[] {
		return this._buffer;
	}

	clear(): void {
		this._buffer = [];
		for (const sub of this._subscribers) {
			try {
				sub(this._buffer);
			} catch {
				/* see subscribe() */
			}
		}
	}

	/** Visible for tests only. */
	_resetForTests(): void {
		this._buffer = [];
		this._subscribers.clear();
		this._seq = 0;
	}

	_nextId(): string {
		this._seq += 1;
		return `${Date.now()}-${this._seq}`;
	}
}

const defaultBus = new LogBus();

/** Returns the process-wide default bus. Visible for tests. */
export const getBus = (): LogBus => defaultBus;

/**
 * Reset the default bus state. Visible for tests only.
 */
export const _resetBusForTests = (): void => {
	defaultBus._resetForTests();
};

const readEnv = (key: string): string | undefined => {
	try {
		// `process` is undefined in the browser-side Storybook test runner;
		// guard the lookup so the module is portable between Node (CEP main,
		// vitest unit) and browser (Storybook browser project, renderer).
		const proc = (
			globalThis as { process?: { env?: Record<string, string | undefined> } }
		).process;
		return proc?.env?.[key];
	} catch {
		return undefined;
	}
};

let _devConsoleEnabled =
	readEnv("NODE_ENV") !== "production" &&
	readEnv("TY_PLUS_LOGGER_CONSOLE") !== "off";

/**
 * Toggle the per-call `console.*` debug output. Tests use this to silence
 * the logger; production defaults to off (the production plugin strips
 * `console.log/info` anyway, and we do not want a stray warning to leak
 * onto the user's DevTools).
 *
 * The logger always forwards through `_originalConsole` (captured at module
 * load before any monkey-patching). This is what avoids the recursion
 * between `console.log` → interceptor → `logger.log` → `console.log` →
 * interceptor → ...
 */
export const _setDevConsoleEnabled = (enabled: boolean): void => {
	_devConsoleEnabled = enabled;
};

type DevConsoleKey = "log" | "info" | "warn" | "error" | "debug";

const LEVEL_TO_CONSOLE: Record<LogLevel, DevConsoleKey> = {
	log: "log",
	info: "info",
	warn: "warn",
	error: "error",
	debug: "debug",
};

/**
 * Snapshot of the pristine console methods at module-load time. The
 * interceptor in `console/interceptor.ts` monkey-patches `console.*` and
 * forwards intercepted calls back into `logger.log`; using the pristine
 * copies here breaks that loop.
 */
const _originalConsole: Record<DevConsoleKey, (...args: unknown[]) => void> = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
	debug: console.debug.bind(console),
};

/**
 * Append one entry to the bus. Call sites should use `createLogger(source)`
 * or the convenience helpers, not this directly.
 */
export const log = (
	level: LogLevel,
	source: LogSource,
	message: string,
	options?: LogOptions,
): LogEntry => {
	const entry: LogEntry = {
		id: defaultBus._nextId(),
		level,
		source,
		timestamp: Date.now(),
		message,
		...(options?.action ? { action: options.action } : {}),
		...(options?.context ? { context: options.context } : {}),
	};
	defaultBus.emit(entry);
	if (_devConsoleEnabled) {
		const target = LEVEL_TO_CONSOLE[level];
		const fn = _originalConsole[target];
		fn(message);
	}
	return entry;
};

/**
 * Convenience wrapper bound to a source. All call sites should prefer this
 * over the raw `log()` so the source is encoded once at construction.
 */
export const createLogger = (source: LogSource): SurfaceLogger => {
	const call = (
		level: LogLevel,
		message: string,
		options?: LogOptions,
	): void => {
		log(level, source, message, options);
	};
	return {
		info: (message, options) => call("info", message, options),
		warn: (message, options) => call("warn", message, options),
		error: (message, options) => call("error", message, options),
		log: (message, options) => call("log", message, options),
		debug: (message, options) => call("debug", message, options),
	};
};

export const logInfo = (
	source: LogSource,
	message: string,
	options?: LogOptions,
): LogEntry => log("info", source, message, options);

export const logWarn = (
	source: LogSource,
	message: string,
	options?: LogOptions,
): LogEntry => log("warn", source, message, options);

export const logError = (
	source: LogSource,
	message: string,
	options?: LogOptions,
): LogEntry => log("error", source, message, options);

export const logDebug = (
	source: LogSource,
	message: string,
	options?: LogOptions,
): LogEntry => log("debug", source, message, options);

export const logLog = (
	source: LogSource,
	message: string,
	options?: LogOptions,
): LogEntry => log("log", source, message, options);

/** Subscribe to log events. Returns an unsubscribe function. */
export const subscribeLog = (fn: LogSubscriber): (() => void) =>
	defaultBus.subscribe(fn);

/** Snapshot of the current ring buffer. */
export const getEntries = (): readonly LogEntry[] => defaultBus.getEntries();

/** Clear the ring buffer and notify subscribers. */
export const clearEntries = (): void => {
	defaultBus.clear();
};

/**
 * Default-capacity constant exposed for tests so they can assert the buffer
 * matches the contract adopted in Issue #79 (1000-entry upper bound).
 */
export const DEFAULT_LOG_CAPACITY = DEFAULT_CAPACITY;

/**
 * Module path used by `vite.config.ts#dropConsoleLogInfoPlugin` to skip the
 * production strip on this file. Exported as a constant so the plugin
 * imports the same string the codebase uses — no drift between the regex
 * in the plugin and the canonical file path.
 */
export const LOGGER_MODULE_PATH_SUFFIX = "/src/management/debug/logger.ts";
