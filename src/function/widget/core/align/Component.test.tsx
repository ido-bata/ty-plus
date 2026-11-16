/**
 * @vitest-environment jsdom
 *
 * Align widget action-control contract (Issue #145).
 *
 * Every clickable control inside the widget must carry `data-ws-action` so
 * that `useAnchorGesture` (and the workspace tile handlers) exclude it from
 * stroke/drag gesture recognition. Without the attribute a pointerdown on a
 * button both starts a gesture stroke AND fires the button's onClick —
 * the double-path regression this test pins.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { WidgetRenderProps } from "@/function/widget/define";
import { RuntimeProvider } from "@/function/widget/runtime-context";
import { Align } from "./Component";

const baseProps = {
	layout: { id: "test-id", cols: 2, rows: 2 },
	state: {},
	grid: {},
	widthPx: 200,
	widgetInstanceId: "test-id",
} as unknown as WidgetRenderProps;

function renderAlign(
	host = vi.fn(async (method: string, _args?: unknown) => ({
		value: method === "getSelectionCount" ? { count: 3 } : undefined,
	})),
) {
	const utils = render(
		<RuntimeProvider
			value={{
				host: host as never,
				activeWidgetInstanceId: null,
				setActiveWidgetInstanceId: () => {},
			}}
		>
			<Align {...baseProps} />
		</RuntimeProvider>,
	);
	return { ...utils, host };
}

describe("Align action controls", () => {
	beforeAll(() => {
		// jsdom does not provide ResizeObserver; the widget only uses it for
		// local sizing, so a no-op stub is sufficient.
		(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	});

	afterEach(() => {
		cleanup();
	});

	it("marks every action and target button with data-ws-action", () => {
		const { container } = renderAlign();
		const buttons = Array.from(container.querySelectorAll("button"));
		expect(buttons.length).toBeGreaterThan(0);
		for (const btn of buttons) {
			expect(btn.getAttribute("data-ws-action")).toBeTruthy();
		}
	});

	it("runs the align action on click without starting a gesture", async () => {
		const { container, host } = renderAlign();

		const alignRight = Array.from(container.querySelectorAll("button")).find(
			(b) => b.getAttribute("data-ws-action") === "align-right",
		);
		expect(alignRight).toBeTruthy();

		// Buttons stay disabled until the mount-time getSelectionCount
		// resolves; wait for the enabled state before clicking.
		await waitFor(() => {
			expect((alignRight as HTMLButtonElement).disabled).toBe(false);
		});

		fireEvent.pointerDown(alignRight as HTMLElement, {
			button: 0,
			clientX: 10,
			clientY: 10,
		});
		fireEvent.pointerUp(alignRight as HTMLElement, {
			button: 0,
			clientX: 10,
			clientY: 10,
		});
		fireEvent.click(alignRight as HTMLElement);

		await waitFor(() => {
			expect(
				host.mock.calls.some(
					(call) =>
						call[0] === "alignLayers" &&
						(call[1] as { action?: string }[])?.[0]?.action === "align-right",
				),
			).toBe(true);
		});
	});
});
