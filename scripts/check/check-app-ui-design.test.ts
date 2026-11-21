import { describe, expect, it } from "vitest";
import { checkAppSource } from "./check-app-ui-design";

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
