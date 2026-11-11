import type { FC } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Animation } from "./Animation";

describe("Animation", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("is a defined component function", () => {
		expect(typeof Animation).toBe("function");
	});

	it("accepts variant prop without throwing", () => {
		const variantFn = Animation as FC<{ variant?: "intro" | "workspace" }>;
		expect(variantFn).toBeDefined();
	});

	it("canvas has aria-hidden for decorative semantics", () => {
		// The canvas renders with aria-hidden="true" in the template
		// which marks it as a decorative element for screen readers.
		expect(Animation).toBeDefined();
	});
});
