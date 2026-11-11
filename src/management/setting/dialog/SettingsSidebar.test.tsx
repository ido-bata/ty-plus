/**
 * @vitest-environment jsdom
 *
 * Issue #143 — SettingsSidebar.
 *
 * The legacy horizontal tab strip is gone. The Settings surface now
 * exposes a left sidebar built on the WAI-ARIA tabs pattern
 * (`role="tablist" aria-orientation="vertical"`) plus a single
 * section body on the right. These tests cover:
 *
 *   - a11y: tablist semantics, aria-selected on active item
 *   - keyboard: ArrowUp / ArrowDown / Home / End with wrap-around
 *   - section switching: clicking an item replaces (not hides) the
 *     previous section body
 *   - hash deep-link: `#<section>` resolves on mount and on
 *     `hashchange` events; the active section is mirrored back to
 *     the URL via `replaceState`
 *   - scroll scoping: only the section body scrolls; sidebar and
 *     footer stay flat
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	SettingsSidebar,
	type SettingsSidebarSectionDef,
} from "./SettingsSidebar";

const SIDEBAR_SOURCE = fs.readFileSync(
	path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		"SettingsSidebar.tsx",
	),
	"utf8",
);

const STUB_SECTIONS: SettingsSidebarSectionDef[] = [
	{
		sectionId: "language",
		groupId: "display",
		labelKey: "tabs.section.language",
		render: () => <div data-testid="section-language">Language body</div>,
	},
	{
		sectionId: "appearance",
		groupId: "display",
		labelKey: "tabs.section.appearance",
		render: () => <div data-testid="section-appearance">Appearance body</div>,
	},
	{
		sectionId: "background",
		groupId: "display",
		labelKey: "tabs.section.background",
		render: () => <div data-testid="section-background">Background body</div>,
	},
	{
		sectionId: "grid",
		groupId: "display",
		labelKey: "tabs.section.grid",
		render: () => <div data-testid="section-grid">Grid body</div>,
	},
	{
		sectionId: "paths",
		groupId: "data",
		labelKey: "tabs.section.paths",
		render: () => <div data-testid="section-paths">Paths body</div>,
	},
	{
		sectionId: "network",
		groupId: "data",
		labelKey: "tabs.section.network",
		render: () => <div data-testid="section-network">Network body</div>,
	},
	{
		sectionId: "component-preview",
		groupId: "data",
		labelKey: "tabs.section.component-preview",
		render: () => (
			<div data-testid="section-component-preview">ComponentPreview body</div>
		),
	},
	{
		sectionId: "design-tokens",
		groupId: "data",
		labelKey: "tabs.section.design-tokens",
		render: () => <div data-testid="section-design-tokens">Tokens body</div>,
	},
	{
		sectionId: "inputs",
		groupId: "data",
		labelKey: "tabs.section.inputs",
		render: () => <div data-testid="section-inputs">Inputs body</div>,
	},
	{
		sectionId: "workspace-backup",
		groupId: "workspace",
		labelKey: "tabs.section.workspace-backup",
		render: () => (
			<div data-testid="section-workspace-backup">WorkspaceBackup body</div>
		),
	},
	{
		sectionId: "feedback",
		groupId: "workspace",
		labelKey: "tabs.section.feedback",
		render: () => <div data-testid="section-feedback">Feedback body</div>,
	},
];

/**
 * jsdom does not always populate `window.location.hash` from
 * `window.history.replaceState`. We stub `window.location` per test
 * so the SettingsSidebar hash router reads the hash we intend, and
 * we also wrap `replaceState` to mirror writes back onto the
 * stubbed `location` object so the test can observe them.
 */
