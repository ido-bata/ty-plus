// Console interceptor — Issue #129 rewire + Issue #129 replay protocol.
//
// In production the central diagnostic logger (`management/debug/logger.ts`)
// is the canonical sink. This module:
//   1. Monkey-patches `console.*` so legacy call sites that still emit
//      through `console.log/info/warn/error/debug` continue to land in the
//      diagnostic sink. The patch forwards into `logger.log` and skips the
//      original `console.*` call when `NODE_ENV === "production"` — the
//      production plugin strips `console.log/info` calls, so the runtime
//      wrapper still receives patched calls from the interceptor itself or
//      from any direct call site the stripper missed.
//   2. Subscribes to the logger bus so the CEP cross-surface broadcast, the
//      shared-storage retention writer, and the in-memory buffer used by
//      `subscribe()` all observe every entry — whether it originated in a
//      legacy `console.*` call or in a `createLogger(source)` call.
//   3. Keeps the legacy `LogMessage` / `WirePayload` shapes intact so the
//      existing CEP broadcast and shared-storage contracts are not broken.
//   4. Issue #129 replay: when `enableCepBroadcast` is installed, this module
//      also subscribes to `SHELL_CHANNELS.debug` for `kind: "request"`
//      envelopes carrying a `DebugLogReplayRequest` and answers them with a
//      snapshot of the canonical LogBus addressed to the requester's
//      surfaceId. The Debug Console uses this to backfill entries emitted
//      before it opened.

import config from "@/cep.config";
import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import {
	clearSharedLogs,
	filterWireByClearedAt,
	readSharedLogs,
	refreshSharedLogs,
	setClearedAt,
	snapshotClearedAt,
	writeSharedLogs,
} from "@/management/debug/console/shared-bridge";
import type {
	LogLevel,
	LogMessage,
	WirePayload,
} from "@/management/debug/console/types";
import {
	clearEntries,
	getEntries,
	log,
	subscribeLog,
} from "@/management/debug/logger";
import { getCepSharedData, setCepSharedData } from "@/management/storage/cep";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

export type { LogMessage, WirePayload } from "@/management/debug/console/types";

interface CepCSInterface {
	getApplicationID(): string;
	getExtensionID(): string;
	addEventListener?(
		type: string,
		handler: (event: { data?: unknown }) => void,
		obj?: unknown,
	): void;
	removeEventListener?(
		type: string,
		handler: (event: { data?: unknown }) => void,
		obj?: unknown,
	): void;
	dispatchEvent(event: unknown): void;
}

class ShimCSEvent {
	constructor(
		public readonly type: string,
		public readonly scope: string,
		public readonly appId: string,
		public readonly extensionId: string,
	) {}
	data = "";
}

const _getCSInterface = (): CepCSInterface => {
	const CSInterface = window.CSInterface;
	return CSInterface ? new CSInterface() : ({} as CepCSInterface);
};

/**
 * Channel id for debug log lines on the shared CEP APPLICATION surface bus.
 *
 * Issue #129: this MUST come from `SHELL_CHANNELS` so the envelope
 * validator in `management/ae/cep/transport/index.ts` accepts it.
 * Defining the literal here would silently drop every cross-surface
 * debug message at the receiving side (regression we just fixed).
 */
export const LOG_SURFACE_CHANNEL = SHELL_CHANNELS.debug;
export const DEBUG_LOG_EVENT = `${config.id}.debugLogLine`;

/**
 * Maximum entries returned in a single replay response. The Debug
 * Console deduplicates by `id`, but unbounded payloads would let one
 * surface hog the bus and freeze the panel under sustained traffic.
 * Matches the bus capacity documented in `debug/logger.ts` (1000).
 */
export const DEBUG_LOG_REPLAY_MAX_ENTRIES = 1000;

// ── Internal helpers ────────────────────────────────────────────────────────

const _dispatchTS = (event: string, data: unknown): void => {
	const csi = _getCSInterface();
	const fullEvent = `${config.id}.${event}`;
	const appId = csi.getApplicationID();
	const extensionId = csi.getExtensionID();
	const csEvent = new ShimCSEvent(fullEvent, "APPLICATION", appId, extensionId);
	csEvent.data = JSON.stringify(data);
	csi.dispatchEvent(csEvent);
};

const extractCepEventData = (event: unknown): string | null => {
	if (!event || typeof event !== "object") {
		return null;
	}
	const raw = (event as { data?: unknown }).data;
	if (typeof raw === "string") {
		return raw;
	}
	if (raw && typeof raw === "object") {
		try {
			return JSON.stringify(raw);
		} catch {
			return null;
		}
	}
	return null;
};

const createCepEvent = (
	win: Window,
	type: string,
	scope: string,
	appId: string,
	extensionId: string,
): { data: string } => {
	const CSEventCtor = (win as unknown as { CSEvent?: typeof ShimCSEvent })
		.CSEvent;
	return CSEventCtor
		? new CSEventCtor(type, scope, appId, extensionId)
		: new ShimCSEvent(type, scope, appId, extensionId);
};

// ── Internal state ────────────────────────────────────────────────────────

const MAX_MESSAGES = 1000;
let _messages: LogMessage[] = [];
const _listeners = new Set<(msgs: readonly LogMessage[]) => void>();

let _enabled = false;
const _originals: Partial<Record<LogLevel, (...a: unknown[]) => void>> = {};

// ── Session boundary markers (internal to this module) ─────────────────────
//
// AE shutdown flush writes a record to a dedicated shared-storage key so the
// next panel mount can tell old logs from the current session. The shape is
// deliberately not exported; readers outside this module do not need it.
const SESSION_MARKER_KEY = "ty_plus_debug_session_marker_v1";

