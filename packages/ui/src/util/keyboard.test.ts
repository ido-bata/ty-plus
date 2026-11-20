/**
 * Unit tests for the IME composition helper.
 *
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from "vitest";
import { isIMEComposing } from "./keyboard";

describe("isIMEComposing", () => {
	it("returns true when isComposing flag is set (modern CEF/Chromium)", () => {
		const event = { isComposing: true } as unknown as KeyboardEvent;
		expect(isIMEComposing(event)).toBe(true);
	});

	it("returns true when keyCode is 229 (legacy CEF / IMEs that swallow keys)", () => {
		const event = {
			isComposing: false,
			keyCode: 229,
		} as unknown as KeyboardEvent;
		expect(isIMEComposing(event)).toBe(true);
	});

	it("returns false for ordinary key presses", () => {
		const event = {
			isComposing: false,
			keyCode: 13,
		} as unknown as KeyboardEvent;
		expect(isIMEComposing(event)).toBe(false);
	});

	it("returns false when both flags are missing (defensive default)", () => {
		const event = {} as unknown as KeyboardEvent;
		expect(isIMEComposing(event)).toBe(false);
	});

	it("accepts React KeyboardEvent shape (isComposing on the wrapper itself)", () => {
		const event = {
			isComposing: true,
			key: "Enter",
		} as unknown as KeyboardEvent;
		expect(isIMEComposing(event)).toBe(true);
	});
});
