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
	it("renders children with no persistent help affordance", () => {
		renderLayer("test-tour-widget");
		expect(screen.getByText("target")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "tutorial.chrome.help" }),
		).not.toBeInTheDocument();
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

	it("steps forward with Next and back with Back in the auto-opened tour", async () => {
		renderLayer("test-tour-widget");
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

	it("anchors target-less steps to the widget body, not the layer box", async () => {
		// Issue #677: the layer is `position: absolute; inset: 0` and can span
		// far more than the widget when no positioned ancestor exists, which
		// parked the first tooltip bottom-center away from the widget. The
		// fallback anchor must be the widget body element.
		const rect = (r: {
			top: number;
			left: number;
			width: number;
			height: number;
		}): DOMRect =>
			({
				...r,
				right: r.left + r.width,
				bottom: r.top + r.height,
				x: r.left,
				y: r.top,
				toJSON: () => ({}),
			}) as DOMRect;
		const spy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: HTMLElement) {
				const mock = (
					this as unknown as { __mockRect?: ReturnType<typeof rect> }
				).__mockRect;
				return mock ?? rect({ top: 0, left: 0, width: 0, height: 0 });
			});
		try {
			const { container } = render(
				<WidgetTutorialLayer widgetType="test-tour-widget">
					<div data-testid="widget-body">
						<div data-tutorial-target="step-one">target</div>
					</div>
				</WidgetTutorialLayer>,
			);
			const layer = container.firstElementChild as HTMLElement;
			const body = screen.getByTestId("widget-body");
			// Layer box deliberately huge/different so a layer-anchored
			// placement cannot accidentally match the expected values.
			(layer as unknown as { __mockRect: DOMRect }).__mockRect = rect({
				top: 0,
				left: 0,
				width: 1200,
				height: 900,
			});
			(body as unknown as { __mockRect: DOMRect }).__mockRect = rect({
				top: 120,
				left: 220,
				width: 320,
				height: 160,
			});

			// Step 1 has a targetSelector; step 2 falls back to the widget body.
			await screen.findByText("tutorial.test-tour-widget.steps.one.title");
			fireEvent.click(
				screen.getByRole("button", { name: "tutorial.chrome.next" }),
			);
			await screen.findByText("tutorial.test-tour-widget.steps.two.title");

			const dialog = await screen.findByRole("dialog");
			// computePlacement: bubble 260x120 (jsdom rect is 0 -> fallback
			// size), anchor body {top:120,left:220,w:320,h:160} in a
			// 1024x768 viewport -> top 120+160+8=288, left 220+160-130=250.
			await waitFor(() => {
				expect(dialog.style.top).toBe("288px");
				expect(dialog.style.left).toBe("250px");
			});
		} finally {
			spy.mockRestore();
		}
	});
});
