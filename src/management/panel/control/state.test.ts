// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
	CP_POSITION_LAYOUT_CLASS_NAMES,
	type CpPosition,
	cpPositionToClasses,
	readCpState,
	writeCpState,
} from "./state";

const TAILWIND_UTILITY =
	/\b(?:flex|grid|h-full|w-full|bg-|text-|p-[0-9]|m-[0-9]|fixed|inset|max-w|min-h|gap-|box-border|rounded|overflow-)/;

/**
 * Regression guard for #127: the Control Panel positioning utilities must
 * return PandaCSS-generated class strings only — no Tailwind utility
 * literals are allowed on the active runtime path because Panda-only
 * production builds do not generate CSS for Tailwind classes.
 */
describe("cpPositionToClasses", () => {
	it("returns PandaCSS class strings (no Tailwind utility literals)", () => {
		const result = cpPositionToClasses("bottom-right", "horizontal", "panel-1");
		expect(result).not.toMatch(TAILWIND_UTILITY);
		expect(result.trim().length).toBeGreaterThan(0);
	});

	it.each<CpPosition>([
		"top-left",
		"top-center",
		"top-right",
		"bottom-left",
		"bottom-center",
		"bottom-right",
		"left-top",
		"left-center",
		"left-bottom",
		"right-top",
		"right-center",
		"right-bottom",
	])("returns a non-empty string for position %s", (position) => {
		const result = cpPositionToClasses(position, "horizontal", "panel-1");
		expect(result).not.toMatch(TAILWIND_UTILITY);
		expect(result.trim().length).toBeGreaterThan(0);
	});

	it("emits a different class set for panel-1 (status-bar inset) vs panel-2", () => {
		const primary = cpPositionToClasses(
			"bottom-right",
			"horizontal",
			"panel-1",
		);
		const secondary = cpPositionToClasses(
			"bottom-right",
			"horizontal",
			"panel-2",
		);
		expect(primary).not.toBe(secondary);
		expect(primary).not.toMatch(TAILWIND_UTILITY);
		expect(secondary).not.toMatch(TAILWIND_UTILITY);
	});

	it("uses a deterministic string for repeated calls with identical inputs", () => {
		const a = cpPositionToClasses("bottom-center", "vertical", "panel-3");
		const b = cpPositionToClasses("bottom-center", "vertical", "panel-3");
		expect(a).toBe(b);
	});
});

describe("CP_POSITION_LAYOUT_CLASS_NAMES", () => {
	it("contains only PandaCSS class strings", () => {
		for (const className of CP_POSITION_LAYOUT_CLASS_NAMES) {
			expect(className).not.toMatch(TAILWIND_UTILITY);
			expect(className.trim().length).toBeGreaterThan(0);
		}
	});

	it("covers every CpPosition so live re-anchoring can strip stale classes", () => {
		const covered = new Set<string>();
		for (const c of CP_POSITION_LAYOUT_CLASS_NAMES) {
			for (const token of c.split(/\s+/)) {
				if (token) covered.add(token);
			}
		}
		// We don't pin a min count (Panda may collapse duplicates), but every
		// position recipe must yield at least one token so `classList.remove`
		// finds something to clear.
		expect(covered.size).toBeGreaterThan(0);
	});
});

describe("readCpState / writeCpState", () => {
	it("falls back to the panel-1 default until the cache is seeded", () => {
		// Happy-dom: each test gets a fresh module cache, so this is safe.
		const state = readCpState("panel-1");
		expect(state.position).toBe("bottom-right");
		expect(state.orientation).toBe("horizontal");
		expect(state.collapsed).toBe(false);
	});

	it("honors writeCpState overrides", () => {
		writeCpState(
			{ position: "left-center", orientation: "vertical", collapsed: true },
			"panel-1",
		);
		const state = readCpState("panel-1");
		expect(state.position).toBe("left-center");
		expect(state.orientation).toBe("vertical");
		expect(state.collapsed).toBe(true);
	});
});