type SessionMarkerRecord = {
	kind: "started" | "closed";
	startedAt: string;
	closedAt?: string;
};

let _currentSessionStartedAt: number | null = null;
let _flushHookInstalled = false;

/**
 * Returns the wall-clock timestamp (ms) at which the current AE panel session
 * began. The value is set on the first call to `enableInterceptor()` for this
 * JS context and is consumed by the debug console UI to hide logs from
 * previous sessions. Returns `null` before `enableInterceptor()` has been
 * called (rare in production).
 */
export const currentSessionStartedAt = (): number | null =>
	_currentSessionStartedAt;

const writeSessionMarker = async (
	win: Window,
	marker: SessionMarkerRecord,
): Promise<void> => {
	try {
		await setCepSharedData(win, SESSION_MARKER_KEY, marker);
	} catch {
		/* best-effort: the marker is observability, not a hard dependency */
	}
};

const readSessionMarker = async (
	win: Window,
): Promise<SessionMarkerRecord | null> => {
	try {
		const raw = await getCepSharedData<unknown>(win, SESSION_MARKER_KEY);
		if (!raw || typeof raw !== "object") return null;
		const o = raw as Record<string, unknown>;
		if (o.kind !== "started" && o.kind !== "closed") return null;
		if (typeof o.startedAt !== "string") return null;
		return {
			kind: o.kind,
			startedAt: o.startedAt,
			closedAt: typeof o.closedAt === "string" ? o.closedAt : undefined,
		};
	} catch {
		return null;
	}
};

// ── Helpers ───────────────────────────────────────────────────────────────

const LEVELS: LogLevel[] = ["log", "info", "warn", "error", "debug"];
const LEVEL_SET: ReadonlySet<string> = new Set(LEVELS);

export const isLogWirePayload = (p: unknown): p is WirePayload => {
	if (p === null || typeof p !== "object") return false;
	const o = p as Record<string, unknown>;
	return (
		o.v === 1 &&
		typeof o.id === "string" &&
		typeof o.level === "string" &&
		LEVEL_SET.has(o.level) &&
		typeof o.text === "string" &&
		typeof o.timestamp === "string"
	);
};

/**
 * Hard byte limits applied to every inbound log message. Anything larger than
 * these caps is rejected before it can grow the in-memory buffer.
 */
export const LOG_MESSAGE_LIMITS = {
	id: 128,
	level: 16,
	text: 4096,
	timestamp: 64,
	source: 256,
	action: 128,
	/** Serialized length of `context`, not the object's key count. */
	context: 2048,
} as const;

const TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

const isWithinLimit = (value: string, limit: number): boolean =>
	typeof value === "string" && value.length > 0 && value.length <= limit;

/**
 * Length of `context` once JSON-encoded, or `null` when it cannot be
 * encoded at all (circular reference, a `toJSON` that throws, BigInt).
 * Measuring the encoded form is what the wire actually carries, so it is
 * the bound the ingress guard must enforce.
 */
const encodedContextLengthOf = (context: unknown): number | null => {
	if (context === null || typeof context !== "object") return null;
	try {
		const encoded = JSON.stringify(context);
		return typeof encoded === "string" ? encoded.length : null;
	} catch {
		return null;
	}
};

/**
 * Strict sender/authentication guard. Callers that ingest from a CEP event
 * listener or surface bus must run the incoming payload through this check
 * before converting it to a LogMessage. The check enforces:
 *  - per-field byte caps (DoS / unbounded growth), including the structured
 *    `action` / `context` fields the canonical logger owns
 *  - a parseable ISO timestamp (rejects junk dates)
 *  - a non-negative timestamp (rejects future-dated rows that break the sort)
 *  - the level tag is from the known set
 *
 * The outbound side never sends a payload that would fail this: see
 * `toLogWirePayload`, which degrades oversized metadata instead of
 * letting one field cost the whole row.
 */
export const isSanitizedLogWirePayload = (p: unknown): p is WirePayload => {
	if (!isLogWirePayload(p)) return false;
	if (!isWithinLimit(p.id, LOG_MESSAGE_LIMITS.id)) return false;
	if (!isWithinLimit(p.level, LOG_MESSAGE_LIMITS.level)) return false;
	if (!isWithinLimit(p.text, LOG_MESSAGE_LIMITS.text)) return false;
	if (!isWithinLimit(p.timestamp, LOG_MESSAGE_LIMITS.timestamp)) return false;
	if (
		typeof p.source === "string" &&
		p.source.length > LOG_MESSAGE_LIMITS.source
	) {
		return false;
	}
	if (
		typeof p.action === "string" &&
		(p.action.length === 0 || p.action.length > LOG_MESSAGE_LIMITS.action)
	) {
		return false;
	}
	if (p.context !== undefined) {
		const encodedLength = encodedContextLengthOf(p.context);
		if (encodedLength === null || encodedLength > LOG_MESSAGE_LIMITS.context) {
			return false;
		}
	}
	if (!TIMESTAMP_PATTERN.test(p.timestamp)) return false;
	const ms = Number(Date.parse(p.timestamp));
	if (!Number.isFinite(ms) || ms < 0) return false;
	return true;
};

export const wirePayloadToLogMessage = (w: WirePayload): LogMessage => ({
	id: w.id,
	level: w.level,
	text: w.text,
	args: [],
	timestamp: new Date(w.timestamp),
	source: w.source,
	...(w.action ? { action: w.action } : {}),
	...(w.context ? { context: w.context } : {}),
});

