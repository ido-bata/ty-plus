// @vitest-environment happy-dom

/**
 * Issue #140: global error / unhandled-rejection reporting must route
 * window-level failures into the debug log bus so they are diagnosable
 * instead of silently killing the panel.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installGlobalErrorReporting } from "@/management/debug/global-error-reporter";
import { clearEntries, getEntries } from "@/management/debug/logger";

const uninstalls: Array<() => void> = [];

const install = (source: "panel" | "modeless" = "panel") => {
	const uninstall = installGlobalErrorReporting(window, source);
	uninstalls.push(uninstall);
	return uninstall;
};

const dispatchUnhandledRejection = (reason: unknown): void => {
	// happy-dom does not provide PromiseRejectionEvent; a plain Event with a
	// `reason` property is what the listener contract actually reads.
	const event = new Event("unhandledrejection");
	Object.defineProperty(event, "reason", { value: reason });
	window.dispatchEvent(event);
};

describe("installGlobalErrorReporting (Issue #140)", () => {
	beforeEach(() => {
		clearEntries();
	});

	afterEach(() => {
		while (uninstalls.length > 0) {
			uninstalls.pop()?.();
		}
	});

	it("logs window error events as error-level panel entries", () => {
		install();

		window.dispatchEvent(
			new ErrorEvent("error", {
				message: "boom",
				error: new TypeError("bad type"),
			}),
		);

		const entries = getEntries().filter((e) => e.action === "global:error");
		expect(entries).toHaveLength(1);
		expect(entries[0]?.level).toBe("error");
		expect(entries[0]?.source).toBe("panel");
		expect(entries[0]?.message).toBe("window error");
	});

	it("logs unhandled promise rejections", () => {
		install();

		dispatchUnhandledRejection(new Error("async boom"));

		const entries = getEntries().filter(
			(e) => e.action === "global:unhandledrejection",
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.level).toBe("error");
		expect(entries[0]?.source).toBe("panel");
		expect(entries[0]?.message).toBe("unhandled promise rejection");
	});

	it("stops reporting after uninstall", () => {
		install()();

		window.dispatchEvent(new ErrorEvent("error", { message: "late" }));
		expect(
			getEntries().filter((e) => e.action === "global:error"),
		).toHaveLength(0);
	});
});
