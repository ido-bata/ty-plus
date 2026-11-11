/**
 * Contract for `Group`'s hierarchy-driven left indent.
 *
 * The `Group` component represents a collapsible details/summary menu row.
 * Its inner body is rendered either flush-left (when `Group` is a top-level
 * sibling of plain `<Row>` items, e.g. `Layout` / `Create preset`) or with
 * a `paddingLeft: var(--ty-space-2)` indent (when `Group` is truly nested
 * inside another group, e.g. `Move to panel` inside the `Selected presets`
 * group).
 *
 * The `nested` prop is the lever.  The default is `false` (flush-left).  Set
 * `nested={true}` for genuinely nested submenus.  Negative-margin or
 * localized `Layout`-level patches are explicitly rejected; the structural
 * fix lives in `Group`.
 *
 * @vitest-environment happy-dom
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Group } from "./Component";

const TEST_TITLE = "Test group";

function renderGroupBody(
	props: Partial<React.ComponentProps<typeof Group>> = {},
): HTMLElement {
	const { container } = render(
		<Group title={props.title ?? TEST_TITLE} {...props}>
			<button type="button">child row</button>
		</Group>,
	);
	// The inner body div carries the `data-menu-group-nested` attribute set
	// in `Group`.  Query by attribute so we don't depend on a testid.
	const body = container.querySelector<HTMLElement>("[data-menu-group-nested]");
	if (!body) {
		throw new Error(
			`Group body not found for title=${props.title ?? TEST_TITLE}`,
		);
	}
	return body;
}

afterEach(() => {
	cleanup();
});

describe("Group hierarchy indent", () => {
	it("renders flush-left when nested={false}", () => {
		const body = renderGroupBody({ nested: false });
		expect(body.dataset.menuGroupNested).toBe("false");
		// No paddingLeft should be applied via the nested submenu class.
		expect(body.style.paddingLeft).toBe("");
		expect(body.className.trim()).toBe("");
	});

	it("applies the indent when nested={true}", () => {
		const body = renderGroupBody({ nested: true });
		expect(body.dataset.menuGroupNested).toBe("true");
		// The className is the PandaCSS-generated identifier for the
		// `paddingLeft: var(--ty-space-2)` rule.  It must be non-empty when
		// nested.
		expect(body.className.trim().length).toBeGreaterThan(0);
	});

	it("defaults to non-nested when no nested prop is supplied", () => {
		const body = renderGroupBody();
		expect(body.dataset.menuGroupNested).toBe("false");
		expect(body.style.paddingLeft).toBe("");
		expect(body.className.trim()).toBe("");
	});

	it("preserves the non-hierarchy styles regardless of nested", () => {
		const flat = renderGroupBody({ nested: false });
		const nested = renderGroupBody({ nested: true });
		// The body still renders children in both cases.
		expect(flat.querySelector("button")).not.toBeNull();
		expect(nested.querySelector("button")).not.toBeNull();
		// Only the nested variant carries the indent class.
		expect(flat.className.trim()).toBe("");
		expect(nested.className.trim().length).toBeGreaterThan(0);
	});
});

describe("Group call-site regression", () => {
	it("`Layout` group is flush-left with menu items", () => {
		// The `Layout` group is a top-level sibling of plain `<Row>` items in
		// the widget context menu.  It must NOT carry the nested submenu
		// indent.
		const body = renderGroupBody({ title: "Layout", nested: false });
		expect(body.dataset.menuGroupNested).toBe("false");
		expect(body.style.paddingLeft).toBe("");
	});

	it("`Move to panel` group keeps the nested indent", () => {
		// `Move to panel` is rendered inside the `Selected presets` group,
		// so it IS a truly nested submenu and must keep the indent.
		const body = renderGroupBody({ title: "Move to panel", nested: true });
		expect(body.dataset.menuGroupNested).toBe("true");
		expect(body.className.trim().length).toBeGreaterThan(0);
	});
});

describe("Group source-string regression", () => {
	it("does not apply an unconditional paddingLeft inside the Group styles", async () => {
		// Pin the structural fix in source.  The unconditional indent
		// (`<div className={css({ paddingLeft: ... })}>` inside `Group`)
		// would regress the symptom from Issue #149.
		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		const url = await import("node:url");
		const here = url.fileURLToPath(import.meta.url);
		const sourcePath = path.join(path.dirname(here), "Component.tsx");
		const source = await fs.readFile(sourcePath, "utf8");
		// The file must NOT contain a top-level `submenuClass` constant with
		// an unconditional paddingLeft.  The `nestedSubmenuClass` constant
		// is allowed because it is only applied when `isNested === true`.
		expect(source).not.toMatch(/const\s+submenuClass\s*=\s*css\(/);
		// The `nested` prop must be consumed in the Group body.  The default
		// normalization (`isNested = nested === true`) is the canonical form.
		expect(source).toMatch(/isNested\s*=\s*nested\s*===\s*true/);
		// The conditional application is in place.
		expect(source).toMatch(
			/isNested\s*\?\s*nestedSubmenuClass\s*:\s*undefined/,
		);
	});
});
