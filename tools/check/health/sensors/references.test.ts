/**
 * Unit tests for references sensor.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "./references.js";

const FIXTURE_ROOT = join(import.meta.dirname, "__ref-fixture__");

function setup() {
	mkdirSync(FIXTURE_ROOT, { recursive: true });
	// Two files: one orphan (no references), one clean
	writeFileSync(join(FIXTURE_ROOT, "orphan.ts"), `export const x = 1;\n`);
	writeFileSync(
		join(FIXTURE_ROOT, "index.ts"),
		`export { x } from "./orphan";\nimport { x } from "./orphan";\n`,
	);
	// management file that deep-imports function internals (violation)
	mkdirSync(join(FIXTURE_ROOT, "management"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "deep-import.ts"),
		`import { Component } from "@/function/widget/core/easing/Component";\n`,
	);
	// function barrel that has a bypass
	mkdirSync(join(FIXTURE_ROOT, "function"), { recursive: true });
	mkdirSync(join(FIXTURE_ROOT, "function", "widget"), { recursive: true });
	mkdirSync(join(FIXTURE_ROOT, "function", "widget", "core"), {
		recursive: true,
	});
	mkdirSync(join(FIXTURE_ROOT, "function", "widget", "core", "align"), {
		recursive: true,
	});
	writeFileSync(
		join(FIXTURE_ROOT, "function", "widget", "core", "align", "index.ts"),
		`export const align = 1;\n`,
	);
	writeFileSync(
		join(FIXTURE_ROOT, "function", "widget", "core", "align", "Component.tsx"),
		`export const Component = () => null;\n`,
	);
	mkdirSync(join(FIXTURE_ROOT, "shared"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "shared", "utils.ts"),
		`export const utils = 1;\n`,
	);
	// management using shared is fine
	mkdirSync(join(FIXTURE_ROOT, "management", "storage"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "storage", "manager.ts"),
		`import { utils } from "@/shared/utils";\n`,
	);
	// management deep into function — violation
	mkdirSync(join(FIXTURE_ROOT, "management", "preset"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "preset", "catalog.ts"),
		`import { Component } from "@/function/widget/core/easing/Component";\n`,
	);
}

function teardown() {
	try {
		rmSync(FIXTURE_ROOT, { recursive: true });
	} catch {
		// ignore
	}
}

describe("references sensor", () => {
	beforeAll(() => setup());
	afterAll(() => teardown());

	it("detects orphan files", () => {
		const findings = run(FIXTURE_ROOT);
		const orphanFindings = findings.filter(
			(f) => f.message.includes("orphan") || f.file.includes("orphan"),
		);
		expect(orphanFindings.length).toBeGreaterThan(0);
	});

	it("detects INV-2 violation: management → function internals", () => {
		const findings = run(FIXTURE_ROOT);
		const inv2 = findings.filter((f) => f.ruleRef === "INV-2 / INV-1");
		expect(inv2.length).toBeGreaterThan(0);
	});

	it("returns severity-ranked findings", () => {
		const findings = run(FIXTURE_ROOT);
		const severities = findings.map((f) => f.severity);
		expect(
			severities.every((s) =>
				["critical", "high", "medium", "low"].includes(s),
			),
		).toBe(true);
	});

	it("includes weight on each finding", () => {
		const findings = run(FIXTURE_ROOT);
		for (const f of findings) {
			expect(typeof f.weight).toBe("number");
			expect(f.weight).toBeGreaterThan(0);
		}
	});
});
