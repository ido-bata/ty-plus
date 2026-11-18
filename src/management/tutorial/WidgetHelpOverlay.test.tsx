/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetDescriptor } from "@/function/widget/define";
import { register } from "@/function/widget/registry-core";
import { markTutorialSeen } from "./state-store";
import { WidgetHelpOverlay } from "./WidgetHelpOverlay";

vi.mock("@/management/i18n/Context", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("./state-store", () => ({
	markTutorialSeen: vi.fn(() => Promise.resolve()),
}));

const size = { cols: 1, rows: 1 };

const descriptorWithTutorial: WidgetDescriptor = {
	type: "test-help-widget",
	nameKey: "widgets.test-help-widget.name",
	icon: "Info",
	minSize: size,
	maxSize: size,
	defaultSize: size,
	available: true,
	resizable: false,
	component: () => null,
	tutorial: {
		summaryKey: "widgets.tutorial.test-help-widget.summary",
		contentVersion: "1",
		steps: [
			{
				titleKey: "widgets.tutorial.test-help-widget.steps.one.title",
				bodyKey: "widgets.tutorial.test-help-widget.steps.one.body",
			},
		],
	},
};

const descriptorWithoutTutorial: WidgetDescriptor = {
	...descriptorWithTutorial,
	type: "test-no-tutorial-widget",
	tutorial: undefined,
};

register(descriptorWithTutorial);
register(descriptorWithoutTutorial);

afterEach(cleanup);

describe("WidgetHelpOverlay (#159)", () => {
	it("renders nothing for widgets without tutorial content", () => {
		const { container } = render(
			<WidgetHelpOverlay widgetType="test-no-tutorial-widget" />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing for unknown widget types", () => {
		const { container } = render(
			<WidgetHelpOverlay widgetType="does-not-exist" />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("shows summary and steps after opening, and marks the tutorial seen", () => {
		render(<WidgetHelpOverlay widgetType="test-help-widget" />);

		const button = screen.getByRole("button", {
			name: "tutorial.chrome.help",
		});
		expect(button).toHaveAttribute("aria-expanded", "false");
		expect(
			screen.queryByText("tutorial.test-help-widget.summary"),
		).not.toBeInTheDocument();

		fireEvent.click(button);

		expect(button).toHaveAttribute("aria-expanded", "true");
		expect(
			screen.getByText("tutorial.test-help-widget.summary"),
		).toBeInTheDocument();
		expect(
			screen.getByText("tutorial.test-help-widget.steps.one.title"),
		).toBeInTheDocument();
		expect(
			screen.getByText("tutorial.test-help-widget.steps.one.body"),
		).toBeInTheDocument();
		expect(markTutorialSeen).toHaveBeenCalledWith(
			window,
			"test-help-widget",
			"1",
		);
	});

	it("closes the panel via the close button", () => {
		render(<WidgetHelpOverlay widgetType="test-help-widget" />);

		fireEvent.click(
			screen.getByRole("button", { name: "tutorial.chrome.help" }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "tutorial.chrome.close" }),
		);

		expect(
			screen.queryByText("tutorial.test-help-widget.summary"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "tutorial.chrome.help" }),
		).toHaveAttribute("aria-expanded", "false");
	});
});
