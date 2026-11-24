import { describe, expect, it } from "vitest";
import {
	checkAppSource,
	checkDuplicateRecipes,
	checkFocusIndicator,
	checkVocabularyCopies,
	collectStyleRecipes,
	parseVarCalls,
} from "./app-ui-design";

const rules = (src: string): string[] =>
	checkAppSource("test.tsx", src).map((v) => v.rule);

describe("checkAppSource", () => {
	it("accepts a shared primitive composition", () => {
		const src = `
import { Button, Icon } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
const row = css({ display: "flex", gap: "1" });
export const C = () => (
	<div className={row}>
		<Button variant="ghost" uiSize="sm" onClick={() => {}}>Run</Button>
		<Icon icon={Play} size={4} />
	</div>
);
`;
		expect(rules(src)).toEqual([]);
	});

	it("rejects a raw <button>", () => {
		const src = `export const C = () => <button type="button">x</button>;`;
		expect(rules(src)).toEqual(["raw-control"]);
	});

	it("rejects raw <select>, <input> and <textarea>", () => {
		const src = `
export const C = () => (
	<form>
		<select value="a" onChange={() => {}}><option value="a">a</option></select>
		<input value="a" onChange={() => {}} />
		<textarea value="a" onChange={() => {}} />
	</form>
);
`;
		expect(rules(src).filter((r) => r === "raw-control")).toHaveLength(3);
	});

	it("rejects a hand-drawn <svg>", () => {
		const src = `export const C = () => <svg viewBox="0 0 24 24"><path d="M0 0" /></svg>;`;
		expect(rules(src)).toEqual(["raw-svg"]);
	});

	it("rejects a deep import of the shared package", () => {
		const src = `import { Input } from "@ty-plus/ui/fields/Input";`;
		expect(rules(src)).toEqual(["deep-import"]);
	});

	it("accepts the barrel import", () => {
		const src = `import { Input } from "@ty-plus/ui";`;
		expect(rules(src)).toEqual([]);
	});

	it("accepts the token registry by path", () => {
		const src = `import { DESIGN_TOKENS_DEFAULTS } from "@ty-plus/ui/tokens/design-tokens-defaults";`;
		expect(rules(src)).toEqual([]);
	});

	it("rejects an appearance override on a shared component", () => {
		const src = `
import { IconButton } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
const skin = css({ backgroundColor: "surface.widget", borderRadius: "shell-sm" });
export const C = () => <IconButton className={skin} aria-label="x" />;
`;
		expect(rules(src)).toEqual(["ui-override"]);
	});

	it("allows a layout-only className on a shared component", () => {
		const src = `
import { IconButton } from "@ty-plus/ui";
import { css } from "@/styled-system/css";
const layout = css({ display: "flex", minWidth: 0, flexShrink: 0 });
export const C = () => <IconButton className={layout} aria-label="x" />;
`;
		expect(rules(src)).toEqual([]);
	});

	it("rejects an inline style that sets appearance", () => {
		const src = `export const C = () => <div style={{ color: "red" }}>x</div>;`;
		expect(rules(src)).toEqual(["inline-style"]);
	});

	it("allows an inline style that only sets custom properties", () => {
		const src = `export const C = () => <div style={{ "--zoom": "1.2" }}>x</div>;`;
		expect(rules(src)).toEqual([]);
	});

	it("allows an inline style that only sets runtime position", () => {
		const src = `export const C = () => <div style={{ top: box.top, left: box.left }}>x</div>;`;
		expect(rules(src)).toEqual([]);
	});
});

describe("focus indicators", () => {
	const rules = (src: string): string[] =>
		checkAppSource("test.tsx", src).map((v) => v.rule);

	it("accepts the canonical focus ring", () => {
		const src = `
import { css } from "@/styled-system/css";
const field = css({
	outline: "none",
	_focus: {
		borderColor: "interactive.focus",
		boxShadow: "var(--color-focus-ring)",
	},
});
`;
		expect(rules(src)).toEqual([]);
	});

	it("reports a focus rule that paints a different indicator", () => {
		const src = `
import { css } from "@/styled-system/css";
const field = css({
	_focusVisible: { boxShadow: "inset 0 0 0 1px var(--color-interactive-focus)" },
});
`;
		expect(rules(src)).toEqual(["focus-ring-divergent"]);
	});
});

describe("css variables", () => {
	const rules = (src: string): string[] =>
		checkAppSource("test.tsx", src).map((v) => v.rule);

	it("accepts a defined theme variable", () => {
		const src = `
import { css } from "@/styled-system/css";
const a = css({ color: "var(--color-text-muted)" });
`;
		expect(rules(src)).toEqual([]);
	});

	it("reports an undefined variable that has no fallback", () => {
		const src = `
import { css } from "@/styled-system/css";
const a = css({ color: "var(--color-nope)" });
`;
		expect(rules(src)).toEqual(["unknown-css-var"]);
	});

	it("accepts an undefined variable that has a fallback", () => {
		const src = `
import { css } from "@/styled-system/css";
const a = css({ color: "var(--color-nope, #fff)" });
`;
		expect(rules(src)).toEqual([]);
	});

	it("accepts a custom property the file sets inline", () => {
		const src = `
import { css } from "@/styled-system/css";
const a = css({ fontSize: "var(--runtime-size)" });
export const C = () => <span style={{ "--runtime-size": "10px" } as React.CSSProperties}>x</span>;
`;
		expect(rules(src)).toEqual([]);
	});
});

