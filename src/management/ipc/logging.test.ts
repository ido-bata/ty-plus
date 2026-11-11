import { describe, expect, it } from "vitest";
import { StructuredLogger } from "./logging";

describe("StructuredLogger", () => {
	it("creates a logger", () => {
		const logger = new StructuredLogger();
		expect(logger.getEntries()).toHaveLength(0);
	});

	it("generates unique correlation IDs", () => {
		const logger = new StructuredLogger();
		const id1 = logger.generateCorrelationId();
		const id2 = logger.generateCorrelationId();
		expect(id1).not.toBe(id2);
	});

	it("logs debug messages", () => {
		const logger = new StructuredLogger();
		logger.debug("test message");
		const entries = logger.getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe("debug");
		expect(entries[0].message).toBe("test message");
	});

	it("logs info messages", () => {
		const logger = new StructuredLogger();
		logger.info("test message");
		expect(logger.getEntries()[0].level).toBe("info");
	});

	it("logs warn messages", () => {
		const logger = new StructuredLogger();
		logger.warn("test message");
		expect(logger.getEntries()[0].level).toBe("warn");
	});

	it("logs error messages with error object", () => {
		const logger = new StructuredLogger();
		const error = new Error("test error");
		logger.error("test message", error);
		const entry = logger.getEntries()[0];
		expect(entry.level).toBe("error");
		expect(entry.error).toBe(error);
	});

	it("includes correlation ID in log entries", () => {
		const logger = new StructuredLogger();
		logger.info("test message", undefined, "corr-123");
		expect(logger.getEntries()[0].correlationId).toBe("corr-123");
	});

	it("filters entries by correlation ID", () => {
		const logger = new StructuredLogger();
		logger.info("msg1", undefined, "corr-1");
		logger.info("msg2", undefined, "corr-2");
		logger.info("msg3", undefined, "corr-1");

		const filtered = logger.getEntriesByCorrelationId("corr-1");
		expect(filtered).toHaveLength(2);
	});

	it("redacts sensitive fields", () => {
		const logger = new StructuredLogger();
		logger.info("test", { password: "secret123", token: "abc" });
		const entry = logger.getEntries()[0];
		expect(entry.data?.password).toBe("[REDACTED]");
		expect(entry.data?.token).toBe("[REDACTED]");
	});

	it("redacts patterns in messages", () => {
		const logger = new StructuredLogger({
			redactPatterns: [/password=\S+/gi],
		});
		logger.info("user password=secret123 logged in");
		expect(logger.getEntries()[0].message).toContain("[REDACTED]");
	});

	it("clears log entries", () => {
		const logger = new StructuredLogger();
		logger.info("test");
		logger.clear();
		expect(logger.getEntries()).toHaveLength(0);
	});
});
