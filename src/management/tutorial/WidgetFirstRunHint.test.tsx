/**
 * @vitest-environment jsdom
 */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetDescriptor } from "@/function/widget/define";
import { register } from "@/function/widget/registry-core";
import { dismissTutorialHint, isTutorialHintDismissed } from "./state-store";
import {
	FIRST_RUN_HINT_TIMEOUT_MS,
	WidgetFirstRunHint,
} from "./WidgetFirstRunHint";

vi.mock("@/management/i18n/Context", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("./state-store", () => ({
	isTutorialHintDismissed: vi.fn(() => Promise.resolve(false)),
	dismissTutorialHint: vi.fn(() => Promise.resolve()),
}));

const size = { cols: 1, rows: 1 };

const descriptorWithTutorial: WidgetDescriptor = {
	type: "test-hint-widget",
	nameKey: "widgets.test-hint-widget.name",
	icon: "Info",
	minSize: size,
	maxSize: size,
	defaultSize: size,
	available: true,
	resizable: false,
	component: () => null,
	tutorial: {
		summaryKey: "widgets.tutorial.test-hint-widget.summary",
		contentVersion: "1",
	},
};

register(descriptorWithTutorial);

const isDismissedMock = vi.mocked(isTutorialHintDismissed);
const dismissMock = vi.mocked(dismissTutorialHint);

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	isDismissedMock.mockResolvedValue(false);
});

describe("WidgetFirstRunHint (#160)", () => {
	it("renders nothing for widgets without tutorial content", () => {
		const { container } = render(
			<WidgetFirstRunHint widgetType="not-a-real-widget" />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("shows the summary once when the hint was never dismissed", async () => {
		render(<WidgetFirstRunHint widgetType="test-hint-widget" />);
		expect(
			await screen.findByText("tutorial.test-hint-widget.summary"),
		).toBeInTheDocument();
		expect(isDismissedMock).toHaveBeenCalledWith(
			window,
			"test-hint-widget",
			"1",
		);
	});

	it("stays hidden when the hint was already dismissed", async () => {
		isDismissedMock.mockResolvedValue(true);
		const { container } = render(
			<WidgetFirstRunHint widgetType="test-hint-widget" />,
		);
		await vi.waitFor(() => expect(isDismissedMock).toHaveBeenCalled());
		expect(container).toBeEmptyDOMElement();
	});

	it("dismiss button hides the hint and persists the dismissal", async () => {
		render(<WidgetFirstRunHint widgetType="test-hint-widget" />);
		const dismiss = await screen.findByRole("button", {
			name: "tutorial.chrome.dismissHint",
		});
		fireEvent.click(dismiss);
		expect(
			screen.queryByText("tutorial.test-hint-widget.summary"),
		).not.toBeInTheDocument();
		expect(dismissMock).toHaveBeenCalledWith(window, "test-hint-widget", "1");
	});

	it("interaction signal dismisses the hint and persists it", async () => {
		const { rerender } = render(
			<WidgetFirstRunHint
				widgetType="test-hint-widget"
				interactionSignal={0}
			/>,
		);
		await screen.findByText("tutorial.test-hint-widget.summary");
		rerender(
			<WidgetFirstRunHint
				widgetType="test-hint-widget"
				interactionSignal={1}
			/>,
		);
		expect(
			screen.queryByText("tutorial.test-hint-widget.summary"),
		).not.toBeInTheDocument();
		expect(dismissMock).toHaveBeenCalledWith(window, "test-hint-widget", "1");
	});

	it("auto-dismisses after the timeout and persists it", async () => {
		vi.useFakeTimers();
		try {
			render(<WidgetFirstRunHint widgetType="test-hint-widget" />);
			// Flush the async dismissed-check so the hint becomes visible.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			expect(
				screen.getByText("tutorial.test-hint-widget.summary"),
			).toBeInTheDocument();

			await act(async () => {
				await vi.advanceTimersByTimeAsync(FIRST_RUN_HINT_TIMEOUT_MS);
			});
			expect(
				screen.queryByText("tutorial.test-hint-widget.summary"),
			).not.toBeInTheDocument();
			expect(dismissMock).toHaveBeenCalledWith(window, "test-hint-widget", "1");
		} finally {
			vi.useRealTimers();
		}
	});
});