/**
 * Serialize one message for a wire hop (CEP event, surface bus, shared
 * retention, open-params).
 *
 * `action` / `context` are the structured fields the canonical logger
 * owns; dropping them at the wire boundary would strip correlation data
 * (request ids, generations) from every row before it reached another
 * surface, which is exactly what Issue #158 has to read. Serialization is
 * guarded: a context that cannot be JSON-encoded is omitted rather than
 * throwing out of a logger emit.
 */
export const toLogWirePayload = (msg: LogMessage): WirePayload => {
	const context =
		msg.context === undefined ? undefined : sanitizeContext(msg.context);
	const action =
		msg.action === undefined ? undefined : sanitizeAction(msg.action);
	return {
		v: 1,
		id: msg.id,
		level: msg.level,
		text: msg.text,
		timestamp: msg.timestamp.toISOString(),
		source: msg.source,
		...(action ? { action } : {}),
		...(context ? { context } : {}),
	};
};

const sanitizeContext = (
	context: Record<string, unknown>,
): Record<string, unknown> | undefined => {
	const encodedLength = encodedContextLengthOf(context);
	if (encodedLength === null) return undefined;
	if (encodedLength > LOG_MESSAGE_LIMITS.context) return undefined;
	return context;
};

/**
 * Drop an oversized (or empty) `action` **without** dropping the row.
 *
 * The canonical logger has no action-length restriction, so a long
 * `action` can exist on the local bus while the ingress guard would
 * reject the whole payload for it — one bad metadata field would cost the
 * operator the log line itself. This mirrors `sanitizeContext`: the
 * metadata degrades, the event survives, and the row clears
 * `isSanitizedLogWirePayload` on the far side.
 */
const sanitizeAction = (action: string): string | undefined =>
	action.length > 0 && action.length <= LOG_MESSAGE_LIMITS.action
		? action
		: undefined;

/** Best-effort single-line representation of one argument. */
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

/** Extract "file.ts:42" from a v8-style stack string. */
const extractSource = (stack: string): string | undefined => {
	const lines = stack.split("\n");
	for (const line of lines) {
		// skip internal frames
		if (
			line.includes("interceptor") ||
			line.includes("console-ui") ||
			line.includes("Error")
		)
			continue;
		// match "file:line:col" or "(file:line:col)"
		const m = line.match(/(?:at\s+)?(?:.*?\s+)?\(?([^()\s]+):(\d+):\d+\)?$/);
		if (m) {
			const file = m[1].split("/").slice(-2).join("/"); // last 2 path segments
			return `${file}:${m[2]}`;
		}
	}
	return undefined;
};

const notify = (): void => {
	const snap = _messages as readonly LogMessage[];
	for (const cb of _listeners) cb(snap);
};

/**
 * Drop structured metadata that would fail the ingress guard while
 * keeping the row. Mirrors `toLogWirePayload`: an oversized `action` or
 * an un-encodable `context` is metadata, and metadata loss is strictly
 * better than losing the log line the operator is reading.
 */
const degradeStructuredMetadata = (msg: LogMessage): LogMessage => {
	const action = sanitizeAction(msg.action ?? "");
	const contextLength =
		msg.context === undefined ? null : encodedContextLengthOf(msg.context);
	const context =
		contextLength === null || contextLength > LOG_MESSAGE_LIMITS.context
			? undefined
			: msg.context;
	if (
		action === (msg.action ?? undefined) &&
		context === (msg.context ?? undefined)
	) {
		return msg;
	}
	return { ...msg, action, context };
};

