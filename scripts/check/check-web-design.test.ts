import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { collectViolations, partitionViolations } from "./check-web-design";

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

describe("check-web-design", () => {
	it("passes a compliant implementation", () => {
		const dir = fixture({
			"page.tsx": `
import { Button, Surface } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
const row = css({ display: "flex", gap: "4", color: "text.muted" });
export const Page = () => (
	<Surface className={row}>
		<Button as="a" href="/download" variant="primary">Download</Button>
	</Surface>
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

	it("partitions fresh vs stale allowlist entries", () => {
		const dir = fixture({ "a.css": ".btn { color: red; }" });
		const violations = collectViolations(dir, dir);
		const staleEntry = {
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
