/** Module-level last right-clicked message id (set by React, read by CEP callback) */
let lastCtxMessageId: string | null = null;

export function setLastCtxMessageId(id: string | null): void {
	lastCtxMessageId = id;
}

export function getLastCtxMessageId(): string | null {
	return lastCtxMessageId;
}

/** Module-level current filter level (set by React, read by buildPayload) */
let currentFilterLevel: "all" | "log" | "info" | "warn" | "error" = "all";

export function setCurrentFilterLevel(
	level: "all" | "log" | "info" | "warn" | "error",
): void {
	currentFilterLevel = level;
}

export function getCurrentFilterLevel():
	| "all"
	| "log"
	| "info"
	| "warn"
	| "error" {
	return currentFilterLevel;
}

/** Module-level current message count (set by React, read by buildPayload) */
let currentMessageCount = 0;

export function setCurrentMessageCount(count: number): void {
	currentMessageCount = count;
}

export function getCurrentMessageCount(): number {
	return currentMessageCount;
}
