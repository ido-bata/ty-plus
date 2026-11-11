import { readCepOpenParams } from "@/management/ae/cep/transport";
import {
	isLogWirePayload,
	toLogWirePayload,
	wirePayloadToLogMessage,
} from "@/management/debug/console/interceptor";
import {
	filterWireByClearedAt,
	getClearedAt,
} from "@/management/debug/console/shared-bridge";
import type { LogMessage, WirePayload } from "@/management/debug/console/types";

type OpenParams = {
	initialLogs?: unknown;
};

const MAX_OPEN_PARAM_LOGS = 200;

export const toOpenParams = (
	messages: readonly LogMessage[],
): { surfaceId: "debug-console"; initialLogs: WirePayload[] } => ({
	surfaceId: "debug-console",
	// The boot snapshot goes through the same codec as every other wire
	// hop so `action` / `context` survive into the dialog window that has
	// no other way to learn them (Issue #138 → #158).
	initialLogs: messages.slice(-MAX_OPEN_PARAM_LOGS).map(toLogWirePayload),
});

const readOpenParams = (value: unknown): LogMessage[] => {
	if (!value || typeof value !== "object") {
		return [];
	}
	const raw = (value as OpenParams).initialLogs;
	if (!Array.isArray(raw)) {
		return [];
	}
	const logs: LogMessage[] = [];
	for (const item of raw) {
		if (!isLogWirePayload(item)) continue;
		logs.push(wirePayloadToLogMessage(item));
	}
	return logs;
};

/**
 * Issue #151 round-5: tombstone-aware read of the open-params boot
 * snapshot with the consumer-arrival check.
 *
 * `openDebugConsole` writes the current bus snapshot into the dialog
 * open-params payload (`toOpenParams(getMessages())`);
 * `readOpenParamsFromWindow` decodes that payload on the dialog side.
 * If a Clear fires between the snapshot write and the dialog open,
 * the payload still carries the pre-Clear rows. The clearedAt
 * tombstone is the cross-surface boundary that protects against this
 * race: we read it here and drop any row whose timestamp predates the
 * boundary.
 *
 * Round-5: the tombstone is re-read as the LAST async step before
 * returning, so a `delayed read → Clear → delayed result resolve`
 * race cannot resurrect pre-Clear entries. The previous round-4
 * implementation also re-read at the end, but the helper was inline
 * inside the function — round-5 splits the read and the filter into
 * two explicit awaits so the consumer-arrival window is one tick
 * shorter (no async work happens between the tombstone read and the
 * return statement).
 *
 * `getClearedAt` is best-effort and returns `null` when no Clear has
 * fired or the storage helper is unavailable, so the function remains
 * a strict superset of the previous behavior — no entries are dropped
 * unless a tombstone is present.
 */
export const readOpenParamsFromWindow = async (
	win: Window,
): Promise<LogMessage[]> => {
	const decoded = readOpenParams(readCepOpenParams(win));
	// Consumer-arrival: re-read the tombstone RIGHT before applying the
	// filter and returning. This is the same await order as round-4,
	// but the helper extraction documents the contract and makes the
	// race window one statement narrower (no `wire.map(...)` work
	// happens between the await and the return).
	const clearedAt = await getClearedAt(win);
	if (clearedAt == null) return decoded;
	const wire = decoded.map<WirePayload>(toLogWirePayload);
	return filterWireByClearedAt(wire, clearedAt).map(wirePayloadToLogMessage);
};
