import {
	isSanitizedLogWirePayload,
	toLogWirePayload,
	wirePayloadToLogMessage,
} from "@/management/debug/console/interceptor";
import type {
	LogLevel,
	LogMessage,
	WirePayload,
} from "@/management/debug/console/types";
import {
	deleteCepSharedData,
	getCepSharedData,
	setCepSharedData,
	setCepSharedDataMax,
} from "@/management/storage/cep";

const LOG_SHARED_KEY = "ty_plus_debug_logs_v1";
/**
 * Issue #151 round-4: cross-surface Clear boundary. Stores the
 * wall-clock epoch (ms) at which the operator pressed Clear. Every
 * read path (`readSharedLogs`, `subscribeSharedLogs`'s initial push,
 * `writeSharedLogs`'s write-side filter, and the cross-surface
 * replay responder) drops any entry whose `timestamp` is strictly
 * less than this epoch. The value is monotonic: a second Clear
 * always advances it forward, so concurrent surfaces cannot
 * resurrect an entry one of them wiped. Survives panel close +
 * reopen and AE process restart because it lives in CEP shared
 * storage.
 */
const CLEARED_AT_KEY = "ty_plus_debug_logs_cleared_at_v1";
// Issue #138: alignment with the canonical LogBus capacity. The same
// 1000-entry cap is used by `logger.ts#DEFAULT_CAPACITY`,
// `interceptor.ts#MAX_MESSAGES`, and `DEBUG_LOG_REPLAY_MAX_ENTRIES`,
// so the retained log history can hold a full boot log plus a single
// busy session without sliding past user-visible entries.
const MAX_SHARED_LOGS = 1000;

type LegacyConsoleMessage = {
	id: string;
	level: string;
	args: unknown[];
	timestamp: string;
	source?: {
		file?: string;
		line?: number;
		column?: number;
		url?: string;
	};
};

const VALID_LEVELS: ReadonlySet<string> = new Set([
	"log",
	"info",
	"warn",
	"error",
	"debug",
]);

const isLegacyConsoleMessage = (
	item: unknown,
): item is LegacyConsoleMessage => {
	if (item === null || typeof item !== "object") return false;
	const o = item as Record<string, unknown>;
	return (
		typeof o.id === "string" &&
		typeof o.level === "string" &&
		VALID_LEVELS.has(o.level) &&
		Array.isArray(o.args) &&
		typeof o.timestamp === "string"
	);
};

type SlimConsoleMessage = {
	level: string;
	text: string;
	timestamp: string;
};

const isSlimConsoleMessage = (item: unknown): item is SlimConsoleMessage => {
	if (item === null || typeof item !== "object") return false;
	const o = item as Record<string, unknown>;
	return (
		typeof o.level === "string" &&
		VALID_LEVELS.has(o.level) &&
		typeof o.text === "string" &&
		typeof o.timestamp === "string" &&
		!("v" in o) &&
		!("args" in o)
	);
};

const slimToLogMessage = (slim: SlimConsoleMessage): LogMessage => ({
	id: `legacy:${slim.level}:${slim.timestamp}:${Math.random().toString(36).slice(2, 8)}`,
	level: slim.level as LogLevel,
	text: slim.text,
	args: [],
	timestamp: new Date(slim.timestamp),
	source: undefined,
});

const fmtArg = (a: unknown): string => {
	if (a === null) return "null";
	if (a === undefined) return "undefined";
	if (typeof a === "string") return a;
	if (typeof a === "number" || typeof a === "boolean" || typeof a === "bigint")
		return String(a);
	if (a instanceof Error) return `${a.name}: ${a.message}`;
	try {
		const s = JSON.stringify(a);
		if (s !== undefined) return s.length > 200 ? `${s.slice(0, 200)}…` : s;
	} catch {
		/* circular etc */
	}
	return String(a);
};

const legacyToLogMessage = (legacy: LegacyConsoleMessage): LogMessage => {
	const text = legacy.args.map(fmtArg).join(" ");
	const source = legacy.source?.file
		? `${legacy.source.file}:${legacy.source.line ?? "?"}`
		: undefined;
	return {
		id: legacy.id,
		level: legacy.level as LogLevel,
		text,
		args: legacy.args,
		timestamp: new Date(legacy.timestamp),
		source,
	};
};