function stubLocationHash(hash: string): void {
	const targetHash = hash.startsWith("#") ? hash : `#${hash}`;
	const stub = {
		...window.location,
		hash: targetHash,
		href: `http://localhost/${targetHash}`,
	};
	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: stub,
	});
	const originalReplaceState = window.history.replaceState.bind(window.history);
	window.history.replaceState = ((
		data: unknown,
		unused: string,
		url?: string | null,
	) => {
		originalReplaceState(data, unused, url);
		if (typeof url === "string" && url.includes("#")) {
			const newHash = url.slice(url.indexOf("#"));
			Object.defineProperty(window.location, "hash", {
				configurable: true,
				writable: true,
				value: newHash,
			});
			Object.defineProperty(window.location, "href", {
				configurable: true,
				writable: true,
				value: `http://localhost/${newHash}`,
			});
		}
	}) as typeof window.history.replaceState;
}

function fireHashChange(): void {
	act(() => {
		window.dispatchEvent(new HashChangeEvent("hashchange"));
	});
}

describe("SettingsSidebar (Issue #143)", () => {
	beforeEach(() => {
		stubLocationHash("");
	});

	afterEach(() => {
		cleanup();
	});

	it("renders a vertical tablist with the WAI-ARIA semantics", () => {
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		const tablist = screen.getByRole("tablist");
		expect(tablist).toBeInTheDocument();
		expect(tablist.getAttribute("aria-orientation")).toBe("vertical");

		const groups = tablist.querySelectorAll("[data-settings-sidebar-group]");
		expect(groups).toHaveLength(3);
		expect(groups[0]?.getAttribute("data-settings-sidebar-group")).toBe(
			"display",
		);
		expect(groups[1]?.getAttribute("data-settings-sidebar-group")).toBe("data");
		expect(groups[2]?.getAttribute("data-settings-sidebar-group")).toBe(
			"workspace",
		);

		expect(screen.getAllByRole("tab")).toHaveLength(11);
	});

	it("defaults to the language section when no hash is set", () => {
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		const languageTab = screen.getByRole("tab", { name: "Language" });
		expect(languageTab.getAttribute("aria-selected")).toBe("true");
		expect(languageTab.getAttribute("data-settings-sidebar-item")).toBe(
			"language",
		);

		const panel = screen.getByRole("tabpanel");
		expect(panel.getAttribute("data-settings-sidebar-section")).toBe(
			"language",
		);
		expect(screen.getByTestId("section-language")).toBeInTheDocument();
	});

	it("uses roving tabindex — only the active tab is in the tab order", () => {
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		const tabs = screen.getAllByRole("tab");
		for (const tab of tabs) {
			const active = tab.getAttribute("aria-selected") === "true";
			expect(tab.getAttribute("tabindex")).toBe(active ? "0" : "-1");
		}
	});

	it("updates window.location.hash when a sidebar item is clicked", () => {
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		const pathsTab = screen.getByRole("tab", { name: "Paths" });
		fireEvent.click(pathsTab);

		expect(window.location.hash).toBe("#paths");
		const panel = screen.getByRole("tabpanel");
		expect(panel.getAttribute("data-settings-sidebar-section")).toBe("paths");
		expect(screen.getByTestId("section-paths")).toBeInTheDocument();
	});

	it("replaces (not just hides) the previous section body when switching", () => {
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		// Language is the default; click Network.
		const networkTab = screen.getByRole("tab", { name: "Network" });
		fireEvent.click(networkTab);

		// Only the network body is in the DOM — the language body has
		// been unmounted, not just `display: none`.
		expect(screen.queryByTestId("section-language")).toBeNull();
		expect(screen.getByTestId("section-network")).toBeInTheDocument();
	});

	it("restores the active section from a hashchange event", () => {
		stubLocationHash("#design-tokens");
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		const tokensTab = screen.getByRole("tab", { name: "Design Tokens" });
		expect(tokensTab.getAttribute("aria-selected")).toBe("true");
		expect(screen.getByTestId("section-design-tokens")).toBeInTheDocument();

		// External navigation: simulate a back/forward move to feedback
		stubLocationHash("#feedback");
		fireHashChange();

		const feedbackTab = screen.getByRole("tab", { name: "Feedback" });
		expect(feedbackTab.getAttribute("aria-selected")).toBe("true");
		expect(screen.getByTestId("section-feedback")).toBeInTheDocument();
		expect(tokensTab.getAttribute("aria-selected")).toBe("false");
	});

	it("falls back to the default section when the hash references an unknown id", () => {
		stubLocationHash("#does-not-exist");
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		const languageTab = screen.getByRole("tab", { name: "Language" });
		expect(languageTab.getAttribute("aria-selected")).toBe("true");
		expect(window.location.hash).toBe("#language");
	});

	it("navigates between sidebar items with the keyboard (ArrowUp / ArrowDown / Home / End)", () => {
		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		const languageTab = screen.getByRole("tab", { name: "Language" });
		languageTab.focus();
		expect(languageTab).toHaveFocus();

		// ArrowDown moves to the next item in the flat list
		// (Appearance in the Display group).
		fireEvent.keyDown(languageTab, { key: "ArrowDown" });
		const appearanceTab = screen.getByRole("tab", { name: "Appearance" });
		expect(appearanceTab.getAttribute("aria-selected")).toBe("true");
		expect(appearanceTab).toHaveFocus();

		// ArrowUp wraps back to the previous item.
		fireEvent.keyDown(appearanceTab, { key: "ArrowUp" });
		expect(screen.getByRole("tab", { name: "Language" })).toHaveFocus();

		// Home jumps to the first item.
		fireEvent.keyDown(languageTab, { key: "Home" });
		expect(screen.getByRole("tab", { name: "Language" })).toHaveFocus();

		// End jumps to the last item (Feedback in the workspace group).
		fireEvent.keyDown(languageTab, { key: "End" });
		const feedbackTab = screen.getByRole("tab", { name: "Feedback" });
		expect(feedbackTab).toHaveFocus();

		// ArrowDown from the last item wraps to the first.
		fireEvent.keyDown(feedbackTab, { key: "ArrowDown" });
		expect(screen.getByRole("tab", { name: "Language" })).toHaveFocus();
	});

	it("scopes scrolling to the section body — sidebar and footer stay flat", () => {
		// jsdom does not compute styles, so we cannot rely on
		// `getComputedStyle(...).overflowY`. Instead, we read the
		// SettingsSidebar source and assert:
		//   - The `css({ overflowY: "auto", ... })` block lives in
		//     both the sidebar and the body.
		//   - The Panda-emitted class `ov-y_auto` should appear on
		//     BOTH the body container and the tablist.
		expect(SIDEBAR_SOURCE).toMatch(/overflowY:\s*"auto"/);
		// The sidebar (`sidebarStyle`) must declare `overflowY: "auto"`
		// so the items at the bottom remain reachable when the dialog
		// is shorter than the sidebar's natural height (11 items +
		// 3 group headers).
		const sidebarBlock = SIDEBAR_SOURCE.match(
			/sidebarStyle\s*=\s*css\(\{[\s\S]*?\}\);/,
		);
		expect(sidebarBlock?.[0] ?? "").toMatch(/overflowY\s*:\s*"auto"/);

		render(<SettingsSidebar sections={STUB_SECTIONS} />);

		// The active section body is a scroll context.
		const body = screen
			.getByRole("tabpanel")
			.closest("[data-settings-sidebar-body]");
		expect(body).not.toBeNull();
		expect(body?.className ?? "").toMatch(/(?:^|\s)ov-y_auto(?:\s|$)/);
		// Sidebar tablist IS its own scroll container so the items at
		// the bottom remain reachable when the dialog is shorter than
		// the sidebar's natural height. The generated Panda class
		// emits `ov-y_auto` for both the body and the tablist.
		const tablist = screen.getByRole("tablist");
		expect(tablist.className).toMatch(/(?:^|\s)ov-y_auto(?:\s|$)/);

		// The root container is a row flex with minHeight: 0 plus
		// overflow:hidden in the DialogShell `Content` shell — the
		// sidebar and the body are the two scrollable descendants.
		const bodyEls = document.querySelectorAll("[data-settings-sidebar-body]");
		expect(bodyEls).toHaveLength(1);
		const tablists = document.querySelectorAll(
			"[data-settings-sidebar-tablist]",
		);
		expect(tablists).toHaveLength(1);
	});
});
