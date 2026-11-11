import fs from "node:fs";
import { describe, expect, test } from "vitest";

const source = fs.readFileSync(new URL("./interceptor.ts", import.meta.url), {
	encoding: "utf8",
});

describe("console interceptor debug log transport", () => {
	test("publishes a dedicated CEP debug event in addition to the surface bus", () => {
		expect(source).toContain("DEBUG_LOG_EVENT");
		expect(source).toContain("subscribeDebugLogEvents");
		expect(source).toContain("csi.dispatchEvent?.(event)");
		expect(source).toContain("__adobe_cep__?.dispatchEvent?.(event)");
	});

	test("does not overwrite retained logs with an empty startup buffer", () => {
		expect(source).toContain("if (_messages.length > 0)");
		expect(source).toContain("await writeSharedLogs(win, _messages)");
	});

	test("clearLogs() clears both the legacy buffer and the canonical LogBus", () => {
		// Source-level contract: the public clear entry point must call
		// into the canonical bus clear path so the next emit() does not
		// re-notify subscribers with the historical buffer. See
		// `logger.ts#clearEntries`.
		expect(source).toContain("clearEntries");
		expect(source).toMatch(
			/clearLogs[\s\S]{0,160}clearMessages\(\)[\s\S]{0,40}clearEntries\(\)/,
		);
	});
});

describe("clearLogs layered semantics (Issue #151)", () => {
	test("clears the canonical LogBus so cleared entries do not 'revive' on the next emit", async () => {
		const { clearLogs } = await import(
			"@/management/debug/console/interceptor"
		);
		const { createLogger, getEntries } = await import(
			"@/management/debug/logger"
		);

		const logger = createLogger("boot");
		logger.info("pre-clear entry");
		logger.warn("pre-clear entry 2");
		expect(getEntries().length).toBeGreaterThan(0);

		await clearLogs();

		expect(getEntries()).toEqual([]);
	});

	test("clearLogs() does not require the win argument (canonical bus lives in JS context)", async () => {
		// The canonical bus lives in the JS context; `win` is accepted only
		// for source compatibility with the Issue #138 callers (`dialog-root`,
		// `ui.tsx`, `workspace/hook.ts`). Both layers clear without the
		// window object.
		const { clearLogs } = await import(
			"@/management/debug/console/interceptor"
		);
		const { createLogger, getEntries } = await import(
			"@/management/debug/logger"
		);

		createLogger("boot").error("entry before clear");
		await clearLogs();
		expect(getEntries()).toEqual([]);
	});
});