const mergeMessages = (incoming: readonly LogMessage[]): void => {
	if (incoming.length === 0) return;
	const byId = new Map(_messages.map((msg) => [msg.id, msg] as const));
	for (const incomingMsg of incoming) {
		// Re-apply the sanitized-guard at merge time so direct injections
		// (shared storage, transport) cannot bypass the listener-side filter.
		if (incomingMsg.id.length > LOG_MESSAGE_LIMITS.id) continue;
		if (incomingMsg.text.length > LOG_MESSAGE_LIMITS.text) continue;
		if (incomingMsg.level.length > LOG_MESSAGE_LIMITS.level) continue;
		if (
			typeof incomingMsg.source === "string" &&
			incomingMsg.source.length > LOG_MESSAGE_LIMITS.source
		) {
			continue;
		}
		if (!Number.isFinite(incomingMsg.timestamp.getTime())) continue;
		// Structured metadata degrades, the row survives — the same
		// contract `toLogWirePayload` applies on the outbound side. One
		// oversized or unencodable field must never cost the operator the
		// log line itself.
		const msg = degradeStructuredMetadata(incomingMsg);
		byId.set(msg.id, msg);
	}
	const merged = [...byId.values()].sort(
		(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
	);
	_messages.length = 0;
	_messages.push(...merged.slice(-MAX_MESSAGES));
	notify();
};

const getSourceSurfaceId = (win: Window): string => {
	const w = win as unknown as {
		__TY_PLUS_PANEL_SURFACE_ID__?: string;
		__TY_PLUS_DIALOG_SURFACE_ID__?: string;
	};
	return (
		w.__TY_PLUS_PANEL_SURFACE_ID__ ??
		w.__TY_PLUS_DIALOG_SURFACE_ID__ ??
		"ty-plus-surface"
	);
};

/**
 * Map a central-logger entry to the legacy `LogMessage` shape the rest of
 * the debug-console UI still consumes. The mapping is total and idempotent.
 */
const entryToLogMessage = (entry: {
	id: string;
	level: LogLevel;
	source: string;
	timestamp: number;
	message: string;
	action?: string;
	context?: Record<string, unknown>;
}): LogMessage => ({
	id: entry.id,
	level: entry.level,
	text: entry.message,
	args: [],
	timestamp: new Date(entry.timestamp),
	source: entry.source,
	...(entry.action ? { action: entry.action } : {}),
	...(entry.context ? { context: entry.context } : {}),
});

// ── Public API ────────────────────────────────────────────────────────────

/** Start intercepting console output. Idempotent. */
export const enableInterceptor = (): void => {
	if (_enabled) return;
	_enabled = true;
	// First call in this JS context anchors the session start. Subsequent
	// calls (mount-once effects re-running) do not move the boundary.
	if (_currentSessionStartedAt == null) {
		_currentSessionStartedAt = Date.now();
	}

	for (const level of LEVELS) {
		const orig = (console[level] as (...a: unknown[]) => void).bind(console);
		_originals[level] = orig;

		(console[level] as (...a: unknown[]) => void) = (...args: unknown[]) => {
			// In production the central logger emits without calling
			// `console.*`, so we forward into the bus instead of the original
			// console method. Outside production we still call the original so
			// DevTools shows the message and tests can observe it.
			if (process.env.NODE_ENV !== "production") {
				orig(...args);
			}

			let source: string | undefined;
			try {
				source = extractSource(new Error().stack ?? "");
			} catch {
				/* noop */
			}

			// Forward into the central diagnostic sink. We use the
			// `console-interceptor` source so legacy `console.*` call sites
			// are still attributed even when the file:line heuristic missed
			// (e.g. minified stacks in production).
			const message = args.map(fmtArg).join(" ");
			log(level, "console-interceptor", message, {
				...(source ? { context: { file: source } } : {}),
			});
		};
	}

	// Bridge the central logger into the legacy in-memory buffer + listeners.
	// This keeps `subscribe()` / `getMessages()` working for any UI that has
	// not yet migrated to `subscribeLog()` / `getEntries()`.
	let _lastBroadcastIndex = 0;
	const _broadcastSeen = new Set<string>();
	subscribeLog((entries) => {
		// Broadcast entries we have not yet broadcast over CEP. The bus may
		// shrink from the front when over capacity, so we cannot rely on a
		// simple slice index; instead we walk forward and emit only entries
		// whose id is not in the seen set, dropping the seen set when the
		// buffer rotates.
		const seenInBuffer = new Set<string>();
		for (let i = 0; i < entries.length; i += 1) {
			const entry = entries[i];
			seenInBuffer.add(entry.id);
			if (_broadcastSeen.has(entry.id)) continue;
			_broadcastSeen.add(entry.id);
			if (_broadcastEnabled && _broadcastWin) {
				_broadcastMessage(entryToLogMessage(entry));
			}
		}
		// Drop seen entries that are no longer in the buffer (rotation).
		for (const id of _broadcastSeen) {
			if (!seenInBuffer.has(id)) _broadcastSeen.delete(id);
		}
		_lastBroadcastIndex = entries.length;

		// Map to legacy LogMessage and append. Cap is enforced by the bus;
		// here we just rebuild the legacy buffer for the existing listeners.
		const mapped: LogMessage[] = entries.map(entryToLogMessage);
		_messages = mapped;
		notify();
	});
};

/** Restore original console methods. */
const _disableInterceptor = (): void => {
	if (!_enabled) return;
	for (const level of LEVELS) {
		if (_originals[level]) {
			(console[level] as (...a: unknown[]) => void) = _originals[level];
		}
	}
	_enabled = false;
};

/** Subscribe to message updates. Returns an unsubscribe function. */
export const subscribe = (
	cb: (msgs: readonly LogMessage[]) => void,
): (() => void) => {
	_listeners.add(cb);
	cb([..._messages]); // emit current buffer immediately
	return () => _listeners.delete(cb);
};

/** Get a snapshot of all buffered messages. */
export const getMessages = (): readonly LogMessage[] => [..._messages];

/** Clear the message buffer and notify listeners. */
const clearMessages = (): void => {
	_messages.length = 0;
	notify();
};

/**
 * Layered log-clear semantics (Issue #138, #151):
 *
 *   - `clearLogs()`       → wipe the **in-session** view:
 *                            • legacy interceptor buffer (`_messages`)
 *                            • canonical LogBus (`logger.clearEntries()`)
 *                            • **Issue #151 round-4: cross-surface
 *                              `clearedAt` tombstone** (when `win` is
 *                              provided). The tombstone lives in CEP
 *                              shared storage so other surfaces (and
 *                              surfaces reopened later) also drop
 *                              pre-Clear entries at every read
 *                              boundary.
 *                            The CEP APPLICATION shared-storage retention is
 *                            untouched, so the cleared logs remain visible
 *                            after a panel reload or AE process restart until
 *                            they age out of the 1000-entry cap.
 *   - `clearRetainedLogs()` → wipe the **cross-process** retention:
 *                            • CEP shared storage at `ty_plus_debug_logs_v1`
 *                            • the `clearedAt` tombstone is **advanced**
 *                              rather than deleted, so the boundary is
 *                              preserved even after the in-session bus
 *                              grows new rows.
 *                            Use this for an operator-directed hard reset.
 *
 * Both layers must be cleared or the canonical LogBus feeds the bus
 * subscriber with its full historical buffer on the next emitted entry,
 * causing the in-memory UI list to "revive" the cleared entries.
 *
 * `win` is accepted for backward compatibility with the Issue #138 callers
 * (`ui/dialog-root.tsx`, `ui.tsx`, `workspace/hook.ts`); neither layer
 * requires it — the legacy buffer and the canonical bus live in this JS
 * context. {@link clearRetainedLogs} is the entry point that needs `win`.
 */
export const clearLogs = async (win?: Window): Promise<void> => {
	clearMessages();
	clearEntries();
	if (win) {
		// Issue #151 round-4: write the tombstone so cross-surface
		// readers drop every entry whose timestamp predates `Date.now()`.
		// The write is best-effort and monotonic (see `setClearedAt`),
		// so concurrent surfaces cannot rewind the boundary.
		await setClearedAt(win, Date.now());
	}
};

/**
 * Clear the retained log history that survives panel reload / AE process
 * restart. Distinct from {@link clearLogs}, which only clears the in-session
 * bus view.
 *
 * Issue #151: this path runs in release builds. Windows AE 2026 shipped
 * builds must keep cross-process retention working for operator triage
 * after an AE restart. The retention payload is scoped to the
 * `com.typlus` extension id and writes the 1000-entry cap from
 * `shared-bridge.ts#MAX_SHARED_LOGS`; the bounded write makes the
 * cross-extension read surface safe to keep enabled in production.
 *
 * Not bound to a Debug Console UI button in Issue #138; exposed for
 * future operator-directed cleanup. The 1000-entry cap is reasserted on
 * the next panel mount via the `MAX_SHARED_LOGS` slide in
 * `shared-bridge.ts`.
 *
 * Issue #151 round-4: also advances the `clearedAt` tombstone so the
 * cross-surface boundary survives the wipe.
 */
export const clearRetainedLogs = async (win: Window): Promise<void> => {
	await clearSharedLogs(win);
	await setClearedAt(win, Date.now());
	await refreshSharedLogs(win);
};

/**
 * Mount-time hook that backfills the in-memory buffer from the retained
 * CEP shared-storage history and re-asserts the 1000-entry cap on first
 * read. Issue #151: also runs in release builds — see the rationale in
 * {@link clearRetainedLogs}.
 */
export const initializeLogRetention = async (win: Window): Promise<void> => {
	const retainedMessages = await readSharedLogs(win);
	mergeMessages(retainedMessages);
	if (_messages.length > 0) {
		await writeSharedLogs(win, _messages);
	}
	await refreshSharedLogs(win);
};

/**
 * Best-effort hook that wires the CEP `panel_before_close` and
 * `panel_destroyed` events to a flush + session-boundary-mark write.
 *
 * Background:
 *  - `enableInterceptor()` only writes to shared storage while the buffer
 *    changes. AE crashes (or panel reloads that skip the broadcast tick) can
 *    leave the latest N messages unsynced.
 *  - The close hook commits the current buffer (existing
 *    `shared-bridge.ts` slide keeps the cap at `MAX_SHARED_LOGS = 1000`,
 *    aligned with the canonical LogBus capacity) and records the session
 *    end timestamp in an internal shared-storage key. The next panel
 *    mount reads `currentSessionStartedAt()` and hides anything that
 *    predates it.
 *
 * Returns a disposer; the hook is idempotent — repeated calls return a
 * no-op disposer after the first install.
 */
export const flushOnAEPanelClose = (win: Window): (() => void) => {
	if (_flushHookInstalled) {
		return () => {
			/* already installed; subsequent calls are no-ops */
		};
	}
	_flushHookInstalled = true;

	const csi = _getCSInterface();
	const adobe = (
		win as unknown as {
			__adobe_cep__?: {
				addEventListener?: (
					type: string,
					handler: (event: { data?: unknown }) => void,
					obj?: unknown,
				) => void;
				removeEventListener?: (
					type: string,
					handler: (event: { data?: unknown }) => void,
					obj?: unknown,
				) => void;
			};
		}
	).__adobe_cep__;

	const onClose = (): void => {
		// Issue #151: the close hook writes the session boundary marker and
		// commits the current buffer so the next panel mount can recover
		// them. This runs in release builds — see the rationale in
		// `clearRetainedLogs`. The actual writes are best-effort and bounded
		// by `MAX_SHARED_LOGS`, so we do not gate on NODE_ENV.
		void (async () => {
			try {
				await writeSharedLogs(win, _messages);
				const started = new Date(
					_currentSessionStartedAt ?? Date.now(),
				).toISOString();
				const marker: SessionMarkerRecord = {
					kind: "closed",
					startedAt: started,
					closedAt: new Date().toISOString(),
				};
				await writeSessionMarker(win, marker);
				await refreshSharedLogs(win);
			} catch {
				/* best-effort */
			}
		})();
	};

	const BEFORE_CLOSE = "panel_before_close";
	const DESTROYED = "panel_destroyed";

	csi.addEventListener?.(BEFORE_CLOSE, onClose, null);
	csi.addEventListener?.(DESTROYED, onClose, null);
	adobe?.addEventListener?.(BEFORE_CLOSE, onClose, null);
	adobe?.addEventListener?.(DESTROYED, onClose, null);

	return () => {
		csi.removeEventListener?.(BEFORE_CLOSE, onClose, null);
		csi.removeEventListener?.(DESTROYED, onClose, null);
		adobe?.removeEventListener?.(BEFORE_CLOSE, onClose, null);
		adobe?.removeEventListener?.(DESTROYED, onClose, null);
		_flushHookInstalled = false;
	};
};

export const initializeDebugLogRetention = initializeLogRetention;

export const subscribeDebugLogEvents = (
	win: Window,
	callback: (message: LogMessage) => void,
): (() => void) => {
	const handler = (event: { data?: unknown }) => {
		const data = extractCepEventData(event);
		if (!data) return;
		try {
			const payload = JSON.parse(data);
			if (isSanitizedLogWirePayload(payload)) {
				callback(wirePayloadToLogMessage(payload));
			}
		} catch {
			/* invalid debug event */
		}
	};

	const csi = _getCSInterface();
	csi.addEventListener?.(DEBUG_LOG_EVENT, handler, null);
	const adobe = (
		win as unknown as {
			__adobe_cep__?: {
				addEventListener?: (
					type: string,
					handler: (event: { data?: unknown }) => void,
					obj?: unknown,
				) => void;
				removeEventListener?: (
					type: string,
					handler: (event: { data?: unknown }) => void,
					obj?: unknown,
				) => void;
			};
		}
	).__adobe_cep__;
	adobe?.addEventListener?.(DEBUG_LOG_EVENT, handler, null);

	return () => {
		csi.removeEventListener?.(DEBUG_LOG_EVENT, handler, null);
		adobe?.removeEventListener?.(DEBUG_LOG_EVENT, handler, null);
	};
};

/**
 * Evaluate a JS expression in a try/catch.
 * Result is logged via console.log so it appears in the panel.
 *
 * TRUST BOUNDARY: `eval` here is intentional — this is the debug
 * console's REPL. The input is whatever the local user types into
 * the CEP panel's own prompt. It is not driven by network, storage,
 * or any untrusted external source, so this is not a code-injection
 * vector for the panel itself. Keep this confined to the debug
 * console surface; do not import `executeCommand` from production
 * paths.
 */
export const executeCommand = (code: string): void => {
	try {
		// biome-ignore lint/security/noGlobalEval: intentional debug REPL
		const result = eval(code); // eslint-disable-line no-eval, react-doctor/no-eval
		if (result !== undefined) console.log(result);
	} catch (err) {
		console.error(err);
	}
};

// ── CEP cross-surface broadcast (same bus as dialog.tsx / dialog-probe-boot) ─

let _broadcastEnabled = false;
let _broadcastWin: Window | null = null;
let _pendingWrite: ReturnType<typeof setTimeout> | null = null;
let _replayUnsub: (() => void) | null = null;

/**
 * Validate the shape of a `DebugLogReplayRequest` payload. Defensive
 * parsing: an unknown sender MUST NOT cause this responder to crash
 * or to publish a malformed response.
 */
export const isDebugLogReplayRequest = (
	value: unknown,
): value is {
	kind: "replay-request";
	requestId: string;
	since?: string;
	maxEntries?: number;
} => {
	if (!value || typeof value !== "object") return false;
	const o = value as Record<string, unknown>;
	if (o.kind !== "replay-request") return false;
	if (typeof o.requestId !== "string" || o.requestId.length === 0) return false;
	if (o.requestId.length > 128) return false;
	if (o.since !== undefined && typeof o.since !== "string") return false;
	if (o.maxEntries !== undefined) {
		if (typeof o.maxEntries !== "number" || !Number.isFinite(o.maxEntries)) {
			return false;
		}
		if (o.maxEntries <= 0) return false;
	}
	return true;
};

/**
 * Snapshot the canonical LogBus into the wire-payload form a Debug
 * Console will accept on `SHELL_CHANNELS.debug`. Applies the same
 * per-field caps the live broadcast path enforces, so a hostile or
 * out-of-band entry cannot break the receiver.
 *
 * Issue #151 round-4: the optional `clearedAt` parameter carries the
 * cross-surface Clear tombstone. When provided, every entry whose
 * timestamp predates the boundary is dropped from the snapshot so the
 * `replay-response` cannot be used to resurrect entries a peer surface
 * has already wiped. `null` / `undefined` is treated as "no boundary"
 * (no entries dropped). Callers that have a window in scope should
 * read the tombstone via `snapshotClearedAt(win)` and pass it through;
 * callers without a window can omit it.
 */
const buildReplaySnapshot = (
	request: { maxEntries?: number },
	clearedAt: number | null = null,
): { entries: ReadonlyArray<WirePayload>; takenAt: string } => {
	const cap = Math.min(
		DEBUG_LOG_REPLAY_MAX_ENTRIES,
		Math.max(1, Math.floor(request.maxEntries ?? DEBUG_LOG_REPLAY_MAX_ENTRIES)),
	);
	const entries: WirePayload[] = [];
	// Sanitize and filter in one pass. The guard is re-applied to the mapped
	// payload rather than the in-memory entry so a malformed entry (e.g. one
	// written by a buggy test) cannot escape through the replay path either.
	for (const e of getEntries().slice(-cap)) {
		const wire: WirePayload = {
			v: 1,
			id: e.id.slice(0, LOG_MESSAGE_LIMITS.id),
			level: e.level.slice(0, LOG_MESSAGE_LIMITS.level) as WirePayload["level"],
			text: e.message.slice(0, LOG_MESSAGE_LIMITS.text),
			timestamp: new Date(e.timestamp)
				.toISOString()
				.slice(0, LOG_MESSAGE_LIMITS.timestamp),
			...(e.source
				? { source: e.source.slice(0, LOG_MESSAGE_LIMITS.source) }
				: {}),
		};
		if (isSanitizedLogWirePayload(wire)) {
			entries.push(wire);
		}
	}
	// Issue #151 round-4: apply the cross-surface Clear boundary last so
	// the replay snapshot can never resurrect a row a peer surface has
	// already wiped. The helper is shared with every other read path so
	// the boundary semantics stay aligned.
	const filtered = filterWireByClearedAt(entries, clearedAt);
	return {
		entries: filtered,
		takenAt: new Date().toISOString(),
	};
};

/**
 * Issue #129: replay responder. Installed once at `enableCepBroadcast`.
 * Listens for `kind: "request"` envelopes on `SHELL_CHANNELS.debug`,
 * answers each with a `kind: "response"` envelope addressed to the
 * requester's surfaceId (correlationId echoed). Live `publish`
 * envelopes pass through unchanged.
 *
 * The response carries a `LogEntry` snapshot of the bus as of the
 * moment the request was received; the Debug Console dedupes against
 * future `publish` envelopes by `id`.
 *
 * Issue #151 round-4: when a `clearedAt` snapshot is provided, the
 * replay snapshot is filtered against the cross-surface Clear boundary
 * so the response can never resurrect entries a peer surface has wiped.
 * The lower-level variant `installReplayResponderWith(transport, surfaceId, clearedAt)`
 * is exported so tests can wire a responder against a captured mock
 * transport and inspect the publish log directly. The public surface
 * goes through `installReplayResponder(win)` for production wiring —
 * it reads the tombstone via `snapshotClearedAt(win)` per request.
 */
export const installReplayResponderWith = (
	transport: ReturnType<typeof createCepSurfaceTransport>,
	surfaceId: string,
	clearedAt: number | null = null,
): (() => void) =>
	transport.subscribe((envelope) => {
		if (envelope.channel !== LOG_SURFACE_CHANNEL) return;
		if (envelope.kind !== "request") return;
		if (!isDebugLogReplayRequest(envelope.payload)) return;
		// Don't respond to requests we ourselves sent (would loop).
		if (envelope.sourceSurfaceId === surfaceId) return;
		const request = envelope.payload;
		const snapshot = buildReplaySnapshot(request, clearedAt);
		void transport.publish({
			messageId: `replay-resp:${request.requestId}:${Date.now()}`,
			correlationId: envelope.correlationId ?? envelope.messageId,
			channel: LOG_SURFACE_CHANNEL,
			kind: "response",
			sourceSurfaceId: surfaceId,
			targetSurfaceId: envelope.sourceSurfaceId,
			payload: {
				kind: "replay-response",
				requestId: request.requestId,
				sourceSurfaceId: surfaceId,
				entries: snapshot.entries,
				takenAt: snapshot.takenAt,
			},
			createdAt: Date.now(),
		});
	});

export const installReplayResponder = (win: Window): (() => void) => {
	const transport = createCepSurfaceTransport(win);
	// Issue #151 round-4: read the tombstone once per replay request
	// (not once per responder installation) so a fresh Clear that lands
	// between the responder's mount and the next request is picked up
	// immediately. The helper is best-effort — failure to read the
	// tombstone simply treats the snapshot as unfiltered.
	const surfaceId = getSourceSurfaceId(win);
	return transport.subscribe((envelope) => {
		if (envelope.channel !== LOG_SURFACE_CHANNEL) return;
		if (envelope.kind !== "request") return;
		if (!isDebugLogReplayRequest(envelope.payload)) return;
		if (envelope.sourceSurfaceId === surfaceId) return;
		const request = envelope.payload;
		void snapshotClearedAt(win).then((clearedAt) => {
			const snapshot = buildReplaySnapshot(request, clearedAt);
			void transport.publish({
				messageId: `replay-resp:${request.requestId}:${Date.now()}`,
				correlationId: envelope.correlationId ?? envelope.messageId,
				channel: LOG_SURFACE_CHANNEL,
				kind: "response",
				sourceSurfaceId: surfaceId,
				targetSurfaceId: envelope.sourceSurfaceId,
				payload: {
					kind: "replay-response",
					requestId: request.requestId,
					sourceSurfaceId: surfaceId,
					entries: snapshot.entries,
					takenAt: snapshot.takenAt,
				},
				createdAt: Date.now(),
			});
		});
	});
};

/**
 * Forward captured console lines on `com.typlus.surfaceMessage` (APPLICATION).
 * Event carries appId/extensionId from CSInterface (required on some hosts).
 *
 * Also installs the Issue #129 replay responder (see
 * `installReplayResponder`). Idempotent: repeated calls do not stack
 * subscribers.
 */
export const enableCepBroadcast = (win: Window): void => {
	_broadcastEnabled = true;
	_broadcastWin = win;
	if (!_replayUnsub) {
		_replayUnsub = installReplayResponder(win);
	}
};

// ── Transport failure diagnostic policy (Issue #138) ───────────────────────
//
// A logging transport that reports its own failures through itself has no
// bound: every failed publish would emit a log, which would be published,
// which would fail again. The policy here is therefore three-part:
//
//   recursion guard   — `_inTransportDiagnostic` is set while the report
//                       itself runs, and `_broadcastMessage` returns
//                       immediately when it is set. The report reaches
//                       the canonical bus and the local view, never the
//                       wire.
//   bounded fallback  — the first `TRANSPORT_FAILURE_LOG_BUDGET` failures
//                       per module load are recorded; after that they are
//                       dropped. A dead transport must not become an
//                       unbounded log flood.
//   no broadcast loop — the only caller of `reportTransportFailure` is
//                       `_broadcastMessage`'s own error handling, and the
//                       guard above makes that call unable to re-enter.
//
// Serialization is guarded separately: an un-encodable `context` is
// dropped by `toLogWirePayload` rather than throwing out of an emit.
const TRANSPORT_FAILURE_LOG_BUDGET = 5;
let _transportFailureCount = 0;
let _inTransportDiagnostic = false;

/**
 * Structural allowlist for a primitive error code.
 *
 * Only an identifier-shaped or numeric code leaves the exception. The
 * diagnostic is retained and mirrored cross-surface, and Issue #138
 * forbids secrets in the log: a transport exception's `.message` can
 * embed an Authorization header, a URL query, a filesystem path or
 * user-supplied data, and truncation is not redaction. There is no
 * canonical message redactor in this repo that covers all of those
 * shapes, so the message, the stack and the error object are never
 * stored — only this shape-checked code.
 */
const PRIMITIVE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,31}$/;

