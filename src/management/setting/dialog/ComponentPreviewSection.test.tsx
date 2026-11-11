/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComponentPreviewSection } from "./sections/ComponentPreviewSection";

vi.mock("@/management/preset/markdown/LiveEditor", () => ({
	MarkdownLiveEditor: () => <div data-testid="markdown-editor" />,
}));

vi.mock("@/management/storage/ui/DirectoryBrowser", () => ({
	DirectoryBrowser: () => <div data-testid="directory-browser" />,
}));

vi.mock("@/management/preset/editor/View", () => ({
	Editor: () => <div data-testid="code-editor" />,
}));

describe("ComponentPreviewSection", () => {
	it("renders the preset icon editor with a framed square preview", () => {
		// Issue #143: AccordionSection was removed; sections render
		// directly. There is no "Component Preview" trigger button to
		// click anymore — the sidebar item drives the visibility, but
		// for unit-level rendering of the section itself, the body is
		// mounted unconditionally.
		const { container } = render(<ComponentPreviewSection />);

		expect(screen.getByText("Preset Icon Editor")).toBeInTheDocument();
		expect(container.querySelector(".asp_square.grid-r_span_2")).toBeTruthy();
	});
});
