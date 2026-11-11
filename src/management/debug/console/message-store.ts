import type { LogMessage } from "@/management/debug/console/interceptor";

export interface MessageEntry {
	id: string;
	timestamp: Date;
	level: LogMessage["level"];
	text: string;
	source?: LogMessage["source"];
	/** Structured fields survive the merge — dedupe is by id only. */
	action?: LogMessage["action"];
	context?: LogMessage["context"];
}

export const toMessageEntry = (msg: LogMessage): MessageEntry => ({
	id: msg.id,
	timestamp: msg.timestamp,
	level: msg.level,
	text: msg.text,
	source: msg.source,
	...(msg.action ? { action: msg.action } : {}),
	...(msg.context ? { context: msg.context } : {}),
});

export const mergeMessageEntries = (
	current: readonly MessageEntry[],
	incoming: readonly LogMessage[],
): MessageEntry[] => {
	const byId = new Map(current.map((msg) => [msg.id, msg] as const));
	for (const msg of incoming) {
		byId.set(msg.id, toMessageEntry(msg));
	}
	return [...byId.values()].sort(
		(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
	);
};

export const mergeLogMessages = (
	...sources: readonly (readonly LogMessage[])[]
): LogMessage[] => {
	const byId = new Map<string, LogMessage>();
	for (const source of sources) {
		for (const msg of source) {
			byId.set(msg.id, msg);
		}
	}
	return [...byId.values()].sort(
		(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
	);
};
