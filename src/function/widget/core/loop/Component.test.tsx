/**
 * @vitest-environment jsdom
 *
 * Loop widget contract: the editor applies through the host `applyLoopEasing`
 * command (with a cycle count) and never through `applyEasing`.
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RuntimeProvider } from "@/function/widget/runtime-context";
import type { Layout } from "@/management/workspace/layout/grid-document";
import { LoopWidget } from "./Component";

const layout = {
	id: "loop-test-1",
	widgetType: "loop",
	x: 0,
	y: 0,
	width: 4,
	height: 5,
} as unknown as Layout;

const host = vi.fn(async (method: string) => ({
	value:
		method === "getEasingSelectionCount"
			? { pairs: 2 }
			: method === "getLabelColorNames"
				? { names: {} }
				: {},
}));

const renderLoop = () => {
	const utils = render(
		<RuntimeProvider
			value={{
				host: host as never,
				activeWidgetInstanceId: null,
				setActiveWidgetInstanceId: () => {},
			}}
		>
			<LoopWidget layout={layout} />
		</RuntimeProvider>,
	);
	const canvas = utils.container.querySelector<HTMLCanvasElement>(
		"[data-ws-easing-editor-canvas]",
	);
	if (!canvas) throw new Error("loop canvas not found");
	return { ...utils, canvas };
};

const callsTo = (method: string) =>
	host.mock.calls.filter((call) => call[0] === method);

describe("LoopWidget", () => {
	beforeAll(() => {
		(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
		globalThis.requestAnimationFrame = (() =>
			0) as typeof requestAnimationFrame;
		globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
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
		host.mockClear();
	});

	it("applies the loop through applyLoopEasing with a cycle count", async () => {
		const { canvas } = renderLoop();
		fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
		fireEvent.pointerMove(canvas, { button: 0, clientX: 140, clientY: 140 });
		fireEvent.pointerUp(canvas, { button: 0, clientX: 140, clientY: 140 });

		await waitFor(() => {
			expect(callsTo("applyLoopEasing").length).toBeGreaterThan(0);
		});
		expect(callsTo("applyEasing")).toHaveLength(0);
		const args = (
			callsTo("applyLoopEasing")[0] as unknown as [
				string,
				{ loopCount?: number }[],
			]
		)[1];
		expect(args[0].loopCount).toBeGreaterThanOrEqual(2);
	});
});