const readErrorCode = (error: unknown): string | undefined => {
	if (error === null || typeof error !== "object") return undefined;
	const code = (error as { code?: unknown }).code;
	if (typeof code === "number") {
		return Number.isFinite(code) ? String(code) : undefined;
	}
	if (typeof code === "string" && PRIMITIVE_ERROR_CODE.test(code)) {
		return code;
	}
	return undefined;
};

const reportTransportFailure = (stage: string, error: unknown): void => {
	_transportFailureCount += 1;
	if (_inTransportDiagnostic) return;
	if (_transportFailureCount > TRANSPORT_FAILURE_LOG_BUDGET) return;
	_inTransportDiagnostic = true;
	try {
		log("warn", "debug-console", `[debug-console] transport ${stage} failed`, {
			context: {
				stage,
				errorName: error instanceof Error ? error.name : "unknown",
				errorCode: readErrorCode(error),
				suppressedAfter: TRANSPORT_FAILURE_LOG_BUDGET,
			},
		});
	} finally {
		_inTransportDiagnostic = false;
	}
};

/**
 * Test-only. The failure budget is per module load, so without a reset
 * every suite after the first budget-exhausting case would observe an
 * already-spent counter and could never prove that a *new* failure is
 * recorded. Production code MUST NOT call this — the budget is the
 * anti-flood mechanism.
 */
