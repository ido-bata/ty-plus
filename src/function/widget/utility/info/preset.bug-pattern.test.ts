/**
 * Issue #87 — static reproducer (source-level).
 *
 * Per `docs/analysis/issue-87.md`, `PresetInfoWidget` runs
 * `resolvePresetsForInfoByCatalogIds(state, ids)` inline on every render.
 * That selector allocates a fresh `Preset[]` per call, so the
 * `useEffect(..., [items])` dep fails `Object.is` on every render. When
 * `items.length > 0` the effect calls `setPresetInfoLast(items)`, which
 * forces another render — and another fresh `items` — until React aborts
 * with #185.
 *
 * This test pins the known bug pattern statically so that any regression
 * fails in CI without needing to mount the component (which would hang the
 * test runner in jsdom + React 19 because the render loop is fully
 * synchronous).
 *
 * If `preset.tsx` is ever refactored such that this test no longer matches
 * the file (because the pattern was correctly eliminated), this file should
 * be deleted in favor of behavioral coverage in `preset.test.tsx`.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("PresetInfoWidget — Issue #87 static reproducer", () => {
	const sourcePath = path.join(__dirname, "preset.tsx");
	const source = fs.readFileSync(sourcePath, "utf8");

	it("does not pair a non-memoized items dep with useEffect", () => {
		// Bug pattern A: `items` is computed inline via
		// `resolvePresetsForInfoByCatalogIds(...)` (no useMemo wrapper).
		const inlineResolve =
			/const\s+items\s*=\s*resolvePresetsForInfoByCatalogIds\s*\(/;
		// Bug pattern B: a `useEffect` whose deps include the `items` array.
		// When both patterns are present, the dep fails `Object.is` on every
		// render and the effect's setState fires indefinitely.
		const effectOnItems =
			/useEffect\s*\(\s*(?:\(\s*\)\s*=>|\(\s*\w+\s*\)\s*=>|\w+)\s*[\s\S]{0,400}?\},\s*\[\s*items\s*[^\]]*\]\s*\)/;

		const hasInlineResolve = inlineResolve.test(source);
		const hasEffectOnItems = effectOnItems.test(source);

		expect(
			hasInlineResolve && hasEffectOnItems,
			`Issue #87 bug pattern detected in ${sourcePath}: ` +
				"items is computed inline (no useMemo) AND useEffect depends on it. " +
				"resolvePresetsForInfoByCatalogIds allocates a fresh Preset[] per call, so the dep fails Object.is on every render and the effect loops indefinitely when items.length > 0. Memoize items via useMemo (keyed on state.presets and ids) or restructure the effect.",
		).toBe(false);
	});
});
