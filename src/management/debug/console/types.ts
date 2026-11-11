// Platform-independent debug types for shared.
export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export type LogMessage = {
	id: string;
	level: LogLevel;
	/** Formatted text representation of all args */
	text: string;
	/** Raw args for richer display */
	args: unknown[];
	timestamp: Date;
	/** file:line extracted from stack trace, if available */
	source?: string;
	/**
	 * Canonical `LogEntry.action` — the short call-site identifier
	 * ("boot", "probe", "elevate"). Survives every hop so a reader on
	 * another surface can tell which step produced a row (Issue #158).
	 */
	action?: string;
	/**
	 * Canonical `LogEntry.context` — structured, opaque-to-the-viewer
	 * payload (request ids, generation counters, root classifications).
	 * Carried end-to-end so correlation data authored on one surface is
	 * readable on another.
	 */
	context?: Record<string, unknown>;
};

/** Serialized log line sent inside SurfaceMessageEnvelope.payload (JSON-safe). */
export type WirePayload = {
	v: 1;
	id: string;
	level: LogLevel;
	text: string;
	timestamp: string;
	source?: string;
	action?: string;
	context?: Record<string, unknown>;
};

type DebugInterceptor = {
	enable(): void;
	disable(): void;
	subscribe(cb: (msgs: readonly LogMessage[]) => void): () => void;
	getMessages(): readonly LogMessage[];
	clearMessages(): void;
};
