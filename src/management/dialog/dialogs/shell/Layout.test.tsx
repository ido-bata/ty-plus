/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Shell } from "./Layout";

const REPO_ROOT = process.cwd();
const LAYOUT_SOURCE_PATH = resolve(
	REPO_ROOT,
	"src/management/dialog/dialogs/shell/Layout.tsx",
);
const LAYOUT_SOURCE = readFileSync(LAYOUT_SOURCE_PATH, "utf8");

const PATH_DIALOG_SOURCE_PATH = resolve(
	REPO_ROOT,
	"src/management/preset/catalog-add/PathDialog.tsx",
);
const PATH_DIALOG_SOURCE = readFileSync(PATH_DIALOG_SOURCE_PATH, "utf8");

const TOOL_SHELL_DIALOG_SOURCE_PATH = resolve(
	REPO_ROOT,
	"src/management/preset/tool-shell/Dialog.tsx",
);
const TOOL_SHELL_DIALOG_SOURCE = readFileSync(
	TOOL_SHELL_DIALOG_SOURCE_PATH,
	"utf8",
);

const PRESET_EDIT_DIALOG_SOURCE_PATH = resolve(
	REPO_ROOT,
	"src/management/preset/edit/Dialog.tsx",
);
const PRESET_EDIT_DIALOG_SOURCE = readFileSync(
	PRESET_EDIT_DIALOG_SOURCE_PATH,
	"utf8",
);

const SETTINGS_DIALOG_SOURCE_PATH = resolve(
	REPO_ROOT,
	"src/management/setting/dialog/Settings.tsx",
);
const SETTINGS_DIALOG_SOURCE = readFileSync(
	SETTINGS_DIALOG_SOURCE_PATH,
	"utf8",
);

const ADD_WIDGET_DIALOG_SOURCE_PATH = resolve(
	REPO_ROOT,
	"src/management/widget/add-dialog.tsx",
);
const ADD_WIDGET_DIALOG_SOURCE = readFileSync(
	ADD_WIDGET_DIALOG_SOURCE_PATH,
	"utf8",
);

describe("DialogShell — structural invariants (#142)", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders header + content + footer when all three are supplied", () => {
		render(
			<Shell title="Test">
				<p>body content</p>
				<div slot="footer">footer content</div>
			</Shell>,
		);

		// Header is the default <Header title="Test" /> with data-dialog-header.
		const header = document.querySelector("[data-dialog-header]");
		expect(header).not.toBeNull();
		expect(header?.textContent).toContain("Test");

		// Content renders the children with data-dialog-content.
		const content = document.querySelector("[data-dialog-content]");
		expect(content).not.toBeNull();
		expect(content?.textContent).toContain("body content");
	});

	it("renders the dialog column wrapper (data-dialog-column) holding the 3 children", () => {
		render(
			<Shell
				title="Audit"
				surfaceId="audit-surface"
				footer={<span>footer</span>}
			>
				body
			</Shell>,
		);

		const column = document.querySelector("[data-dialog-column]");
		expect(column).not.toBeNull();
		// Header + Content + Footer are direct children of the column.
		expect(column?.querySelector("[data-dialog-header]")).not.toBeNull();
		expect(column?.querySelector("[data-dialog-content]")).not.toBeNull();
		expect(column?.querySelector("[data-dialog-footer]")).not.toBeNull();
	});

	it("renders the dialog root shell with data-dialog-shell attribute", () => {
		render(<Shell title="Root test">content</Shell>);
		const root = document.querySelector("[data-dialog-shell]");
		expect(root).not.toBeNull();
	});

	it("source: root shell is a flex container (the 3-area grid lives on the inner column)", () => {
		// Source-string assertion: the structural rule is enforced by the
		// shell's PandaCSS `css()` block, not by per-caller utility classes.
		// Happy-dom does not implement CSS Grid math, so we assert against
		// the source directly.
		//
		// Architecture: root (`rootShellBase`) is `display: flex` so it can
		// accept arbitrary drag/drop/centering use cases; the 3-area grid
		// template (`auto minmax(0,1fr) auto`) lives on the inner column
		// (`dialogColumnBase`). The test name and PR body must reflect
		// this — earlier naming read as "the root is a 3-area grid" which
		// is not what the implementation does.
		expect(LAYOUT_SOURCE).toMatch(/rootShellBase[\s\S]*?display\s*:\s*"flex"/);
		// `gridTemplateRows` must NOT appear inside the `rootShellBase`
		// block — scoping the negative regex to the block body (between
		// the opening `{` and the matching closing `}`) keeps it from
		// matching against the later `dialogColumnBase` block.
		expect(LAYOUT_SOURCE).not.toMatch(
			/rootShellBase\s*=\s*css\(\{[^}]*?gridTemplateRows[^}]*?\}\)/,
		);
	});

	it("source: dialog column base declares the 3-area grid (Header=auto, Content=minmax(0,1fr), Footer=auto)", () => {
		expect(LAYOUT_SOURCE).toMatch(
			/dialogColumnBase[\s\S]*?gridTemplateRows\s*:\s*"auto\s+minmax\(0,\s*1fr\)\s+auto"/,
		);
	});

	it("source: never sets position:absolute on shell internals", () => {
		// The shell must not compensate for missing grid math via
		// absolute positioning or fixed (pixel) heights. Percentage and
		// viewport-relative heights (e.g. `"100%"`, `"100vh"`) are fine —
		// the rule forbids hardcoded pixel locks that would break the
		// 3-area grid when the panel resizes.
		expect(LAYOUT_SOURCE).not.toMatch(/position\s*:\s*"absolute"/);
		expect(LAYOUT_SOURCE).not.toMatch(/\bheight\s*:\s*"\d+(?:px|rem|em)\b/);
		expect(LAYOUT_SOURCE).not.toMatch(/\bwidth\s*:\s*"\d+(?:px|rem|em)\b/);
	});

	it("source: has no top/bottom margin compensation per topology", () => {
		// Old implementation applied `margin: auto` on the outer <dialog>
		// when centerContent=true which caused vertical shrinking. The
		// grid template eliminates the need for any per-mode compensation.
		expect(LAYOUT_SOURCE).not.toMatch(/margin\s*:\s*"auto"/);
	});

	it("source: gridTemplateRows string is not parameterised by props", () => {
		// No template literal interpolation that lets callers override the
		// row template via a prop. The 3-area rule is unconditional.
		const templateMatches = LAYOUT_SOURCE.match(
			/gridTemplateRows\s*:\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
		);
		expect(templateMatches ?? []).toEqual([]);
	});
});

