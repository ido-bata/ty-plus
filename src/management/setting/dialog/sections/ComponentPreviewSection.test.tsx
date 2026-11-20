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

	it("only previews components that are actually used in the product", () => {
		render(<ComponentPreviewSection />);

		// Components with real product usage.
		for (const title of [
			"Segmented Control",
			"Color Fields",
			"Regex Editor",
			"List Select",
			"Directory Browser",
			"Preset Icon Editor",
			"Markdown Editor",
			"Code Editor",
		]) {
			expect(screen.getAllByText(title).length).toBeGreaterThan(0);
		}
		expect(screen.getAllByLabelText("Accent color").length).toBeGreaterThan(0);
		expect(
			screen.getAllByLabelText("Widget Background color").length,
		).toBeGreaterThan(0);

		// Removed fakes: LoadingSpinner had zero product usages,
		// PreviewCard was a section-local mock, and standalone
		// RangeField is only an internal part of ColorOpacityField.
		expect(screen.queryByText("Loading")).not.toBeInTheDocument();
		expect(screen.queryByText("Preview Card")).not.toBeInTheDocument();
		expect(
			screen.queryByText("Slider with numeric input"),
		).not.toBeInTheDocument();
	});
});
