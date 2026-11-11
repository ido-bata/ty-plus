/**
 * Unit tests for SoT sensor.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "./sot.js";

const FIXTURE_ROOT = join(import.meta.dirname, "__sot-fixture__");

function setup() {
	mkdirSync(FIXTURE_ROOT, { recursive: true });
	// Clean workspace state file — no violations
	mkdirSync(join(FIXTURE_ROOT, "management", "workspace"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "workspace", "state.ts"),
		`export type SurfaceState = {
  grid: GridSettings;
  surfaceTiles: readonly Tile[];
  panelId: string;
};\n`,
	);
	// Violation: easingMode in workspace state
	mkdirSync(join(FIXTURE_ROOT, "management", "workspace", "violation"), {
		recursive: true,
	});
	writeFileSync(
		join(FIXTURE_ROOT, "management", "workspace", "violation", "state.ts"),
		`export type SurfaceState = {
  easingMode: string;
  grid: GridSettings;
};\n`,
	);
	// Violation: directoryBrowserPath in workspace context
	mkdirSync(join(FIXTURE_ROOT, "management", "storage"), { recursive: true });
	writeFileSync(
		join(FIXTURE_ROOT, "management", "storage", "workspace-store.ts"),
		`export const readWorkspace = () => {
  return { directoryBrowserPath: "/tmp" };
};\n`,
	);
}

function teardown() {
	try {
		rmSync(FIXTURE_ROOT, { recursive: true });
	} catch {
		// ignore
	}
}

describe("sot sensor", () => {
	beforeAll(() => setup());
	afterAll(() => teardown());

	it("detects INV-4 violation: widget body field in workspace state", () => {
		const findings = run(FIXTURE_ROOT);
		const inv4 = findings.filter((f) => f.ruleRef === "INV-4");
		expect(inv4.length).toBeGreaterThan(0);
	});

	it("detects easingMode field violation", () => {
		const findings = run(FIXTURE_ROOT);
		const easingFindings = findings.filter((f) =>
			f.message.includes("easingMode"),
		);
		expect(easingFindings.length).toBeGreaterThan(0);
	});

	it("detects directoryBrowserPath field violation", () => {
		const findings = run(FIXTURE_ROOT);
		const dirFindings = findings.filter((f) =>
			f.message.includes("directoryBrowserPath"),
		);
		expect(dirFindings.length).toBeGreaterThan(0);
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

	it("emits findings with sensor name 'sot'", () => {
		const findings = run(FIXTURE_ROOT);
		expect(findings.every((f) => f.sensor === "sot")).toBe(true);
	});
});
