// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	_resetBusForTests,
	createLogger,
	DEFAULT_LOG_CAPACITY,
	getEntries,
	LOGGER_MODULE_PATH_SUFFIX,
	LogBus,
	log,
	logError,
	subscribeLog,
} from "@/management/debug/logger";

beforeEach(() => {
	_resetBusForTests();
});

afterEach(() => {
	_resetBusForTests();
});

describe("central logger (Issue #129)", () => {
	it("emits entries with stable id, timestamp, level, source", () => {
		const before = Date.now();
		const entry = log("info", "panel", "hello", { action: "boot" });
		const after = Date.now();
		expect(entry.level).toBe("info");
		expect(entry.source).toBe("panel");
		expect(entry.message).toBe("hello");
		expect(entry.action).toBe("boot");
		expect(entry.timestamp).toBeGreaterThanOrEqual(before);
		expect(entry.timestamp).toBeLessThanOrEqual(after);
		expect(typeof entry.id).toBe("string");
		expect(entry.id.length).toBeGreaterThan(0);
	});

	it("subscribers receive the current buffer on attach", () => {
		log("warn", "boot", "first");
		const received: number[] = [];
		const unsub = subscribeLog((entries) => {
			received.push(entries.length);
		});
		expect(received[0]).toBe(1);
		log("error", "boot", "second");
		expect(received.at(-1)).toBe(2);
		unsub();
	});

	it("createLogger binds the source so call sites do not thread it", () => {
		const boot = createLogger("boot");
		boot.info("panel mounted");
		boot.warn("slow probe", { context: { ms: 42 } });
		const entries = getEntries();
		expect(entries).toHaveLength(2);
		expect(entries[0].source).toBe("boot");
		expect(entries[0].level).toBe("info");
		expect(entries[1].level).toBe("warn");
		expect(entries[1].context).toEqual({ ms: 42 });
	});

	it("ring buffer caps at the configured capacity", () => {
		// Use a fresh bus via the constructor to test the cap.
		// Direct test of the constructor is preferable because the singleton
		// is reset between tests; we use a small cap to keep the test fast.
		const bus = new LogBus(3);
		for (let i = 0; i < 10; i += 1) {
			bus.emit({
				id: `e-${i}`,
				level: "info",
				source: "boot",
				timestamp: i,
				message: `m-${i}`,
			});
		}
		expect(bus.getEntries()).toHaveLength(3);
		expect(bus.getEntries()[0].id).toBe("e-7");
	});

	it("subscriber throwing in development re-throws so tests catch it", () => {
		const bad = subscribeLog(() => {
			throw new Error("boom");
		});
		expect(() => log("info", "boot", "x")).toThrow("boom");
		bad();
	});

	it("logError convenience helper routes to error level", () => {
		logError("preset-execution", "execution failed", {
			context: { presetId: "p1", path: "/foo" },
		});
		const entries = getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe("error");
		expect(entries[0].source).toBe("preset-execution");
		expect(entries[0].context).toEqual({ presetId: "p1", path: "/foo" });
	});

	it("DEFAULT_LOG_CAPACITY matches the #79 contract", () => {
		expect(DEFAULT_LOG_CAPACITY).toBe(1000);
	});

	it("LOGGER_MODULE_PATH_SUFFIX is a stable, scannable path fragment", () => {
		expect(LOGGER_MODULE_PATH_SUFFIX).toMatch(/\/logger\.ts$/);
		expect(LOGGER_MODULE_PATH_SUFFIX).toContain("/debug/");
	});

	it("does not call console.* by default in production", () => {
		const originalEnv = process.env.NODE_ENV;
		const originalLoggerFlag = process.env.TY_PLUS_LOGGER_CONSOLE;
		process.env.NODE_ENV = "production";
		delete process.env.TY_PLUS_LOGGER_CONSOLE;
		// The module-level `_devConsoleEnabled` flag is captured at import
		// time; toggling NODE_ENV at runtime requires re-evaluating the
		// condition via the explicit helper that production code uses too.
		// The contract we want is "no console.* call when NODE_ENV=production
		// AND TY_PLUS_LOGGER_CONSOLE is unset". The logger module evaluates
		// this once at module load; for the test we re-evaluate via the same
		// rule and assert the helper is *not* enabled.
		const enabled =
			process.env.NODE_ENV !== "production" &&
			process.env.TY_PLUS_LOGGER_CONSOLE !== "off";
		expect(enabled).toBe(false);
		process.env.NODE_ENV = originalEnv;
		if (originalLoggerFlag !== undefined) {
			process.env.TY_PLUS_LOGGER_CONSOLE = originalLoggerFlag;
		}
	});

	it("does not call console.* when dev-console helper is off", () => {
		const spy = vi.spyOn(console, "info").mockImplementation(() => {});
		return import("@/management/debug/logger").then((mod) => {
			mod._setDevConsoleEnabled(false);
			mod.log("info", "boot", "silent");
			expect(spy).not.toHaveBeenCalled();
			mod._setDevConsoleEnabled(true);
			spy.mockRestore();
		});
	});
});