/**
 * Issue #151 round-4: drop any log whose timestamp is strictly less
 * than the clearedAt tombstone. The tombstone is the cross-surface
 * Clear boundary, so every read path and the write-side guard share
 * this helper — the boundary lives in shared-bridge on purpose, so
 * future read paths cannot forget the filter. `clearedAt == null`
 * means no Clear has ever fired; in that case no entry is dropped.
 */
export const filterLogsByClearedAt = (
	logs: readonly LogMessage[],
	clearedAt: number | null,
): LogMessage[] => {
	if (clearedAt == null) return logs.slice();
	const threshold = clearedAt;
	return logs.filter((m) => m.timestamp.getTime() >= threshold);
};

/**
 * Issue #151 round-4: same filter for the wire-payload shape that
 * `writeSharedLogs` and the replay responder return. We compare on the
 * ISO timestamp string parsed as ms so the filter works before the
 * payload has been converted to a `LogMessage`.
 */
export const filterWireByClearedAt = (
	wire: readonly WirePayload[],
	clearedAt: number | null,
): WirePayload[] => {
	if (clearedAt == null) return wire.slice();
	const threshold = clearedAt;
	return wire.filter((w) => {
		const ms = Date.parse(w.timestamp);
		return Number.isFinite(ms) && ms >= threshold;
	});
};

export const writeSharedLogs = async (
	win: Window,
	messages: readonly LogMessage[],
): Promise<void> => {
	// Issue #151 round-4: tombstone-aware write. We filter the
	// outgoing payload against the clearedAt epoch so a slow
	// `_broadcastMessage` debounce tick (or a panel reopening that
	// hits the shared-storage write path before reading the tombstone)
	// cannot reintroduce pre-Clear entries. The clearedAt value is
	// read best-effort; if the helper fails (storage unavailable) the
	// filter becomes a no-op and the tombstone still protects every
	// READ path.
	const clearedAt = await getClearedAt(win);
	const kept = filterLogsByClearedAt(messages, clearedAt);
	await setCepSharedData(
		win,
		LOG_SHARED_KEY,
		kept.slice(-MAX_SHARED_LOGS).map(toLogWirePayload),
	);
};

/**
 * Issue #151 round-5: read CEP shared logs WITHOUT applying the
 * clearedAt filter. The tombstone filter happens at consumer-arrival
 * (in the wrapper or in the consumer's `.then()` callback) so a Clear
 * that fires during the in-flight read is captured at the latest
 * possible moment before delivery, eliminating the
 * `delayed read → Clear → delayed result resolve` resurrection race.
 *
 * Callers that already have a window in scope and need the
 * tombstone-aware form should prefer {@link readSharedLogs}; this raw
 * variant is exported for the consumer-arrival re-check paths
 * (`subscribeSharedLogs`'s initial push, the open-params decode) so
 * they can apply the filter just before handing the array to the
 * subscriber.
 */
const readSharedLogsRaw = async (win: Window): Promise<LogMessage[]> => {
	const raw = await getCepSharedData<unknown>(win, LOG_SHARED_KEY);
	if (!Array.isArray(raw)) {
		return [];
	}
	const logs: LogMessage[] = [];
	for (const item of raw) {
		// Wire payloads must clear the size/timestamp/level guard before being
		// treated as live log messages. The legacy shapes never enter the
		// in-memory buffer directly, so they are passed through unchanged.
		if (isSanitizedLogWirePayload(item)) {
			logs.push(wirePayloadToLogMessage(item));
			continue;
		}
		if (isLegacyConsoleMessage(item)) {
			logs.push(legacyToLogMessage(item));
			continue;
		}
		if (isSlimConsoleMessage(item)) {
			logs.push(slimToLogMessage(item));
		}
	}
	return logs;
};

export const readSharedLogs = async (win: Window): Promise<LogMessage[]> => {
	// Issue #151 round-5: read the snapshot, then re-read the tombstone
	// RIGHT before delivery so a Clear that fires during the in-flight
	// evalScript is captured at the latest possible moment. The previous
	// single-read pattern (`await getClearedAt` once before the filter)
	// had a microscopic gap between the tombstone read and the consumer
	// receiving the result — small enough to ignore in practice, but the
	// re-read makes the consumer-arrival window explicit.
	const logs = await readSharedLogsRaw(win);
	const clearedAt = await getClearedAt(win);
	return filterLogsByClearedAt(logs, clearedAt);
};