describe("parseVarCalls", () => {
	it("reads the name and whether a fallback is present", () => {
		expect(parseVarCalls("var(--a)")).toEqual([
			{ name: "--a", hasFallback: false },
		]);
		expect(parseVarCalls("var(--a, #fff)")).toEqual([
			{ name: "--a", hasFallback: true },
		]);
	});

	it("does not mistake a nested fallback for the outer name", () => {
		expect(parseVarCalls("var(--a, var(--b))")).toEqual([
			{ name: "--a", hasFallback: true },
		]);
	});
});

describe("duplicate style recipes", () => {
	const recipe = (body: string, file = "a.tsx"): string =>
		collectStyleRecipes(file, `const x = css({${body}});`)[0]
			?.properties.map((p) => `${p.name}:${p.value}`)
			.join(",") ?? "";

	it("reads the property/value pairs of a recipe", () => {
		expect(
			recipe('color: "text.muted", fontSize: "text-xs", fontWeight: "medium"'),
		).toBe("color:text.muted,fontSize:text-xs,fontWeight:medium");
	});

	it("reports a treatment written in two files", () => {
		const body =
			'color: "text.muted", fontSize: "text-xs", fontWeight: "medium"';
		const violations = checkDuplicateRecipes([
			...collectStyleRecipes("a.tsx", `const x = css({${body}});`),
			...collectStyleRecipes("b.tsx", `const x = css({${body}});`),
		]);
		expect(violations.map((v) => v.rule)).toEqual([
			"duplicate-style-recipe",
			"duplicate-style-recipe",
		]);
		expect(violations[0]?.file).toBe("a.tsx");
		expect(violations[1]?.file).toBe("b.tsx");
	});

	it("does not report a recipe that only appears once", () => {
		const body =
			'color: "text.muted", fontSize: "text-xs", fontWeight: "medium"';
		expect(
			checkDuplicateRecipes([
				...collectStyleRecipes("a.tsx", `const x = css({${body}});`),
			]),
		).toEqual([]);
	});

	it("ignores a layout-only arrangement", () => {
		const body = 'display: "flex", flexDirection: "column", gap: "1"';
		expect(collectStyleRecipes("a.tsx", `const x = css({${body}});`)).toEqual(
			[],
		);
	});

	it("ignores a recipe that is shorter than three properties", () => {
		const body = 'color: "text.muted", fontSize: "text-xs"';
		expect(collectStyleRecipes("a.tsx", `const x = css({${body}});`)).toEqual(
			[],
		);
	});
});

describe("the vocabulary is the reference", () => {
	const recipe = (body: string, file: string) =>
		collectStyleRecipes(file, `const x = css({${body}});`)[0];

	it("reports a treatment the shared package already has", () => {
		const body =
			'color: "text.muted", fontSize: "text-xs", fontWeight: "medium"';
		const violations = checkVocabularyCopies(
			[recipe(body, "src/app.tsx")],
			[recipe(body, "packages/ui/src/styles/typography.ts")],
		);
		expect(violations.map((v) => v.rule)).toEqual(["vocabulary-copy"]);
		expect(violations[0]?.message).toContain("typography.ts");
	});

	it("does not report a treatment the shared package does not have", () => {
		expect(
			checkVocabularyCopies(
				[
					recipe(
						'color: "text.muted", fontSize: "text-xs", fontWeight: "medium"',
						"src/app.tsx",
					),
				],
				[],
			),
		).toEqual([]);
	});
});

describe("the focus indicator", () => {
	it("reports a file that takes the indicator away and puts none back", () => {
		const violations = checkFocusIndicator(
			"src/app.tsx",
			'const x = css({ outline: "none", color: "text.muted" });',
		);
		expect(violations.map((v) => v.rule)).toEqual(["focus-indicator-missing"]);
	});

	it("accepts a file that paints the canonical ring", () => {
		expect(
			checkFocusIndicator(
				"src/app.tsx",
				'const x = css({ outline: "none" }); const y = css({ boxShadow: "var(--color-focus-ring)" });',
			),
		).toEqual([]);
	});

	it("accepts a file that leaves the native indicator alone", () => {
		expect(
			checkFocusIndicator(
				"src/app.tsx",
				'const x = css({ color: "text.muted" });',
			),
		).toEqual([]);
	});
});

describe("the shared package implements the controls", () => {
	it("does not flag a raw button inside the shared package", () => {
		const src = `export const C = () => <button type="button">x</button>;`;
		expect(
			checkAppSource("packages/ui/src/x.tsx", src, { sharedPackage: true }).map(
				(v) => v.rule,
			),
		).toEqual([]);
		expect(checkAppSource("src/app.tsx", src).map((v) => v.rule)).toEqual([
			"raw-control",
		]);
	});
});
