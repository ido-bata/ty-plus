// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { __resetDropGuardForTests, installDropGuard } from "./drop-guard";

const dispatchCancelable = (target: EventTarget, type: string): Event => {
	const event = new Event(type, { bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
};

afterEach(() => {
	__resetDropGuardForTests();
});

describe("installDropGuard (Issue #139)", () => {
	it("prevents the default action for window-level dragover", () => {
		installDropGuard(window);
		const event = dispatchCancelable(window, "dragover");
		expect(event.defaultPrevented).toBe(true);
	});

	it("prevents the default action for window-level drop", () => {
		installDropGuard(window);
		const event = dispatchCancelable(window, "drop");
		expect(event.defaultPrevented).toBe(true);
	});

	it("does not see drops stopped by a legitimate drop target", () => {
		installDropGuard(window);
		const zone = document.createElement("div");
		document.body.appendChild(zone);
		// Mirrors FileDropZone / dialog Layout: they stopPropagation so the
		// window bubble-phase guard never observes the drop. Without the
		// zone's own preventDefault, defaultPrevented staying false proves
		// the window listener did not run.
		zone.addEventListener("drop", (event) => {
			event.stopPropagation();
		});
		const event = dispatchCancelable(zone, "drop");
		expect(event.defaultPrevented).toBe(false);
		zone.remove();
	});

	it("leaves an unstopped child drop to reach the window guard", () => {
		installDropGuard(window);
		const child = document.createElement("div");
		document.body.appendChild(child);
		const event = dispatchCancelable(child, "drop");
		expect(event.defaultPrevented).toBe(true);
		child.remove();
	});

	it("is idempotent for the same window", () => {
		installDropGuard(window);
		installDropGuard(window);
		const event = dispatchCancelable(window, "drop");
		expect(event.defaultPrevented).toBe(true);
	});
});
