/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComponentPreviewSection } from "./ComponentPreviewSection";

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
	it("does not wrap the whole preview section in an accordion", () => {
		// Issue #143: AccordionSection was removed. The section
		// body renders directly. There must be no
		// `data-settings-accordion-trigger` element in the section
		// tree, and no `data-settings-section` wrapper outside of
		// the SettingsSidebar body (which we don't render here).
		const { container } = render(<ComponentPreviewSection />);

		expect(
			screen.getByText(
				"Live preview of shared UI components using current design tokens.",
			),
		).toBeInTheDocument();
		expect(screen.getByText("Preset Icon Editor")).toBeInTheDocument();
		expect(
			container.querySelectorAll("[data-settings-accordion-trigger]"),
		).toHaveLength(0);
	});
});
