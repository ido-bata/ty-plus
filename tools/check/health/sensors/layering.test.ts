/**
 * Unit tests for layering sensor.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "./layering.js";

const FIXTURE_ROOT = join(import.meta.dirname, "__layering-fixture__");

function setup() {
	mkdirSync(FIXTURE_ROOT, { recursive: true });

	// management file with a deep impl import — violation
	mkdirSync(join(FIXTURE_ROOT, "management", "storage"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "storage", "manager.ts"),
		`import { WidgetCore } from "@/function/widget/core/easing/Component";\n`,
	);

	// management file with function index import — ok
	mkdirSync(join(FIXTURE_ROOT, "management", "workspace"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "workspace", "hook.ts"),
		`import { widgetIndex } from "@/function/widget/index";\n`,
	);

	// management file with bare function import (no subpath) — ok
	mkdirSync(join(FIXTURE_ROOT, "management", "dialog"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "dialog", "index.ts"),
		`import { presetApi } from "@/function/preset";\n`,
	);

	// function file importing management — ok (function->management is allowed)
	mkdirSync(join(FIXTURE_ROOT, "function", "widget", "core", "align"), {
		recursive: true,
	});
	writeFileSync(
		join(
			FIXTURE_ROOT,
			"function",
			"widget",
			"core",
			"align",
			"align-widget.tsx",
		),
		`import { storageManager } from "@/management/storage";\n`,
	);

	// management file with a very deep impl import — critical violation
	mkdirSync(join(FIXTURE_ROOT, "management", "ae"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "ae", "bridge.ts"),
		`import { SpecificWidget } from "@/function/widget/core/easing/presets/animation/curves/bezier/Segment";\n`,
	);

	// management file importing function/widget/registry directly — CRITICAL override
	// (mirrors the 2026-05 glob-path bug: the import was silent but rendered no widgets)
	mkdirSync(join(FIXTURE_ROOT, "management", "widget", "workspace"), {
		recursive: true,
	});
	writeFileSync(
		join(
			FIXTURE_ROOT,
			"management",
			"widget",
			"workspace",
			"TileContent-bad.tsx",
		),
		`import { getWidgetDescriptor } from "@/function/widget/registry";\n`,
	);

	// management file importing via the approved shim — ok
	writeFileSync(
		join(
			FIXTURE_ROOT,
			"management",
			"widget",
			"workspace",
			"TileContent-ok.tsx",
		),
		`import { getWidgetDescriptor } from "@/management/widget/registry";\n`,
	);
}

function teardown() {
	try {
		rmSync(FIXTURE_ROOT, { recursive: true });
	} catch {
		// ignore
	}
}

describe("layering sensor", () => {
	beforeAll(() => setup());
	afterAll(() => teardown());

	it("returns findings with valid severity values", () => {
		const findings = run(FIXTURE_ROOT);
		const severities = findings.map((f) => f.severity);
		expect(
			severities.every((s) =>
				["critical", "high", "medium", "low"].includes(s),
			),
		).toBe(true);
	});

	it("returns findings with weight > 0", () => {
		const findings = run(FIXTURE_ROOT);
		for (const f of findings) {
			expect(typeof f.weight).toBe("number");
			expect(f.weight).toBeGreaterThan(0);
		}
	});

	it("includes sensor name and INV-2 ruleRef on each finding", () => {
		const findings = run(FIXTURE_ROOT);
		for (const f of findings) {
			expect(f.sensor).toBe("layering");
			expect(f.ruleRef).toBe("INV-2");
		}
	});

	it("detects deep impl imports from management", () => {
		const findings = run(FIXTURE_ROOT);
		const messages = findings.map((f) => f.message);
		expect(
			messages.some((m) =>
				m.includes("/function/widget/core/easing/Component"),
			),
		).toBe(true);
	});

	it("does not flag function index imports from management", () => {
		const findings = run(FIXTURE_ROOT);
		const messages = findings.map((f) => f.message);
		expect(messages.some((m) => m.includes("/function/widget/index"))).toBe(
			false,
		);
	});

	it("does not flag function->management imports", () => {
		const findings = run(FIXTURE_ROOT);
		const messages = findings.map((f) => f.message);
		expect(messages.some((m) => m.includes("/management/storage"))).toBe(false);
	});

	it("classifies deeper violations as more severe", () => {
		const findings = run(FIXTURE_ROOT);
		const deepFinding = findings.find((f) =>
			f.message.includes(
				"/function/widget/core/easing/presets/animation/curves/bezier/Segment",
			),
		);
		expect(deepFinding?.severity).toBe("critical");
	});

	it("finds at least one layering violation in fixture", () => {
		const findings = run(FIXTURE_ROOT);
		expect(findings.length).toBeGreaterThan(0);
	});

	// ── CRITICAL_INTERNAL_MODULES rule ─────────────────────────────────────────

	it("classifies @/function/widget/registry import from management as CRITICAL", () => {
		const findings = run(FIXTURE_ROOT);
		// Find the finding that points to the "bad" fixture file (direct import)
		const registryFinding = findings.find(
			(f) =>
				f.file.includes("TileContent-bad") &&
				f.message.includes("function/widget/registry"),
		);
		expect(
			registryFinding,
			"Expected a critical finding for direct @/function/widget/registry import, but none was found. " +
				"This rule exists to catch the class of bug where wrong glob paths silently produce no widget renders.",
		).toBeDefined();
		expect(registryFinding?.severity).toBe("critical");
	});

	it("does NOT flag @/management/widget/registry (the approved shim)", () => {
		const findings = run(FIXTURE_ROOT);
		// The "ok" fixture uses @/management/widget/registry, which is the approved shim
		// and must not generate any findings
		const shimFinding = findings.find((f) => f.file.includes("TileContent-ok"));
		expect(
			shimFinding,
			"@/management/widget/registry is the approved shim and must never be flagged",
		).toBeUndefined();
	});
});
