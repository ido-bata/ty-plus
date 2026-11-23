/**
 * Unit tests for ids sensor.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "./ids.js";

const FIXTURE_ROOT = join(import.meta.dirname, "__ids-fixture__");

function setup() {
	mkdirSync(FIXTURE_ROOT, { recursive: true });
	mkdirSync(join(FIXTURE_ROOT, "management"), { recursive: true });

	writeFileSync(
		join(FIXTURE_ROOT, "management", "prefixed-ids.ts"),
		[
			'const a = "wsi:00000000-0000-4000-8000-000000000001";',
			'const b = "local-widget-id-123";',
			'const c = "pcl:abcdefgh";',
			"const d = `ppi:something`;",
		].join("\n"),
	);

	writeFileSync(
		join(FIXTURE_ROOT, "management", "inference.ts"),
		[
			"const t = resolveWidgetIdForPreset(id);",
			"const u = id.naming.something;",
			"const v = widgetId.history.last;",
		].join("\n"),
	);

	writeFileSync(
		join(FIXTURE_ROOT, "management", "clean.ts"),
		'const id = "9f1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d";\n',
	);
}

function teardown() {
	rmSync(FIXTURE_ROOT, { recursive: true, force: true });
}

describe("ids sensor", () => {
	let findings: ReturnType<typeof run>;

	beforeAll(() => {
		setup();
		findings = run(FIXTURE_ROOT);
	});
	afterAll(() => teardown());

	it("detects all forbidden meaning-bearing ID prefixes", () => {
		const messages = findings.map((f) => f.message).join("\n");
		for (const prefix of ["wsi:", "local-", "pcl:", "ppi:"]) {
			expect(messages).toContain(`'${prefix}'`);
		}
	});

	it("detects type/name inference patterns", () => {
		const inference = findings.filter(
			(f) =>
				f.message.includes("infers") ||
				f.message.includes("sniffs") ||
				f.message.includes("splits") ||
				f.message.includes("extracts"),
		);
		expect(inference.length).toBeGreaterThanOrEqual(3);
	});

	it("produces no findings for opaque UUID literals", () => {
		const cleanFindings = findings.filter((f) => f.file.endsWith("clean.ts"));
		expect(cleanFindings).toHaveLength(0);
	});

	it("returns findings with valid severity and positive weight", () => {
		expect(findings.length).toBeGreaterThan(0);
		for (const f of findings) {
			expect(["critical", "high", "medium", "low"]).toContain(f.severity);
			expect(f.weight).toBeGreaterThan(0);
			expect(f.ruleRef).toBe("INV-3");
			expect(f.sensor).toBe("ids");
		}
	});

	it("ranks local- prefix lower than registry-style prefixes", () => {
		const local = findings.find((f) => f.message.includes("'local-'"));
		const wsi = findings.find((f) => f.message.includes("'wsi:'"));
		expect(local?.severity).toBe("medium");
		expect(wsi?.severity).toBe("high");
	});
});