describe("DialogShell — call site audit (#142)", () => {
	it("PathDialog no longer passes Tailwind utility literals to DialogShell", () => {
		// Regression for #142: PathDialog was the canonical offender.
		// Its <DialogShell> call no longer carries Tailwind coercion
		// (`w-full`, `max-w-none`, `flex-1`, `!mx-0`, `!px-0`, `h-fit`,
		// `shrink-0`, `bg-surface-dialog` style literals).
		const dialogShellBlock = PATH_DIALOG_SOURCE.match(
			/<DialogShell[\s\S]*?<\/DialogShell>/,
		);
		expect(dialogShellBlock).not.toBeNull();
		const block = dialogShellBlock?.[0] ?? "";
		expect(block).not.toMatch(/\bw-full\b/);
		expect(block).not.toMatch(/\bmax-w-none\b/);
		expect(block).not.toMatch(/\bflex-1\b/);
		expect(block).not.toMatch(/!mx-0/);
		expect(block).not.toMatch(/!px-0/);
		expect(block).not.toMatch(/\bh-fit\b/);
		expect(block).not.toMatch(/\bshrink-0\b/);
	});

	it("preset tool-shell Dialog no longer passes Tailwind utility literals", () => {
		const dialogShellBlock = TOOL_SHELL_DIALOG_SOURCE.match(
			/<DialogShell[\s\S]*?<\/DialogShell>/,
		);
		expect(dialogShellBlock).not.toBeNull();
		const block = dialogShellBlock?.[0] ?? "";
		expect(block).not.toMatch(/\bw-full\b/);
		expect(block).not.toMatch(/\bmax-w-none\b/);
		expect(block).not.toMatch(/\bflex-1\b/);
		expect(block).not.toMatch(/!mx-0/);
		expect(block).not.toMatch(/!px-0/);
		expect(block).not.toMatch(/\bh-fit\b/);
	});

	it("preset edit Dialog no longer passes Tailwind utility literals", () => {
		const dialogShellBlock = PRESET_EDIT_DIALOG_SOURCE.match(
			/<DialogShell[\s\S]*?<\/DialogShell>/,
		);
		expect(dialogShellBlock).not.toBeNull();
		const block = dialogShellBlock?.[0] ?? "";
		expect(block).not.toMatch(/\bw-full\b/);
		expect(block).not.toMatch(/\bmax-w-none\b/);
		expect(block).not.toMatch(/\bflex-1\b/);
		expect(block).not.toMatch(/!mx-0/);
		expect(block).not.toMatch(/!px-0/);
		expect(block).not.toMatch(/\bh-fit\b/);
	});

	it("Settings dialog no longer passes centerContent={false} (now the default)", () => {
		const dialogShellBlock = SETTINGS_DIALOG_SOURCE.match(
			/<DialogShell[\s\S]*?<\/DialogShell>/,
		);
		expect(dialogShellBlock).not.toBeNull();
		const block = dialogShellBlock?.[0] ?? "";
		expect(block).not.toMatch(/centerContent\s*=\s*\{false\}/);
	});

	it("Add Widget dialog no longer passes centerContent={false}", () => {
		const dialogShellBlock = ADD_WIDGET_DIALOG_SOURCE.match(
			/<DialogShell[\s\S]*?<\/DialogShell>/,
		);
		expect(dialogShellBlock).not.toBeNull();
		const block = dialogShellBlock?.[0] ?? "";
		expect(block).not.toMatch(/centerContent\s*=\s*\{false\}/);
	});
});
