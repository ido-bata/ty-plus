/**
 * Unit tests for naming sensor.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "./naming.js";

const FIXTURE_ROOT = join(import.meta.dirname, "__naming-fixture__");

function setup() {
	mkdirSync(FIXTURE_ROOT, { recursive: true });

	// Path-level: horizontal redundancy (same token repeated within segment)
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
			"align-component.tsx",
		),
		`export const alignComponent = () => null;\n`,
	);

	// Path-level: vertical redundancy (same token across path levels)
	mkdirSync(join(FIXTURE_ROOT, "function", "widget", "core", "align"), {
		recursive: true,
	});
	writeFileSync(
		join(FIXTURE_ROOT, "function", "widget", "core", "align", "index.ts"),
		`export const align = 1;\n`,
	);

	// Symbol-level: symbol-self (token repeated in symbol name)
	mkdirSync(join(FIXTURE_ROOT, "management", "storage"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "storage", "manager.ts"),
		`export const managerManager = 1;\n`,
	);

	// Symbol-level: symbol-path (symbol name mirrors path token)
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
		`export const alignWidget = () => null;\n`,
	);

	// Clean file (no issues)
	mkdirSync(join(FIXTURE_ROOT, "shared"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "shared", "utils.ts"),
		`export const utils = 1;\n`,
	);
}

function teardown() {
	try {
		rmSync(FIXTURE_ROOT, { recursive: true });
	} catch {
		// ignore
	}
}

describe("naming sensor", () => {
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

	it("includes sensor name on each finding", () => {
		const findings = run(FIXTURE_ROOT);
		for (const f of findings) {
			expect(f.sensor).toBe("naming");
			expect(f.ruleRef).toBe("INV-7");
		}
	});

	it("detects at least one naming redundancy in fixture", () => {
		const findings = run(FIXTURE_ROOT);
		expect(findings.length).toBeGreaterThan(0);
	});

	it("path-wide findings include path context", () => {
		const findings = run(FIXTURE_ROOT);
		const pathFindings = findings.filter((f) => f.message.includes("path"));
		// should have path-wide or vertical findings
		expect(pathFindings.length).toBeGreaterThan(0);
	});
});
