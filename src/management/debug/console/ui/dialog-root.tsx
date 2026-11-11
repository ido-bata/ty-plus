import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { createCepSurfaceTransport } from "@/management/ae/cep/transport";
import {
	DEBUG_LOG_REPLAY_MAX_ENTRIES,
	executeCommand,
	isSanitizedLogWirePayload,
	LOG_SURFACE_CHANNEL,
	subscribe,
	subscribeDebugLogEvents,
	wirePayloadToLogMessage,
} from "@/management/debug/console/interceptor";
import { mergeLogMessages } from "@/management/debug/console/message-store";
import { readOpenParamsFromWindow } from "@/management/debug/console/open-params";
import {
	clearSharedLogs,
	filterLogsByClearedAt,
	getClearedAt,
	setClearedAt,
	subscribeSharedLogs,
} from "@/management/debug/console/shared-bridge";
import type { LogMessage } from "@/management/debug/console/types";
import { DEBUG_CTX_IDS } from "@/management/debug/console/ui/context-menu";
import {
	getLastCtxMessageId,
	setCurrentFilterLevel,
	setCurrentMessageCount,
	setLastCtxMessageId,
} from "@/management/debug/console/ui/ctx-state";
import { type FilterLevel, Panel } from "@/management/debug/console/ui/Panel";
import {
	clearEntries,
	createLogger,
	type LogEntry,
	subscribeLog,
} from "@/management/debug/logger";
import type { SurfaceMessageEnvelope } from "@/management/workspace/surface/contract";

const makeDebugMessage = (
	level: LogMessage["level"],
	text: string,
): LogMessage => ({
	id: `debug-console:${Date.now()}:${Math.random().toString(36).slice(2)}`,
	level,
	text,
	args: [],
	timestamp: new Date(),
	source: "debug-console",
});

/**
 * Convert a canonical `LogEntry` from the bus into a Debug-Console
 * `LogMessage`. Used by the direct `subscribeLog` wiring so the debug
 * console observes entries emitted by `createLogger(source)` regardless
 * of whether the legacy `console.*` interceptor also forwarded them. This
 * is the canonical path that survives the production
 * `dropConsoleLogInfoPlugin` transform.
 */
const logEntryToMessage = (entry: LogEntry): LogMessage => ({
	id: entry.id,
	level: entry.level,
	text: entry.message,
	args: entry.context ? [entry.context] : [],
	timestamp: new Date(entry.timestamp),
	source: entry.source,
	...(entry.action ? { action: entry.action } : {}),
	...(entry.context ? { context: entry.context } : {}),
});

const debugConsoleLog = createLogger("debug-console");

export type DebugDialogRootProps = {
	surfaceId: string;
	onContextMenuSelect?: (menuId: string) => void;
	isCep?: boolean;
	hostCode?: string;
};

