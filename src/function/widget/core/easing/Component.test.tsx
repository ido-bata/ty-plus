/**
 * @vitest-environment jsdom
 *
 * Easing widget canvas gesture contract (Issue #145).
 *
 * A plain left-click/drag ANYWHERE on the canvas must select the handle or
 * point nearest to the click position — there is no distance cap and no
 * empty-area pan. Panning is an explicit gesture only: middle-button drag
 * or Space+left-drag.
 *
 * jsdom has no 2d canvas context, but `draw()` early-returns when
 * `getContext("2d")` yields null, so gesture handling is fully exercisable.
 * The observable signal used here is the auto-apply path: an element drag
 * sets `dragChanged`, and pointer-up with `autoApply` (default on) calls
 * the host's `applyEasing`. A pan drag never sets `dragChanged`, so it must
 * NOT reach `applyEasing`.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RuntimeProvider } from "@/function/widget/runtime-context";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { EasingWidget } from "./Component";

const layout = {
	id: "easing-test-1",
	widgetType: "easing",
	x: 0,
	y: 0,
	width: 4,
	height: 5,
} as unknown as Layout;

function renderEasing(
	host = vi.fn(async (method: string, _args?: unknown) => ({
		value:
			method === "getEasingSelectionCount"
				? { pairs: 2 }
				: method === "getLabelColorNames"
					? { names: {} }
					: {},
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
			<EasingWidget layout={layout} />
		</RuntimeProvider>,
	);
	const canvas = utils.container.querySelector<HTMLCanvasElement>(
		"[data-ws-easing-editor-canvas]",
	);
	if (!canvas) throw new Error("easing canvas not found");
	return { ...utils, host, canvas };
}

const hostCalls = (host: ReturnType<typeof vi.fn>, method: string) =>
	host.mock.calls.filter((call) => call[0] === method);

describe("EasingWidget canvas gestures", () => {
	beforeAll(() => {
		// jsdom does not provide ResizeObserver; the widget only uses it for
		// local sizing, so a no-op stub is sufficient.
		(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
		// jsdom does not implement requestAnimationFrame unless
		// pretendToBeVisual is on. The preview animation is irrelevant to
		// gesture assertions, so a never-firing stub is enough.
		globalThis.requestAnimationFrame = (() =>
			0) as typeof requestAnimationFrame;
		globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
		// jsdom does not implement pointer capture on canvas elements.
		const proto = HTMLCanvasElement.prototype as unknown as Record<
			string,
			(...args: never[]) => unknown
		>;
		proto.setPointerCapture = () => {};
		proto.releasePointerCapture = () => {};
		proto.hasPointerCapture = () => false;
	});

	afterEach(() => {
		cleanup();
	});

	it("plain left-drag far from every handle selects the nearest element and applies on release", async () => {
		const { canvas, host } = renderEasing();

		// jsdom reports a 0x0 rect, so clientX/Y map 1:1 to canvas space.
		// (5000, 5000) is far outside every handle dot — under the old
		// 24px-cap behavior this gesture panned; now it must grab the
		// nearest handle, snap it to the pointer, and auto-apply.
		fireEvent.pointerDown(canvas, {
			button: 0,
			clientX: 5000,
			clientY: 5000,
		});
		fireEvent.pointerMove(canvas, {
			button: 0,
			clientX: 5100,
			clientY: 5100,
		});
		fireEvent.pointerUp(canvas, {
			button: 0,
			clientX: 5100,
			clientY: 5100,
		});

		await waitFor(() => {
			expect(hostCalls(host, "applyEasing").length).toBeGreaterThan(0);
		});
	});

	it("middle-button drag pans and does not apply the curve", async () => {
		const { canvas, host } = renderEasing();

		fireEvent.pointerDown(canvas, {
			button: 1,
			clientX: 100,
			clientY: 100,
		});
		fireEvent.pointerMove(canvas, {
			button: 1,
			clientX: 160,
			clientY: 160,
		});
		fireEvent.pointerUp(canvas, {
			button: 1,
			clientX: 160,
			clientY: 160,
		});

		// Give any stray async apply a chance to fire, then assert the pan
		// gesture never reached the apply path.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(hostCalls(host, "applyEasing")).toHaveLength(0);
	});

	it("Space+left-drag pans and does not apply the curve", async () => {
		const { canvas, host } = renderEasing();

		fireEvent.keyDown(window, { code: "Space" });
		fireEvent.pointerDown(canvas, {
			button: 0,
			clientX: 100,
			clientY: 100,
		});
		fireEvent.pointerMove(canvas, {
			button: 0,
			clientX: 160,
			clientY: 160,
		});
		fireEvent.pointerUp(canvas, {
			button: 0,
			clientX: 160,
			clientY: 160,
		});
		fireEvent.keyUp(window, { code: "Space" });

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(hostCalls(host, "applyEasing")).toHaveLength(0);
	});

	it("abbreviates the mode labels when the toolbar is narrow", () => {
		const widthSpy = vi
			.spyOn(Element.prototype, "clientWidth", "get")
			.mockReturnValue(120);
		const rectSpy = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockReturnValue({
				width: 300,
				height: 0,
				top: 0,
				left: 0,
				right: 300,
				bottom: 0,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});
		const { container } = renderEasing();
		const buttons = [
			...container.querySelectorAll<HTMLButtonElement>(
				"[role='toolbar'] button",
			),
		];
		expect(buttons.map((button) => button.textContent)).toEqual([
			"C",
			"B",
			"E",
		]);
		expect(buttons[0].getAttribute("title")).toBe("Curve");
		widthSpy.mockRestore();
		rectSpy.mockRestore();
	});
});
