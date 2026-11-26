import { describe, expect, it } from "vitest";
import { findCssViolations } from "./check-css-validity";

const props = (css: string) =>
	findCssViolations(css).map((v) => `${v.prop}: ${v.value}`);

describe("findCssViolations", () => {
	it("flags bare numeric grid tracks", () => {
		const css = ".a {\n  grid-template-columns: 8 minmax(0, 1fr);\n}";
		expect(props(css)).toEqual(["grid-template-columns: 8 minmax(0, 1fr)"]);
	});

	it("accepts valid grid templates", () => {
		const css = [
			".a { grid-template-columns: repeat(6, minmax(0, 1fr)); }",
			".b { grid-template-columns: var(--ty-space-8) minmax(0, 1fr); }",
			".c { grid-template-columns: [full-start] minmax(1em, 1fr) [main-end]; }",
			".d { grid-template-rows: auto 1fr; }",
		].join("\n");
		expect(findCssViolations(css)).toEqual([]);
	});

	it("flags unitless calc on dimensional properties", () => {
		const css = ".a {\n  margin-top: calc((1 - 4) / 2);\n}";
		expect(props(css)).toEqual(["margin-top: calc((1 - 4) / 2)"]);
	});

	it("accepts var-based calc on dimensional properties", () => {
		const css =
			".a {\n  margin-top: calc((var(--ty-space-1) - var(--ty-space-4)) / 2);\n}";
		expect(findCssViolations(css)).toEqual([]);
	});

	it("flags bare non-zero numbers on dimensional properties", () => {
		const css = ".a {\n  width: 8;\n  padding-left: 2.5;\n}";
		expect(props(css)).toEqual(["width: 8", "padding-left: 2.5"]);
	});

	it("allows unitless zero on dimensional properties", () => {
		const css = ".a {\n  margin: 0;\n  width: 0;\n  top: -0;\n}";
		expect(findCssViolations(css)).toEqual([]);
	});

	it("flags unitless numbers on time properties", () => {
		const css = ".a {\n  transition-duration: 0.2;\n}";
		expect(props(css)).toEqual(["transition-duration: 0.2"]);
	});

	it("accepts valid time values", () => {
		const css =
			".a { transition-duration: 200ms; }\n.b { animation-delay: 0; }";
		expect(findCssViolations(css)).toEqual([]);
	});

	it("ignores properties that legitimately accept unitless numbers", () => {
		const css = [
			".a { opacity: 0.5; }",
			".b { z-index: 2; }",
			".c { flex: 1; }",
			".d { line-height: 1.5; }",
			".e { scale: 2; }",
			".f { grid-column: span 2; }",
		].join("\n");
		expect(findCssViolations(css)).toEqual([]);
	});

	it("flags unresolved token paths emitted as bare dotted identifiers", () => {
		const css = [
			".a {",
			"  color: text.secondary;",
			"}",
			".b {",
			"  border-color: colorMix(in srgb, status.error 30%, transparent);",
			"}",
			".c {",
			"  color: text.link;",
			"}",
		].join("\n");
		expect(props(css)).toEqual([
			"color: text.secondary",
			"border-color: colorMix(in srgb, status.error 30%, transparent)",
			"color: text.link",
		]);
	});

	it("accepts dotted names inside var(), url(), and strings", () => {
		const css = [
			".a {",
			"  color: var(--colors-text-primary, text.primary);",
			'  background-image: url("foo.bar/baz.png");',
			'  font-family: "Foo.Bar", sans-serif;',
			"  color: red;",
			"}",
		].join("\n");
		expect(findCssViolations(css)).toEqual([]);
	});

	it("flags underscores used as color-mix interpolation spaces", () => {
		const css = [
			".a {",
			"  background-color: color-mix(in_oklab,var(--x)_50%,transparent);",
			"}",
		].join("\n");
		expect(props(css)).toEqual([
			"background-color: color-mix(in_oklab,var(--x)_50%,transparent)",
		]);
	});

	it("flags non-keyword bare identifiers on font-size", () => {
		const css = [
			".a {",
			"  font-size: text-sm;",
			"}",
			".b {",
			"  font-size: shell-text-xs;",
			"}",
			".c {",
			"  font-size: --ty-shell-text-size-sm;",
			"}",
		].join("\n");
		expect(props(css)).toEqual([
			"font-size: text-sm",
			"font-size: shell-text-xs",
			"font-size: --ty-shell-text-size-sm",
		]);
	});

	it("accepts valid font-size keywords, units, and var()", () => {
		const css = [
			".a {",
			"  font-size: medium;",
			"}",
			".b {",
			"  font-size: smaller;",
			"}",
			".c {",
			"  font-size: 0.875rem;",
			"}",
			".d {",
			"  font-size: var(--font-sizes-sm);",
			"}",
			".e {",
			"  font-size: calc(1rem + 2px);",
			"}",
		].join("\n");
		expect(findCssViolations(css)).toEqual([]);
	});

	it("flags bare identifiers on dimensional properties", () => {
		const css = [
			".a {",
			"  width: px;",
			"  border-radius: shell-md;",
			"  gap: px;",
			"}",
		].join("\n");
		expect(props(css)).toEqual([
			"width: px",
			"border-radius: shell-md",
			"gap: px",
		]);
	});

	it("accepts keywords and functions on dimensional properties", () => {
		const css = [
			".a {",
			"  width: auto;",
			"  min-height: min-content;",
			"  border-radius: var(--radii-md);",
			"  inset: anchor(center);",
			"  margin: inherit;",
			"}",
		].join("\n");
		expect(findCssViolations(css)).toEqual([]);
	});

	it("ignores custom properties and non-declaration lines", () => {
		const css = [
			":root {",
			"  --spacing-8: 2rem;",
			"}",
			"@media (min-width: 100px) {",
			"  .a { color: red; }",
			"}",
		].join("\n");
		expect(findCssViolations(css)).toEqual([]);
	});
});
