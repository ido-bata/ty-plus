import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	collectViolations,
	partitionViolations,
	type Violation,
} from "./web-design";

const fixture = (files: Record<string, string>) => {
	const dir = mkdtempSync(join(tmpdir(), "web-design-"));
	for (const [name, content] of Object.entries(files)) {
		const p = join(dir, name);
		mkdirSync(join(p, ".."), { recursive: true });
		writeFileSync(p, content);
	}
	return dir;
};

const rules = (dir: string) => collectViolations(dir, dir).map((v) => v.rule);
const rulesOf = (dir: string, mode: "web" | "shared") =>
	collectViolations(dir, dir, { mode }).map((v) => v.rule);

describe("web-design", () => {
	it("passes a compliant implementation", () => {
		const dir = fixture({
			"page.tsx": `
import { Button } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
const row = css({ display: "flex", gap: "4", color: "text.muted" });
export const Page = () => (
	<div className={row}>
		<Button as="a" href="/download" variant="primary">Download</Button>
	</div>
);`,
			"app.css": `
:root { --ty-base-font-family: system-ui, sans-serif; }
body { color: var(--ty-text-primary); background: var(--ty-surface-panel); }
.wrap { max-width: 76rem; margin-inline: auto; }`,
		});
		expect(collectViolations(dir, dir)).toEqual([]);
	});

	it("fails on each prohibited pattern", () => {
		const dir = fixture({
			"bad.tsx": `
export const Bad = () => (
	<div>
		<button className="btn" onClick={() => {}}>Go</button>
		<input type="text" />
		<div style={{ color: "red" }} />
	</div>
);`,
			"bad.css": `
:root { --site-accent: #7a6cff; }
.btn { background: #fff; border-radius: 6px; }
.card { color: rgb(1, 2, 3); }
.foo { font-family: "IBM Plex Sans", sans-serif; }
.bar { color: var(--site-text); }
`,
		});
		const found = rules(dir);
		for (const rule of [
			"raw-control",
			"inline-style",
			"web-token",
			"control-selector",
			"literal-color",
			"literal-font",
		]) {
			expect(found).toContain(rule);
		}
	});

	it("fails on token-managed literal values inside css()", () => {
		const dir = fixture({
			"styled.tsx": `
import { css } from "@/styled-system/css";
export const s = css({
	backgroundColor: "#123456",
	borderRadius: "8px",
	color: "surface.widget",
});`,
		});
		const found = rules(dir);
		expect(found).toContain("token-color");
		expect(found).toContain("token-radius");
		expect(found).not.toContain("token-color-extra");
	});

	it("recurses into nested responsive/condition objects", () => {
		const dir = fixture({
			"styled.tsx": `
import { css } from "@/styled-system/css";
export const s = css({
	color: { base: "#ffffff", md: "red" },
	_hover: { backgroundColor: "rgb(1,2,3)" },
});`,
		});
		const found = rules(dir);
		expect(
			found.filter((r) => r === "token-color").length,
		).toBeGreaterThanOrEqual(3);
	});

	it("passes valid responsive token values in web mode", () => {
		const dir = fixture({
			"styled.tsx": `
import { css } from "@/styled-system/css";
export const s = css({
	display: { base: "block", md: "flex" },
	color: { base: "text.primary", md: "text.muted" },
});`,
		});
		expect(collectViolations(dir, dir)).toEqual([]);
	});

	it("rejects arbitrary --ty-* token definitions and undefined var() refs", () => {
		const dir = fixture({
			"tokens.css": `
:root { --ty-made-up-token: #fff; }
.a { color: var(--ty-does-not-exist); }
.b { color: var(--ty-text-primary); }
.c { color: var(--color-text-primary); }
`,
		});
		const vs = collectViolations(dir, dir);
		const webToken = vs.filter((v) => v.rule === "web-token");
		expect(webToken).toHaveLength(2);
	});

	it("rejects undefined Panda token paths but accepts defined ones", () => {
		const dir = fixture({
			"styled.tsx": `
import { css } from "@/styled-system/css";
export const s = css({
	color: "text.bogus",
	backgroundColor: "surface.panel",
	fontSize: "text-display-lg",
});`,
		});
		const vs = collectViolations(dir, dir);
		const undef = vs.filter((v) => v.rule === "token-undefined");
		expect(undef).toHaveLength(1);
		expect(undef[0].message).toContain("text.bogus");
	});

	it("rejects appearance overrides on shared @ty-plus/ui components", () => {
		const dir = fixture({
			"page.tsx": `
import { Button } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
const override = css({ backgroundColor: "#123456" });
export const Page = () => <Button className={override}>Go</Button>;`,
		});
		const found = rules(dir);
		expect(found).toContain("ui-override");
	});

	it("bans responsive breakpoint conditions in shared components only", () => {
		const dir = fixture({
			"shared.tsx": `
import { css } from "@/styled-system/css";
export const s = css({ padding: { base: "1", md: "2" } });
export const T = () => <button>raw is fine here</button>;`,
		});
		// web mode: responsive values are legal, raw <button> is banned
		const web = rulesOf(dir, "web");
		expect(web).toContain("raw-control");
		expect(web).not.toContain("responsive-condition");
		// shared mode: raw controls allowed, responsive banned
		const shared = rulesOf(dir, "shared");
		expect(shared).toContain("responsive-condition");
		expect(shared).not.toContain("raw-control");
	});

	it("partitions fresh vs stale allowlist entries", () => {
		const dir = fixture({ "a.css": ".btn { color: red; }" });
		const violations: Violation[] = collectViolations(dir, dir);
		const staleEntry: Violation = {
			file: "gone.css",
			line: 1,
			rule: "web-token",
			message: "old",
		};
		const { fresh, stale } = partitionViolations(violations, [
			...violations,
			staleEntry,
		]);
		expect(fresh).toEqual([]);
		expect(stale).toEqual([staleEntry]);

		// With no allowlist, every violation is fresh and fails the check.
		expect(partitionViolations(violations, []).fresh).toEqual(violations);
	});
});
