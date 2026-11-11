/**
 * @vitest-environment jsdom
 */

import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCardZoom } from "./useCardZoom";

describe("useCardZoom", () => {
	it("changes the card size for Ctrl+wheel and consumes the event", () => {
		const { result } = renderHook(() => {
			const zoom = useCardZoom();
			return {
				cardSize: zoom.cardSize,
				element: (
					<button data-testid="panel" onWheel={zoom.onWheel} type="button" />
				),
			};
		});
		const { getByTestId } = render(result.current.element);
		const panel = getByTestId("panel");
		panel.focus();

		const event = new WheelEvent("wheel", {
			ctrlKey: true,
			deltaY: -1,
			bubbles: true,
			cancelable: true,
		});
		act(() => fireEvent(panel, event));

		expect(result.current.cardSize).toBe(384);
	});
});