export function DebugDialogRoot({
	surfaceId: _surfaceId,
	onContextMenuSelect,
	isCep = false,
	hostCode = "",
}: DebugDialogRootProps): JSX.Element {
	const messagesRef = useRef<Element>(null);
	const [messages, setMessages] = useState<readonly LogMessage[]>([]);
	const [filter, setFilter] = useState<FilterLevel>("all");
	const [autoScroll, setAutoScroll] = useState(true);
	// Issue #151 round-3: the previous design kept `localMessages` as a
	// closure variable inside the mount effect. Clearing the bus and
	// the retained layer was not enough — the next subscriber tick would
	// merge the empty payload against the still-populated `localMessages`
	// and "revive" the cleared entries on screen. The Reset path now
	// zeroes both refs AND the React state synchronously before the
	// async clear fires, so the UI empties atomically with the bus
	// wipe, and reopen reads an empty retention layer.
	const localMessagesRef = useRef<readonly LogMessage[]>([]);
	const openParamMessagesRef = useRef<readonly LogMessage[]>([]);

	const handleFilterChange = useCallback((f: FilterLevel) => {
		setFilter(f);
		setCurrentFilterLevel(f);
	}, []);

	const handleAutoScrollChange = useCallback((v: boolean) => {
		setAutoScroll(v);
	}, []);

	// Issue #151 dual-clear: wipe both the in-session buffer AND the
	// cross-process CEP shared-storage retention. The retained layer
	// is what survives panel reload / AE process restart, so a single
	// in-session-only clear left it untouched and the bus subscriber
	// revived the cleared entries on the next emit (see Issue #138
	// acceptance criterion "explicit Clear should also wipe retained
	// history").
	//
	// Order (round-7 reorder):
	//   1. Reset the local closure refs + React state SYNCHRONOUSLY so
	//      the UI empties the moment the operator clicks Clear, with no
	//      window in which the bus is empty but the panel still shows
	//      the pre-clear list. This is the round-3 fix; without it the
	//      UI continued to display `localMessages` until the next
	//      subscriber tick, which on a quiet session never came.
	//   2. Advance the cross-surface tombstone (`setClearedAt`)
	//      BEFORE the canonical bus wipe. Round-6 + round-7 rationale:
	//      any peer that observes a new replay snapshot AFTER this
	//      point captures the new boundary, and the consumer-arrival
	//      re-check on the canonical LogBus (round-7 Fix 1) drops any
	//      pre-Clear entries that the bus subscriber receives during
	//      the wipe window. Round-6 only patched the three CEP
	//      delivery paths (transport replay-response, transport live
	//      publish, legacy debug-event channel); round-7 closes the
	//      canonical LogBus path too.
	//   3. Wipe the canonical LogBus. The bus calls `sub(this._buffer)`
	//      with the now-empty buffer; the consumer's clearedAt
	//      re-check still applies, and the merge collapses to `[]`
	//      because `localMessagesRef` is already empty.
	//   4. Wipe the retained CEP shared storage last. Doing it after
	//      the bus wipe means the bus subscribers stop receiving
	//      pre-Clear rows before we touch the cross-process retention
	//      — so even if a peer is mid-replay when we wipe, the bus
	//      emits are quiesced first and the consumer never has to
	//      reason about pre-Clear rows re-entering `localMessagesRef`
	//      after the wipe.
	//   5. On retained failure we surface the error via the
	//      debug-console log channel but do NOT undo the in-session
	//      clear — the operator asked for a wipe, the in-session half
	//      is the part they can see immediately.
	const handleClear = useCallback(async () => {
		localMessagesRef.current = [];
		openParamMessagesRef.current = [];
		setMessages([]);
		setCurrentMessageCount(0);
		try {
			// Issue #151 round-7: Clear sequence reorder. Bump the
			// cross-surface tombstone FIRST so any in-flight replay
			// snapshot a peer generates AFTER this point captures the
			// new boundary. THEN wipe the canonical LogBus so its
			// subscribers stop emitting pre-Clear entries. FINALLY wipe
			// the retained CEP shared storage. The new sequence:
			//
			//   1. setClearedAt(window, Date.now()) — boundary established
			//   2. clearEntries() — canonical bus wiped; subscribers
			//      stop receiving pre-Clear rows
			//   3. clearSharedLogs(window) — retained storage wiped last
			//
			// Combined with Fix 1 (subscribeLog consumer-arrival
			// clearedAt re-check), any log that fires between step 1
			// and step 2 is filtered at the subscriber boundary using
			// the new tombstone. The previous round-6 ordering
			// interleaved `clearSharedLogs()` and `setClearedAt()`
			// inside `clearRetainedLogs()`, opening a window where the
			// bus subscriber could receive the pre-Clear buffer with
			// the OLD tombstone — the canonical LogBus consumer never
			// re-read the tombstone, so pre-Clear rows merged into
			// `localMessagesRef` and the follow-up empty-buffer
			// notification's `[]` merge kept them there.
			await setClearedAt(window, Date.now());
			clearEntries();
			await clearSharedLogs(window);
		} catch (err) {
			debugConsoleLog.error("[debug-console] retained clear failed", {
				context: {
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}
	}, []);

	const handleCommandExecute = useCallback((code: string) => {
		debugConsoleLog.log(`> ${code}`);
		executeCommand(code);
	}, []);

	const handleContextMenuSelect = useCallback(
		(menuId: string) => {
			switch (menuId as (typeof DEBUG_CTX_IDS)[keyof typeof DEBUG_CTX_IDS]) {
				case DEBUG_CTX_IDS.copyMessage: {
					const lastId = getLastCtxMessageId();
					const msg = lastId
						? messages.find((m) => m.id === lastId)
						: undefined;
					if (msg) void navigator.clipboard.writeText(msg.text);
					break;
				}
				case DEBUG_CTX_IDS.clearMessages:
					// Issue #151 dual-clear: see `handleClear` above.
					// Round-3 fix: the local closure ref + React state
					// are reset synchronously before the async clear
					// fires, so the context-menu path is symmetric with
					// the header button — both empties the UI atomically
					// with the bus wipe.
					localMessagesRef.current = [];
					openParamMessagesRef.current = [];
					setMessages([]);
					setCurrentMessageCount(0);
					void (async () => {
						try {
							// Issue #151 round-7: Clear sequence reorder —
							// see `handleClear` above. The cross-surface
							// boundary advances FIRST so concurrent peers
							// observe the new boundary before they
							// generate their next replay snapshot, then
							// the canonical LogBus is wiped, then the
							// retained CEP shared storage is cleared.
							await setClearedAt(window, Date.now());
							clearEntries();
							await clearSharedLogs(window);
						} catch (err) {
							debugConsoleLog.error("[debug-console] retained clear failed", {
								context: {
									error: err instanceof Error ? err.message : String(err),
								},
							});
						}
					})();
					break;
				case DEBUG_CTX_IDS.copyAllMessages: {
					const text = messagesRef.current?.textContent ?? "";
					void navigator.clipboard.writeText(text);
					break;
				}
				case DEBUG_CTX_IDS.toggleAutoScroll:
					setAutoScroll((v) => !v);
					break;
				case DEBUG_CTX_IDS.filterAll:
					handleFilterChange("all");
					break;
				case DEBUG_CTX_IDS.filterLog:
					handleFilterChange("log");
					break;
				case DEBUG_CTX_IDS.filterInfo:
					handleFilterChange("info");
					break;
				case DEBUG_CTX_IDS.filterWarn:
					handleFilterChange("warn");
					break;
				case DEBUG_CTX_IDS.filterError:
					handleFilterChange("error");
					break;
				default:
					break;
			}
			onContextMenuSelect?.(menuId);
		},
		[handleFilterChange, onContextMenuSelect, messages],
	);

	const _handleScroll = useCallback(() => {
		if (!messagesRef.current) return;
		const el = messagesRef.current;
		const { scrollTop, scrollHeight, clientHeight } = el;
		setAutoScroll(scrollHeight - scrollTop - clientHeight < 20);
	}, []);

	// Subscribe to log messages from shared CEP storage (cross-surface)
	useEffect(() => {
		let mounted = true;

		// Issue #151 round-3: `localMessages` and `openParamMessages`
		// live on refs (not on the effect's closure) so the Clear
		// handlers can reset them without re-running this effect.
		// All five subscriber callbacks read through these refs.
		//
		// Issue #151 round-4: `readOpenParamsFromWindow` is now async
		// because the clearedAt tombstone filter needs to read shared
		// storage before the boot snapshot can be filtered. We seed the
		// ref with an empty array synchronously so the effect runs
		// without flickering, then overwrite once the filter resolves.
		openParamMessagesRef.current = [];
		void readOpenParamsFromWindow(window).then((logs) => {
			if (!mounted) return;
			openParamMessagesRef.current = logs;
			const merged = mergeLogMessages(logs, localMessagesRef.current);
			localMessagesRef.current = merged;
			setMessages(merged);
			setCurrentMessageCount(merged.length);
		});
		const appendLocalMessage = (message: LogMessage) => {
			if (!mounted) return;
			localMessagesRef.current = mergeLogMessages(localMessagesRef.current, [
				message,
			]);
			const merged = mergeLogMessages(
				openParamMessagesRef.current,
				localMessagesRef.current,
			);
			setMessages(merged);
			setCurrentMessageCount(merged.length);
		};

		appendLocalMessage(
			makeDebugMessage("info", "[ty-plus] Debug console booted"),
		);

		// Subscribe for updates
		const unsub = subscribeSharedLogs(window, (logs) => {
			if (mounted) {
				const merged = mergeLogMessages(
					openParamMessagesRef.current,
					localMessagesRef.current,
					logs,
				);
				localMessagesRef.current = merged;
				setMessages(merged);
				setCurrentMessageCount(merged.length);
			}
		});
		const unsubLocal = subscribe((logs) => {
			if (!mounted) return;
			// Issue #151 round-8: consumer-arrival clearedAt re-check on the
			// legacy `interceptor.subscribe()` path. `interceptor.ts` mirrors
			// the entire canonical LogBus ring buffer into `_messages` on every
			// LogBus.emit() (see `subscribeLog` callback at lines ~440-466 of
			// interceptor.ts) and then calls `notify()`, which delivers the
			// full `_messages` snapshot to every `subscribe()` subscriber.
			// The bridge therefore reproduces the same race the round-7
			// canonical `subscribeLog` consumer was unprotected against: a log
			// that fires between `setClearedAt()` and `clearEntries()` lands in
			// `_messages` alongside the pre-Clear rows, and the consumer
			// receives `[pre-Clear, post-Clear]` in one shot. Re-read the
			// tombstone as the LAST async step before merging so the legacy
			// path cannot resurrect wiped rows.
			void (async () => {
				if (!mounted) return;
				const clearedAt = await getClearedAt(window);
				const filtered = filterLogsByClearedAt(logs, clearedAt);
				if (filtered.length === 0) return;
				const merged = mergeLogMessages(
					openParamMessagesRef.current,
					localMessagesRef.current,
					filtered,
				);
				localMessagesRef.current = merged;
				setMessages(merged);
				setCurrentMessageCount(merged.length);
			})();
		});
		const transport = createCepSurfaceTransport(window);
		// Issue #129: replay-request correlation. The listener matches
		// responses by `correlationId`. We reuse a single id for
		// `messageId`, `correlationId`, and the inner `payload.requestId`
		// so any surface responding can pair by either field. Once
		// consumed the id leaves the set so we never double-ingest.
		const myReplayRequestIds = new Set<string>();
		const makeReplayRequestId = (): string => {
			const id =
				typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
					? crypto.randomUUID()
					: `replay-req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
			myReplayRequestIds.add(id);
			return id;
		};
		const unsubTransport = transport.subscribe(
			(envelope: SurfaceMessageEnvelope) => {
				if (!mounted) return;
				if (envelope.channel !== LOG_SURFACE_CHANNEL) return;
				// Replay response: ingest the entries it carries, then drop
				// the correlation id so subsequent responses for the same
				// id (impossible in practice, but defensive) do not retry.
				if (
					envelope.kind === "response" &&
					envelope.correlationId &&
					myReplayRequestIds.has(envelope.correlationId) &&
					envelope.payload &&
					typeof envelope.payload === "object" &&
					(envelope.payload as { kind?: unknown }).kind === "replay-response"
				) {
					const replayEntries = (envelope.payload as { entries?: unknown })
						.entries;
					if (!Array.isArray(replayEntries)) return;
					const accepted: LogMessage[] = [];
					for (const raw of replayEntries) {
						if (isSanitizedLogWirePayload(raw)) {
							accepted.push(wirePayloadToLogMessage(raw));
						}
					}
					if (accepted.length === 0) return;
					myReplayRequestIds.delete(envelope.correlationId);
					// Issue #151 round-6: consumer-arrival clearedAt re-check.
					// The peer's snapshot may have been generated before the
					// operator pressed Clear; re-read the tombstone as the
					// LAST async step before merging so a late-arriving
					// response cannot resurrect pre-Clear entries on screen.
					void (async () => {
						if (!mounted) return;
						const clearedAt = await getClearedAt(window);
						const filtered = filterLogsByClearedAt(accepted, clearedAt);
						if (filtered.length === 0) return;
						localMessagesRef.current = mergeLogMessages(
							openParamMessagesRef.current,
							localMessagesRef.current,
							filtered,
						);
						setMessages(localMessagesRef.current);
						setCurrentMessageCount(localMessagesRef.current.length);
					})();
					return;
				}
				// Live publish envelope — must already be a sanitized wire payload.
				if (envelope.kind !== "publish") return;
				if (!isSanitizedLogWirePayload(envelope.payload)) return;
				// Issue #151 round-6: same consumer-arrival clearedAt
				// re-check for live `kind: "publish"` envelopes. A Clear
				// that fires between the peer's `createLogger` emit and
				// this envelope's delivery must not resurrect the row.
				// Capture the sanitized payload into a local so the
				// narrowing survives into the async closure.
				const livePayload = envelope.payload;
				void (async () => {
					if (!mounted) return;
					const clearedAt = await getClearedAt(window);
					const filtered = filterLogsByClearedAt(
						[wirePayloadToLogMessage(livePayload)],
						clearedAt,
					);
					if (filtered.length === 0) return;
					const merged = mergeLogMessages(
						openParamMessagesRef.current,
						localMessagesRef.current,
						filtered,
					);
					localMessagesRef.current = merged;
					setMessages(merged);
					setCurrentMessageCount(merged.length);
				})();
			},
		);
		// Send the replay request AFTER the listener is attached so the
		// response handler is ready to receive the response envelope.
		// No `targetSurfaceId` → broadcast; every surface answers.
		const replayRequestId = makeReplayRequestId();
		const publishPromise = transport.publish({
			messageId: replayRequestId,
			correlationId: replayRequestId,
			channel: LOG_SURFACE_CHANNEL,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: {
				kind: "replay-request",
				requestId: replayRequestId,
				maxEntries: DEBUG_LOG_REPLAY_MAX_ENTRIES,
			},
			createdAt: Date.now(),
		});
		if (
			publishPromise &&
			typeof (publishPromise as Promise<unknown>).catch === "function"
		) {
			(publishPromise as Promise<unknown>).catch(() => {
				/* noop — the legacy fallback paths still show in-context logs */
			});
		}
		const unsubDebugEvents = subscribeDebugLogEvents(window, (message) => {
			if (!mounted) return;
			// Issue #151 round-6: consumer-arrival clearedAt re-check.
			// The legacy `subscribeDebugLogEvents` path delivers events
			// that may have been emitted before a Clear; the tombstone
			// filter at delivery is the only thing standing between a
			// late in-flight message and a UI ghost of a wiped row.
			void (async () => {
				if (!mounted) return;
				const clearedAt = await getClearedAt(window);
				const filtered = filterLogsByClearedAt([message], clearedAt);
				if (filtered.length === 0) return;
				const merged = mergeLogMessages(
					openParamMessagesRef.current,
					localMessagesRef.current,
					filtered,
				);
				localMessagesRef.current = merged;
				setMessages(merged);
				setCurrentMessageCount(merged.length);
			})();
		});
		// Issue #129: also subscribe directly to the canonical LogBus so
		// entries emitted via `createLogger(source).info(...)` from any
		// surface on this JS context are observed here, even if the legacy
		// console-interceptor bridge and the CEP cross-surface broadcast
		// are both unavailable (e.g. during production build where
		// `dropConsoleLogInfoPlugin` strips `console.*`).
		const unsubLog = subscribeLog((entries) => {
			if (!mounted) return;
			// Issue #151 round-7: consumer-arrival clearedAt re-check on
			// the canonical LogBus. `LogBus.emit()` passes the entire
			// ring buffer to every subscriber on each emit, so the
			// `entries` argument can carry pre-Clear rows whose
			// timestamps predate the current tombstone. Re-read the
			// tombstone as the LAST async step before merging so a
			// late-arriving emit (one that fired between the snapshot
			// read and the Clear boundary being advanced) cannot
			// resurrect wiped rows.
			//
			// Round-6 closed the same hole on three CEP delivery paths
			// (transport replay-response, transport live publish, legacy
			// debug-event channel). Round-7 closes it on the canonical
			// LogBus path too — the one path round-6 missed because
			// `LogBus.emit()`'s `sub(this._buffer)` semantics were not
			// surfaced until the user's independent re-review.
			const incoming = entries.map(logEntryToMessage);
			void (async () => {
				if (!mounted) return;
				const clearedAt = await getClearedAt(window);
				const filtered = filterLogsByClearedAt(incoming, clearedAt);
				if (filtered.length === 0) return;
				const merged = mergeLogMessages(
					openParamMessagesRef.current,
					localMessagesRef.current,
					filtered,
				);
				localMessagesRef.current = merged;
				setMessages(merged);
				setCurrentMessageCount(merged.length);
			})();
		});

		return () => {
			mounted = false;
			localMessagesRef.current = [];
			openParamMessagesRef.current = [];
			unsub();
			unsubLocal();
			unsubTransport();
			unsubDebugEvents();
			unsubLog();
		};
	}, []);

	// Auto-scroll on new messages
	useEffect(() => {
		if (autoScroll && messagesRef.current) {
			messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
		}
	}, [autoScroll]);

	// Native DOM listener to capture right-click message id before CEP contextmenu
	useEffect(() => {
		const el = messagesRef.current;
		if (!el) return;
		const onCtx = (ev: Event) => {
			const me = ev as MouseEvent;
			const row = (me.target as Element | null)?.closest("[data-debug-msg-id]");
			setLastCtxMessageId(row?.getAttribute("data-debug-msg-id") ?? null);
		};
		el.addEventListener("contextmenu", onCtx, true);
		return () => el.removeEventListener("contextmenu", onCtx, true);
	}, []);

	// Handle context menu selection from CEP
	useEffect(() => {
		const handler = (menuId: string) => {
			debugConsoleLog.info("[debug-console] context menu action", {
				context: { menuId },
			});
			handleContextMenuSelect(menuId);
			onContextMenuSelect?.(menuId);
		};
		// Wire up to receive context menu events via window
		const win = window as Window & {
			__tyPlusDebugCtxHandler?: (id: string) => void;
		};
		win.__tyPlusDebugCtxHandler = handler;
		return () => {
			win.__tyPlusDebugCtxHandler = undefined;
		};
	}, [handleContextMenuSelect, onContextMenuSelect]);

	return (
		<Panel
			messages={messages}
			filter={filter}
			autoScroll={autoScroll}
			onFilterChange={handleFilterChange}
			onAutoScrollChange={handleAutoScrollChange}
			onClear={handleClear}
			onCommandExecute={handleCommandExecute}
			messagesRef={messagesRef}
		/>
	);
}