export const __resetTransportDiagnosticsForTest = (): void => {
	_transportFailureCount = 0;
	_inTransportDiagnostic = false;
};

const _broadcastMessage = (msg: LogMessage): void => {
	if (!_broadcastEnabled || !_broadcastWin) return;
	// Recursion guard: a transport-failure report lands on this same
	// bridge. Emitting it would re-enter here and re-publish the very
	// message describing a broken transport.
	if (_inTransportDiagnostic) return;
	let wire: WirePayload;
	try {
		wire = toLogWirePayload(msg);
	} catch (error) {
		reportTransportFailure("serialize", error);
		return;
	}
	try {
		const csi = _getCSInterface();
		const appId = csi.getApplicationID?.() ?? "";
		const extensionId = csi.getExtensionID?.() ?? "";
		// Application scope only. The previous GLOBAL scope exposed captured
		// console output to any CEP extension subscribed to the event, which
		// leaks user data in production builds.
		const event = createCepEvent(
			_broadcastWin,
			DEBUG_LOG_EVENT,
			"APPLICATION",
			appId,
			extensionId,
		);
		event.data = JSON.stringify(wire);
		csi.dispatchEvent?.(event);
		(
			_broadcastWin as unknown as {
				__adobe_cep__?: { dispatchEvent?: (event: unknown) => void };
			}
		).__adobe_cep__?.dispatchEvent?.(event);
	} catch (error) {
		reportTransportFailure("dispatch", error);
	}
	try {
		const transport = createCepSurfaceTransport(_broadcastWin);
		// `publish` is async in production (`async publish(message)`), so a
		// failure inside its body — the `JSON.stringify`, the CEP dispatch,
		// anything else there — arrives as a rejected promise, not as a
		// throw at this call site. The outer catch only covers the
		// synchronous construction failure; the rejection is observed here
		// so it is reported *and* never left unhandled.
		const published = transport.publish({
			messageId: wire.id,
			channel: LOG_SURFACE_CHANNEL,
			kind: "publish",
			sourceSurfaceId: getSourceSurfaceId(_broadcastWin),
			payload: wire,
			createdAt: Date.now(),
		});
		void Promise.resolve(published).catch((error: unknown) => {
			reportTransportFailure("publish", error);
		});
	} catch (error) {
		reportTransportFailure("publish", error);
	}
	// Issue #151: the shared-storage retention path is enabled in release
	// builds. The `writeSharedLogs` helper enforces the `MAX_SHARED_LOGS =
	// 1000` cap, and `refreshSharedLogs` only notifies local subscribers,
	// so this is safe to leave on. Operators rely on this for post-mortem
	// triage after an AE process restart.
	if (_pendingWrite) clearTimeout(_pendingWrite);
	_pendingWrite = setTimeout(() => {
		if (_broadcastWin) {
			const win = _broadcastWin;
			void writeSharedLogs(win, _messages)
				.then(() => {
					try {
						_dispatchTS("debugLogSync", { updatedAt: Date.now() });
					} catch (error) {
						reportTransportFailure("notify", error);
					}
					try {
						return refreshSharedLogs(win);
					} catch (error) {
						reportTransportFailure("retention", error);
						return undefined;
					}
				})
				.catch((error: unknown) => reportTransportFailure("retention", error));
		}
		_pendingWrite = null;
	}, 100);
};
