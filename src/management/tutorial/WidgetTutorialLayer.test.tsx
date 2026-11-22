/**
 * @vitest-environment jsdom
 */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetDescriptor } from "@/management/widget/registry";
import { getWidgetDescriptor } from "@/management/widget/registry";
import {
	dismissTutorialHint,
	isTutorialHintDismissed,
	isTutorialSeen,
	markTutorialSeen,
} from "./state-store";
import { WidgetTutorialLayer } from "./WidgetTutorialLayer";

vi.mock("@/management/i18n/Context", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("@/management/widget/registry", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/management/widget/registry")>();
	return {
		...actual,
		getWidgetDescriptor: vi.fn(),
	};
});

vi.mock("./state-store", () => ({
	isTutorialHintDismissed: vi.fn(() => Promise.resolve(false)),
	isTutorialSeen: vi.fn(() => Promise.resolve(false)),
	dismissTutorialHint: vi.fn(() => Promise.resolve()),
	markTutorialSeen: vi.fn(() => Promise.resolve()),
}));

const size = { cols: 1, rows: 1 };

const descriptorWithSteps: WidgetDescriptor = {
	type: "test-tour-widget",
	nameKey: "widgets.test-tour-widget.name",
	icon: "Info",
	minSize: size,
	maxSize: size,
	defaultSize: size,
	available: true,
	resizable: false,
	component: () => null,
	tutorial: {
		summaryKey: "widgets.tutorial.test-tour-widget.summary",
		contentVersion: "7",
		steps: [
			{
				titleKey: "widgets.tutorial.test-tour-widget.steps.one.title",
				bodyKey: "widgets.tutorial.test-tour-widget.steps.one.body",
				targetSelector: '[data-tutorial-target="step-one"]',
			},
			{
				titleKey: "widgets.tutorial.test-tour-widget.steps.two.title",
				bodyKey: "widgets.tutorial.test-tour-widget.steps.two.body",
			},
		],
	},
};

const descriptorSummaryOnly: WidgetDescriptor = {
	...descriptorWithSteps,
	type: "test-summary-widget",
	tutorial: {
		summaryKey: "widgets.tutorial.test-summary-widget.summary",
		contentVersion: "3",
	},
};

const descriptorNoTutorial: WidgetDescriptor = {
	...descriptorWithSteps,
	type: "test-plain-widget",
	tutorial: undefined,
};

const DESCRIPTORS: Record<string, WidgetDescriptor> = {
	"test-tour-widget": descriptorWithSteps,
	"test-summary-widget": descriptorSummaryOnly,
	"test-plain-widget": descriptorNoTutorial,
};

const getDescriptorMock = vi.mocked(getWidgetDescriptor);
const dismissedMock = vi.mocked(isTutorialHintDismissed);
const seenMock = vi.mocked(isTutorialSeen);
const dismissMock = vi.mocked(dismissTutorialHint);
const seenMarkMock = vi.mocked(markTutorialSeen);

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	getDescriptorMock.mockImplementation(
		(type) => DESCRIPTORS[type] as WidgetDescriptor | undefined,
	);
	dismissedMock.mockResolvedValue(false);
	seenMock.mockResolvedValue(false);
});

const renderLayer = (widgetType: string) =>
	render(
		<WidgetTutorialLayer widgetType={widgetType}>
			<div data-tutorial-target="step-one">target</div>
		</WidgetTutorialLayer>,
	);

describe("WidgetTutorialLayer coach-mark tour", () => {
	it("renders children and the help affordance for tutorial widgets", () => {
		renderLayer("test-tour-widget");
		expect(screen.getByText("target")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "tutorial.chrome.help" }),
		).toBeInTheDocument();
	});

	it("renders no help affordance without tutorial content", () => {
		renderLayer("test-plain-widget");
		expect(
			screen.queryByRole("button", { name: "tutorial.chrome.help" }),
		).not.toBeInTheDocument();
	});

	it("auto-opens the tour on first run and persists dismissal on skip", async () => {
		renderLayer("test-tour-widget");
		expect(
			await screen.findByText("tutorial.test-tour-widget.steps.one.title"),
		).toBeInTheDocument();
		expect(dismissedMock).toHaveBeenCalledWith(window, "test-tour-widget", "7");

		fireEvent.click(
			screen.getByRole("button", { name: "tutorial.chrome.skip" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByText("tutorial.test-tour-widget.steps.one.title"),
			).not.toBeInTheDocument(),
		);
		expect(dismissMock).toHaveBeenCalledWith(window, "test-tour-widget", "7");
		expect(seenMarkMock).toHaveBeenCalledWith(window, "test-tour-widget", "7");
	});

	it("stays closed on first run when already dismissed or seen", async () => {
		dismissedMock.mockResolvedValue(true);
		const { unmount } = renderLayer("test-tour-widget");
		await waitFor(() => expect(dismissedMock).toHaveBeenCalled());
		expect(
			screen.queryByText("tutorial.test-tour-widget.steps.one.title"),
		).not.toBeInTheDocument();
		unmount();

		dismissedMock.mockResolvedValue(false);
		seenMock.mockResolvedValue(true);
		renderLayer("test-tour-widget");
		await waitFor(() => expect(seenMock).toHaveBeenCalled());
		expect(
			screen.queryByText("tutorial.test-tour-widget.steps.one.title"),
		).not.toBeInTheDocument();
	});

	it("steps forward with Next and back with Back via the help affordance", async () => {
		renderLayer("test-tour-widget");
		// Auto tour opens; close it first so the manual flow is isolated.
		fireEvent.click(
			await screen.findByRole("button", { name: "tutorial.chrome.skip" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByText("tutorial.test-tour-widget.steps.one.title"),
			).not.toBeInTheDocument(),
		);

		fireEvent.click(
			screen.getByRole("button", { name: "tutorial.chrome.help" }),
		);
		expect(seenMarkMock).toHaveBeenCalledWith(window, "test-tour-widget", "7");
		expect(
			await screen.findByText("tutorial.test-tour-widget.steps.one.title"),
		).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "tutorial.chrome.next" }),
		);
		expect(
			await screen.findByText("tutorial.test-tour-widget.steps.two.title"),
		).toBeInTheDocument();
		expect(
			screen.queryByText("tutorial.test-tour-widget.steps.one.title"),
		).not.toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "tutorial.chrome.back" }),
		);
		expect(
			await screen.findByText("tutorial.test-tour-widget.steps.one.title"),
		).toBeInTheDocument();
	});

	it("shows a summary-only card for widgets without steps", async () => {
		renderLayer("test-summary-widget");
		expect(
			await screen.findByText("tutorial.test-summary-widget.summary"),
		).toBeInTheDocument();
	});
});
