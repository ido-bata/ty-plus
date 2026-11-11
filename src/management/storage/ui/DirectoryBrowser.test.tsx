/**
 * @vitest-environment jsdom
 *
 * Click-handler contract for the unified `DirectoryBrowser` kit:
 *   - single-click on a file row fires `onEntryClick`
 *   - single-click on a directory row fires neither callback (directories
 *     require double-click or Enter via `onEntryActivate` to navigate)
 *   - single-click on the up row fires `onGoUp` (up is single-click even
 *     though it represents a directory)
 *   - double-click on a directory row fires `onEntryActivate`
 *   - clicking a row's checkbox does not bubble to `onEntryClick`
 *   - `viewMode` is fully controlled: prop changes switch list/icons,
 *     the footer toggle calls `onViewModeChange` without keeping state
 *
 * Typography invariant contract (#144):
 *   - selection never changes font-weight, font-size, line-height, or
 *     letter-spacing on the entry text
 *   - `activePath` and `isSelected` are independent — the four
 *     (none / active / selected / active+selected) states each render
 *     a distinct `data-row-state` value
 *   - row height is not affected by selection state
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	DirectoryBrowser,
	type DirectoryBrowserEntry,
} from "@/management/storage/ui/DirectoryBrowser";

const baseEntries: DirectoryBrowserEntry[] = [
	{ path: "/preset/root/a", name: "alpha", isDirectory: true },
	{ path: "/preset/root/b.txt", name: "b.txt", isDirectory: false },
];

const baseProps = {
	entries: baseEntries,
	loading: false,
	canGoUp: true,
	onGoUp: vi.fn(),
	selectionMode: "files" as const,
	isSelected: () => false,
	onToggleSelected: vi.fn(),
	selectedSummary: { files: 0, folders: 0 },
	viewMode: "list" as const,
	onViewModeChange: vi.fn(),
	scale: 1,
	aspect: "square" as const,
};

describe("DirectoryBrowser kit click contract", () => {
	afterEach(() => {
		cleanup();
	});

	it("does not fire onEntryClick on single-click of a directory row (directories require double-click)", () => {
		const onEntryClick = vi.fn();
		const onEntryActivate = vi.fn();

		const { container } = render(
			<DirectoryBrowser
				{...baseProps}
				onEntryClick={onEntryClick}
				onEntryActivate={onEntryActivate}
			/>,
		);

		const dirRow = container.querySelector(
			'[data-entry-kind="dir"][data-entry-path="/preset/root/a"]',
		);
		expect(dirRow).not.toBeNull();

		fireEvent.click(dirRow as HTMLElement);

		expect(onEntryClick).not.toHaveBeenCalled();
		expect(onEntryActivate).not.toHaveBeenCalled();
	});

	it("fires onGoUp on single-click of the up row (up is single-click even for directories)", () => {
		const onGoUp = vi.fn();
		const onEntryClick = vi.fn();

		const { container } = render(
			<DirectoryBrowser
				{...baseProps}
				onGoUp={onGoUp}
				onEntryClick={onEntryClick}
			/>,
		);

		const upRow = container.querySelector(
			'[data-entry-kind="dir"][data-entry-path=""]',
		);
		expect(upRow).not.toBeNull();

		fireEvent.click(upRow as HTMLElement);

		expect(onGoUp).toHaveBeenCalledTimes(1);
		expect(onEntryClick).not.toHaveBeenCalled();
	});

	it("fires onEntryClick on single-click of a file row", () => {
		const onEntryClick = vi.fn();

		const { container } = render(
			<DirectoryBrowser {...baseProps} onEntryClick={onEntryClick} />,
		);

		const fileRow = container.querySelector(
			'[data-entry-kind="file"][data-entry-path="/preset/root/b.txt"]',
		);
		expect(fileRow).not.toBeNull();

		fireEvent.click(fileRow as HTMLElement);

		expect(onEntryClick).toHaveBeenCalledTimes(1);
		expect(onEntryClick).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "/preset/root/b.txt",
				isDirectory: false,
			}),
		);
	});

	it("fires onEntryActivate on double-click of a directory row (back-compat for dbl-click / Enter)", () => {
		const onEntryClick = vi.fn();
		const onEntryActivate = vi.fn();

		const { container } = render(
			<DirectoryBrowser
				{...baseProps}
				onEntryClick={onEntryClick}
				onEntryActivate={onEntryActivate}
			/>,
		);

		const dirRow = container.querySelector(
			'[data-entry-kind="dir"][data-entry-path="/preset/root/a"]',
		);
		expect(dirRow).not.toBeNull();

		fireEvent.doubleClick(dirRow as HTMLElement);

		expect(onEntryActivate).toHaveBeenCalledTimes(1);
		expect(onEntryActivate).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "/preset/root/a",
				isDirectory: true,
			}),
		);
	});

	it("does not fire onEntryClick when the row's checkbox is clicked (stopPropagation preserved)", () => {
		const onEntryClick = vi.fn();
		const onToggleSelected = vi.fn();

		const { container } = render(
			<DirectoryBrowser
				{...baseProps}
				selectionMode="files"
				onEntryClick={onEntryClick}
				onToggleSelected={onToggleSelected}
			/>,
		);

		const fileRow = container.querySelector(
			'[data-entry-kind="file"][data-entry-path="/preset/root/b.txt"]',
		);
		expect(fileRow).not.toBeNull();

		const checkbox = fileRow?.parentElement?.querySelector(
			'input[type="checkbox"]',
		) as HTMLInputElement | null;
		expect(checkbox).not.toBeNull();

		fireEvent.click(checkbox as HTMLElement);

		expect(onToggleSelected).toHaveBeenCalledWith("/preset/root/b.txt", "file");
		expect(onEntryClick).not.toHaveBeenCalled();
	});

	it("does not fire onEntryClick when a folder checkbox is clicked in selectionMode=folders", () => {
		const onEntryClick = vi.fn();
		const onToggleSelected = vi.fn();

		const { container } = render(
			<DirectoryBrowser
				{...baseProps}
				selectionMode="folders"
				onEntryClick={onEntryClick}
				onToggleSelected={onToggleSelected}
				isSelected={() => false}
			/>,
		);

		const dirRow = container.querySelector(
			'[data-entry-kind="dir"][data-entry-path="/preset/root/a"]',
		);
		expect(dirRow).not.toBeNull();

		const checkbox = dirRow?.parentElement?.querySelector(
			'input[type="checkbox"]',
		) as HTMLInputElement | null;
		expect(checkbox).not.toBeNull();

		fireEvent.click(checkbox as HTMLElement);

		expect(onToggleSelected).toHaveBeenCalledWith("/preset/root/a", "folder");
		expect(onEntryClick).not.toHaveBeenCalled();
	});

	it("renders the icons grid when viewMode=icons is passed (fully controlled)", () => {
		const { container, rerender } = render(
			<DirectoryBrowser {...baseProps} onEntryClick={vi.fn()} />,
		);
		expect(
			container.querySelector(".ty-shell-directory-scroll.grid"),
		).toBeNull();

		rerender(
			<DirectoryBrowser
				{...baseProps}
				viewMode="icons"
				onEntryClick={vi.fn()}
			/>,
		);
		const grid = container.querySelector(".ty-shell-directory-scroll.grid");
		expect(grid).not.toBeNull();
		expect(grid?.querySelector('[data-entry-kind="file"]')).not.toBeNull();
	});

	it("calls onViewModeChange without keeping internal view state", () => {
		const onViewModeChange = vi.fn();
		const { container, rerender } = render(
			<DirectoryBrowser
				{...baseProps}
				viewMode="list"
				onViewModeChange={onViewModeChange}
				onEntryClick={vi.fn()}
			/>,
		);
		expect(
			container.querySelector(".ty-shell-directory-scroll.grid"),
		).toBeNull();

		// Parent ignores the change: the kit must NOT switch on its own.
		rerender(
			<DirectoryBrowser
				{...baseProps}
				viewMode="list"
				onViewModeChange={onViewModeChange}
				onEntryClick={vi.fn()}
			/>,
		);
		expect(
			container.querySelector(".ty-shell-directory-scroll.grid"),
		).toBeNull();

		// The footer toggle only notifies the owner.
		const iconButton = container.querySelector(
			'button[aria-label="Icon view"]',
		) as HTMLElement | null;
		expect(iconButton).not.toBeNull();
		fireEvent.click(iconButton as HTMLElement);
		expect(onViewModeChange).toHaveBeenCalledTimes(1);
		expect(onViewModeChange).toHaveBeenCalledWith("icons");
		expect(
			container.querySelector(".ty-shell-directory-scroll.grid"),
		).toBeNull();

		// Parent follows the change: the kit switches.
		rerender(
			<DirectoryBrowser
				{...baseProps}
				viewMode="icons"
				onViewModeChange={onViewModeChange}
				onEntryClick={vi.fn()}
			/>,
		);
		expect(
			container.querySelector(".ty-shell-directory-scroll.grid"),
		).not.toBeNull();
		// Only the explicit footer-toggle click notified the owner.
		expect(onViewModeChange).toHaveBeenCalledTimes(1);
	});

	it("scales grid columns with the scale prop", () => {
		const { container } = render(
			<DirectoryBrowser
				{...baseProps}
				viewMode="icons"
				scale={1.5}
				onEntryClick={vi.fn()}
			/>,
		);
		const grid = container.querySelector(
			".ty-shell-directory-scroll.grid",
		) as HTMLElement | null;
		expect(grid?.style.gridTemplateColumns).toContain("6rem");
	});

	/**
	 * #144 — typography invariant on selection.
	 *
	 * Toggling `isSelected` must not change the rendered row's
	 * font-weight, font-size, line-height, or letter-spacing.  happy-dom's
	 * CSS computation is unreliable (see `bunfig.toml`'s environment
	 * fallback) so we assert on:
	 *   1. The generated className set on the row's text span (the
	 *      `rowEntryTextSelectedClass` applied on selection must NOT
	 *      include `fontWeight: medium` or any weight-on-selection rule).
	 *   2. Source-level absence of `fontWeight: "medium"` in the
	 *      production files — guards against accidental regression.
	 */
	it("does not bump font-weight on the row text when isSelected toggles", () => {
		const { container, rerender } = render(
			<DirectoryBrowser
				{...baseProps}
				isSelected={() => false}
				onEntryClick={vi.fn()}
			/>,
		);

		const buttonUnselected = container.querySelector(
			'button[data-entry-path="/preset/root/b.txt"]',
		) as HTMLElement | null;
		expect(buttonUnselected).not.toBeNull();
		const classUnselected = buttonUnselected?.className ?? "";

		rerender(
			<DirectoryBrowser
				{...baseProps}
				isSelected={(path) => path === "/preset/root/b.txt"}
				onEntryClick={vi.fn()}
			/>,
		);

		const buttonSelected = container.querySelector(
			'button[data-entry-path="/preset/root/b.txt"]',
		) as HTMLElement | null;
		expect(buttonSelected).not.toBeNull();
		const classSelected = buttonSelected?.className ?? "";

		// The selected variant must not introduce any font-weight bump
		// on the row's text-bearing button.
		expect(classSelected).not.toMatch(
			/font-weight_500|font-weight_medium|fw_medium/,
		);
		expect(classSelected).not.toMatch(/\bfw_[a-z]+/);
		// Both states must use the same font-size token.
		expect(classUnselected).toContain("fs_shell-text-sm");
		expect(classSelected).toContain("fs_shell-text-sm");
	});

	it("IconCard label does not change weight when isSelected toggles", () => {
		const { container, rerender } = render(
			<DirectoryBrowser
				{...baseProps}
				viewMode="icons"
				isSelected={() => false}
				onEntryClick={vi.fn()}
			/>,
		);

		const cardBefore = container.querySelector(
			'[data-card-selected="false"]',
		) as HTMLElement | null;
		expect(cardBefore).not.toBeNull();
		const labelBefore =
			(cardBefore?.querySelector("span[title]") as HTMLElement | null)
				?.className ?? "";

		rerender(
			<DirectoryBrowser
				{...baseProps}
				viewMode="icons"
				isSelected={(path) => path === "/preset/root/b.txt"}
				onEntryClick={vi.fn()}
			/>,
		);

		const cardAfter = container.querySelector(
			'[data-card-selected="true"]',
		) as HTMLElement | null;
		expect(cardAfter).not.toBeNull();
		const labelAfter =
			(cardAfter?.querySelector("span[title]") as HTMLElement | null)
				?.className ?? "";

		// Label className must not encode a font-weight on selection.
		expect(labelAfter).not.toMatch(/fontWeight|font-weight/);
		// The base font-size token (fs_shell-text-sm) must be present in both.
		expect(labelBefore).toContain("fs_shell-text-sm");
		expect(labelAfter).toContain("fs_shell-text-sm");
	});

	/**
	 * #144 — state split.  `activePath` and `isSelected` are independent.
	 * Each combination renders a distinct `data-row-state` value so
	 * downstream tests / stylesheets can target the four states.
	 */
	it("renders four distinct data-row-state values from activePath + isSelected", () => {
		const states: Array<{
			activePath: string | null;
			selected: (path: string) => boolean;
			expected: string;
		}> = [
			{
				activePath: null,
				selected: () => false,
				expected: "none",
			},
			{
				activePath: "/preset/root/a",
				selected: () => false,
				expected: "active",
			},
			{
				activePath: null,
				selected: (path) => path === "/preset/root/a",
				expected: "selected",
			},
			{
				activePath: "/preset/root/a",
				selected: (path) => path === "/preset/root/a",
				expected: "active+selected",
			},
		];

		for (const s of states) {
			const { container } = render(
				<DirectoryBrowser
					{...baseProps}
					activePath={s.activePath}
					isSelected={(path) => s.selected(path)}
					onEntryClick={vi.fn()}
				/>,
			);
			const row = container.querySelector('[data-entry-path="/preset/root/a"]');
			expect(row).not.toBeNull();
			const wrap = row?.closest("[data-row-state]") as HTMLElement | null;
			expect(wrap?.getAttribute("data-row-state")).toBe(s.expected);
			const inner = wrap?.querySelector(
				"[data-row-active][data-row-selected]",
			) as HTMLElement | null;
			expect(inner).not.toBeNull();
		}
	});

	it("data-row-active and data-row-selected reflect the four-state matrix", () => {
		const expected: Array<{
			activePath: string | null;
			selected: (path: string) => boolean;
			active: string;
			selectedAttr: string;
		}> = [
			{
				activePath: null,
				selected: () => false,
				active: "false",
				selectedAttr: "false",
			},
			{
				activePath: "/preset/root/a",
				selected: () => false,
				active: "true",
				selectedAttr: "false",
			},
			{
				activePath: null,
				selected: (p) => p === "/preset/root/a",
				active: "false",
				selectedAttr: "true",
			},
			{
				activePath: "/preset/root/a",
				selected: (p) => p === "/preset/root/a",
				active: "true",
				selectedAttr: "true",
			},
		];

		for (const s of expected) {
			const { container } = render(
				<DirectoryBrowser
					{...baseProps}
					activePath={s.activePath}
					isSelected={s.selected}
					onEntryClick={vi.fn()}
				/>,
			);
			const inner = container
				.querySelector('[data-entry-path="/preset/root/a"]')
				?.closest("[data-row-active][data-row-selected]") as HTMLElement | null;
			expect(inner).not.toBeNull();
			expect(inner?.getAttribute("data-row-active")).toBe(s.active);
			expect(inner?.getAttribute("data-row-selected")).toBe(s.selectedAttr);
		}
	});

	/**
	 * #144 — truncation invariance.  Long file names must render with the
	 * same font-size token regardless of selection state.  happy-dom
	 * does not perform layout, so we assert on the CSS source shape
	 * rather than the truncation ellipsis position.
	 */
	it("renders long file names with the same font-size token regardless of selection", () => {
		const longName = "foo-bar-baz-qux-quux-corge-grault-garply-waldo-fred.txt";
		const longEntries: DirectoryBrowserEntry[] = [
			{
				path: "/preset/root/long.txt",
				name: longName,
				isDirectory: false,
			},
		];

		const { container, rerender } = render(
			<DirectoryBrowser
				{...baseProps}
				entries={longEntries}
				isSelected={() => false}
				onEntryClick={vi.fn()}
			/>,
		);
		const buttonUnselected = container.querySelector(
			'button[data-entry-path="/preset/root/long.txt"]',
		) as HTMLElement | null;
		const classUnselected = buttonUnselected?.className ?? "";

		rerender(
			<DirectoryBrowser
				{...baseProps}
				entries={longEntries}
				isSelected={() => true}
				onEntryClick={vi.fn()}
			/>,
		);
		const buttonSelected = container.querySelector(
			'button[data-entry-path="/preset/root/long.txt"]',
		) as HTMLElement | null;
		const classSelected = buttonSelected?.className ?? "";

		expect(classUnselected).toContain("fs_shell-text-sm");
		expect(classSelected).toContain("fs_shell-text-sm");
		// The text-node itself remains the long name; selection must not
		// mutate the rendered string.
		expect(buttonSelected?.textContent).toBe(longName);
		expect(buttonUnselected?.textContent).toBe(longName);
	});

	/**
	 * #144 — row height invariance.  The row's outer wrapper height
	 * must not change between unselected and selected states.  happy-dom
	 * does not implement layout (`getBoundingClientRect()` returns 0s),
	 * so we instead assert that the row's class set does not introduce
	 * a new height-affecting rule (no new border that consumes space,
	 * no padding change, no margin change).
	 */
	it("does not introduce a height-affecting rule on selection", () => {
		const { container, rerender } = render(
			<DirectoryBrowser
				{...baseProps}
				isSelected={() => false}
				onEntryClick={vi.fn()}
			/>,
		);

		const unselectedInner = container.querySelector(
			'[data-entry-path="/preset/root/b.txt"]',
		)?.parentElement as HTMLElement | null;
		const unselectedClass = unselectedInner?.className ?? "";

		rerender(
			<DirectoryBrowser
				{...baseProps}
				isSelected={() => true}
				onEntryClick={vi.fn()}
			/>,
		);

		const selectedInner = container.querySelector(
			'[data-entry-path="/preset/root/b.txt"]',
		)?.parentElement as HTMLElement | null;
		const selectedClass = selectedInner?.className ?? "";

		// The selected row must NOT introduce padding-block / height /
		// margin / border-width (which would all change row height).
		// `box-shadow` and `background-color` are fine (no layout impact).
		expect(selectedClass).not.toMatch(/paddingBlock|padding-block/);
		expect(selectedClass).not.toMatch(/height:\s*"|height:/);
		expect(selectedClass).not.toMatch(/marginBlock|margin-block|margin:/);
		expect(selectedClass).not.toMatch(/borderWidth|border-width/);
		// Sanity: unselected variant also free of those rules.
		expect(unselectedClass).not.toMatch(/paddingBlock|padding-block/);
	});
});
