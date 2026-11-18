import { beforeEach, describe, expect, it } from "vitest";

import { _resetBusForTests, getEntries } from "@/management/debug/logger";
import { runCepEvalScript } from "@/management/storage/cep";

/**
 * Issue #71: some CEP hosts invoke the evalScript callback with a DOM
 * Event (or another non-string) instead of the script result — the same
 * value the host reports as "Uncaught [object Event]". The wrapper must
 * resolve "null" (the existing empty-result fallback) and leave a warn
 * on the diagnostic bus instead of leaking the raw value into
 * JSON.parse callers.
 */
const winWithEvalResult = (value: unknown): Window =>
	({
		__adobe_cep__: {
			evalScript: (_script: string, callback: (result: string) => void) => {
				callback(value as string);
			},
		},
	}) as unknown as Window;

describe("runCepEvalScript non-string result guard (Issue #71)", () => {
	beforeEach(() => {
		_resetBusForTests();
	});

	it("resolves 'null' and logs a warning when the callback gets an Event", async () => {
		const win = winWithEvalResult(new Event("com.typlus.surfaceMessage"));

		await expect(runCepEvalScript(win, "1+1")).resolves.toBe("null");

		const warns = getEntries().filter(
			(e) => e.source === "workspace" && e.level === "warn",
		);
		expect(warns.some((e) => e.message.includes("non-string result"))).toBe(
			true,
		);
		const entry = warns.find((e) => e.message.includes("non-string result"));
		expect(entry?.context?.resultKind).toBe("Event[com.typlus.surfaceMessage]");
	});

	it("resolves 'null' for other non-string values without throwing", async () => {
		const win = winWithEvalResult({ unexpected: true });
		await expect(runCepEvalScript(win, "1+1")).resolves.toBe("null");
	});

	it("passes string results through unchanged", async () => {
		const win = winWithEvalResult('{"ok":true}');
		await expect(runCepEvalScript(win, "1+1")).resolves.toBe('{"ok":true}');
	});
});
