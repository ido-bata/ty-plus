import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { DialogFooterActionsProps, FooterProps } from "./Footer";

const FOOTER_SOURCE = readFileSync(
	resolve(process.cwd(), "src/management/dialog/shell/Footer.tsx"),
	"utf8",
);

describe("Footer", () => {
	it("has correct prop shape", () => {
		const props: FooterProps = {
			children: null,
			className: "",
		};
		expect(props.className).toBe("");
	});

	// Issue #674: the footer band must own the canonical horizontal inset
	// (`--ty-shell-pad-inline`), matching `Header`/`Content`, so footer
	// actions are never flush against the dialog edge.
	it("source: footer shell declares the canonical inline padding", () => {
		const footerShellBlock = FOOTER_SOURCE.match(
			/footerShell\s*=\s*css\(\{[\s\S]*?\}\)/,
		);
		expect(footerShellBlock).not.toBeNull();
		expect(footerShellBlock?.[0]).toContain(
			'paddingInline: "var(--ty-shell-pad-inline)"',
		);
	});
});

describe("DialogFooterActions", () => {
	it("has correct prop shape", () => {
		const props: DialogFooterActionsProps = {
			children: null,
			className: "",
		};
		expect(props.className).toBe("");
	});
});
