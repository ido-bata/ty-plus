/**
 * Log levels for structured logging.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured log entry.
 */
export interface LogEntry {
	/** Timestamp of the log entry. */
	readonly timestamp: Date;
	/** Log level. */
	readonly level: LogLevel;
	/** Log message. */
	readonly message: string;
	/** Correlation ID for request tracing. */
	readonly correlationId?: string;
	/** Additional structured data. */
	readonly data?: Record<string, unknown>;
	/** Error if this is an error log. */
	readonly error?: Error;
}

/**
 * Configuration for log redaction.
 */
export interface RedactionConfig {
	/** Fields to redact from log data. */
	readonly redactFields?: string[];
	/** Patterns to redact from log messages. */
	readonly redactPatterns?: RegExp[];
	/** Replacement text for redacted values. */
	readonly replacement?: string;
}

/**
 * Default fields that should be redacted.
 */
const DEFAULT_REDACT_FIELDS = [
	"password",
	"token",
	"secret",
	"apiKey",
	"api_key",
	"authorization",
	"cookie",
];

/**
 * Structured logger with correlation ID support and redaction.
 */
export class StructuredLogger {
	private readonly entries: LogEntry[] = [];
	private readonly redaction: Required<RedactionConfig>;
	private readonly redactFieldSet: Set<string>;
	private correlationIdCounter = 0;

	constructor(redaction?: RedactionConfig) {
		this.redaction = {
			redactFields: redaction?.redactFields ?? DEFAULT_REDACT_FIELDS,
			redactPatterns: redaction?.redactPatterns ?? [],
			replacement: redaction?.replacement ?? "[REDACTED]",
		};
		this.redactFieldSet = new Set(
			this.redaction.redactFields.map((f) => f.toLowerCase()),
		);
	}

	/**
	 * Generates a new correlation ID.
	 */
	generateCorrelationId(): string {
		return `corr-${++this.correlationIdCounter}-${Date.now()}`;
	}

	/**
	 * Logs a debug message.
	 */
	debug(
		message: string,
		data?: Record<string, unknown>,
		correlationId?: string,
	): void {
		this.log("debug", message, data, correlationId);
	}

	/**
	 * Logs an info message.
	 */
	info(
		message: string,
		data?: Record<string, unknown>,
		correlationId?: string,
	): void {
		this.log("info", message, data, correlationId);
	}

	/**
	 * Logs a warning message.
	 */
	warn(
		message: string,
		data?: Record<string, unknown>,
		correlationId?: string,
	): void {
		this.log("warn", message, data, correlationId);
	}

	/**
	 * Logs an error message.
	 */
	error(
		message: string,
		error?: Error,
		data?: Record<string, unknown>,
		correlationId?: string,
	): void {
		const entry: LogEntry = {
			timestamp: new Date(),
			level: "error",
			message: this.redactMessage(message),
			correlationId,
			data: data ? this.redactData(data) : undefined,
			error,
		};
		this.entries.push(entry);
	}

	/**
	 * Returns all log entries.
	 */
	getEntries(): readonly LogEntry[] {
		return this.entries;
	}

	/**
	 * Returns log entries filtered by correlation ID.
	 */
	getEntriesByCorrelationId(correlationId: string): readonly LogEntry[] {
		return this.entries.filter((e) => e.correlationId === correlationId);
	}

	/**
	 * Clears all log entries.
	 */
	clear(): void {
		this.entries.length = 0;
	}

	private log(
		level: LogLevel,
		message: string,
		data?: Record<string, unknown>,
		correlationId?: string,
	): void {
		const entry: LogEntry = {
			timestamp: new Date(),
			level,
			message: this.redactMessage(message),
			correlationId,
			data: data ? this.redactData(data) : undefined,
		};
		this.entries.push(entry);
	}

	private redactMessage(message: string): string {
		let redacted = message;
		for (const pattern of this.redaction.redactPatterns) {
			redacted = redacted.replace(pattern, this.redaction.replacement);
		}
		return redacted;
	}

	private redactData(data: Record<string, unknown>): Record<string, unknown> {
		const redacted: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data)) {
			if (this.redactFieldSet.has(key.toLowerCase())) {
				redacted[key] = this.redaction.replacement;
			} else if (typeof value === "string") {
				redacted[key] = this.redactMessage(value);
			} else {
				redacted[key] = value;
			}
		}
		return redacted;
	}
}