let _subscribers: Array<(logs: LogMessage[]) => void> = [];

export const subscribeSharedLogs = (
	win: Window,
	callback: (logs: LogMessage[]) => void,
): (() => void) => {
	_subscribers.push(callback);
	// Issue #151 round-5: consumer-arrival tombstone check. The initial
	// push reads the raw snapshot first, then re-reads the tombstone
	// inside the consumer's arrival callback (the `.then()` body below)
	// and applies the filter at the latest possible moment before
	// delivery. A Clear that fires after the raw read but before this
	// callback runs is captured here, so the listener never receives
	// pre-Clear rows that the operator has already wiped.
	void readSharedLogsRaw(win).then(async (logs) => {
		const clearedAt = await getClearedAt(win);
		callback(filterLogsByClearedAt(logs, clearedAt));
	});
	return () => {
		_subscribers = _subscribers.filter((cb) => cb !== callback);
	};
};

export const clearSharedLogs = async (win: Window): Promise<void> => {
	await deleteCepSharedData(win, LOG_SHARED_KEY);
};

/**
 * Issue #151 round-4: read the cross-surface Clear boundary tombstone.
 * Returns `null` if no Clear has fired (or the helper cannot reach the
 * shared-storage layer, in which case the caller MUST behave as if
 * there were no boundary). Never throws.
 */
export const getClearedAt = async (win: Window): Promise<number | null> => {
	try {
		const raw = await getCepSharedData<unknown>(win, CLEARED_AT_KEY);
		if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
		if (raw < 0) return null;
		return raw;
	} catch {
		return null;
	}
};

/**
 * Issue #151 round-5: write the cross-surface Clear boundary tombstone
 * through the atomic `setCepSharedDataMax` helper. The previous
 * `get → max → set` sequence (round-4) had a TOCTOU race: two surfaces
 * could each observe the same `existing` value, compute different
 * maxes, and the later write could rewind the boundary to a smaller
 * value (`read 100 → read 101 → write 101 → write 100`). The atomic
 * helper performs read-max-write in a single ExtendScript `evalScript`
 * call (or a single-slot JS-side mutex in the in-memory fallback path),
 * so the boundary is monotonic-by-construction.
 *
 * Returns the new tombstone value (a number) on success; `null` when
 * the input is invalid (non-finite / negative) or when the helper is
 * unavailable (storage exception). The caller-facing signature stays
 * `Promise<void>` because the round-1 contract was fire-and-forget,
 * but the helper internally exposes the new value for tests and the
 * consumer-arrival pattern.
 */
export const setClearedAt = async (win: Window, ts: number): Promise<void> => {
	if (!Number.isFinite(ts) || ts < 0) return;
	try {
		await setCepSharedDataMax(win, CLEARED_AT_KEY, ts);
	} catch (err) {
		console.warn(
			"[ty-plus] failed to persist debug-log clearedAt tombstone",
			err,
		);
	}
};

/**
 * Issue #151 round-4: convenience that drops the tombstone so the
 * cross-surface replay responder can apply the same filter as
 * `readSharedLogs` without having to read storage twice per request.
 * Returns the current boundary; if no Clear has fired the caller
 * treats the snapshot as unfiltered.
 *
 * Alias of `getClearedAt` — kept as a separate export to make the
 * replay-responder call site self-documenting (the responder reads
 * once per request and reuses the value for the filter).
 */
export const snapshotClearedAt = async (win: Window): Promise<number | null> =>
	getClearedAt(win);

/**
 * Issue #151 round-4: test-only helper. Wipes the cross-surface
 * Clear boundary tombstone so each test starts from a clean
 * slate. Production code MUST NOT call this — the tombstone is the
 * cross-surface boundary, so dropping it from a UI handler would
 * let stale entries resurrect on the next mount.
 */
export const __resetClearedAtForTest = async (win: Window): Promise<void> => {
	try {
		await deleteCepSharedData(win, CLEARED_AT_KEY);
	} catch {
		/* best-effort: the helper is purely diagnostic */
	}
};

export const refreshSharedLogs = async (win: Window): Promise<void> => {
	const logs = await readSharedLogs(win);
	for (const cb of _subscribers) {
		cb(logs);
	}
};
