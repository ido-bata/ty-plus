/**
 * @vitest-environment jsdom
 *
 * Anchor Point widget button onClick regression (bug S159 + S955).
 *
 * The widget exposes a 3×3 grid of position buttons. Each click must:
 *   1. Update the local visual highlight (React state).
 *   2. Dispatch the matching ExtendScript to After Effects via the CEP bridge.
 *
 * Historically the onClick only did #1, so left-clicks changed the highlight
 * but never executed the anchor script. The right-click context menu worked
 * because it dispatched a `ty-plus:anchor-point-context-menu` event that the
 * widget's useEffect listener handled. This test pins the direct-click path.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRenderProps } from "@/function/widget/define";
import { AnchorPointWidget } from "./Component";

const baseProps = {
	layout: { id: "test-id", cols: 2, rows: 2 },
	state: {},
	grid: {},
	widthPx: 200,
	widgetInstanceId: "test-id",
} as unknown as WidgetRenderProps;

type CepWindow = Window & {
	__adobe_cep__?: { evalScript?: ReturnType<typeof vi.fn> };
};

const setEvalScript = (fn: ReturnType<typeof vi.fn>): void => {
	(window as CepWindow).__adobe_cep__ = {
		evalScript: fn,
		getHostEnvironment: () => ({ appName: "AEFT" }),
		getSystemPath: () => "",
		dispatchEvent: () => undefined,
	};
};

const clearEvalScript = (): void => {
	(window as CepWindow).__adobe_cep__ = undefined;
};

describe("AnchorPointWidget button onClick", () => {
	let mockEvalScript: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockEvalScript = vi.fn();
		setEvalScript(mockEvalScript);
	});

	afterEach(() => {
		cleanup();
		clearEvalScript();
	});

	it("dispatches the top-left anchor script to evalScript on direct button click", () => {
		const { getByTitle } = render(<AnchorPointWidget {...baseProps} />);
		fireEvent.click(getByTitle("top-left"));
		expect(mockEvalScript).toHaveBeenCalledTimes(1);
		const script = mockEvalScript.mock.calls[0]?.[0];
		expect(typeof script).toBe("string");
		expect(script).toContain('var POS = "top-left"');
	});

	it("dispatches the center anchor script to evalScript on direct button click", () => {
		const { getByTitle } = render(<AnchorPointWidget {...baseProps} />);
		fireEvent.click(getByTitle("center"));
		expect(mockEvalScript).toHaveBeenCalledTimes(1);
		const script = mockEvalScript.mock.calls[0]?.[0];
		expect(script).toContain('var POS = "center"');
	});

	it("dispatches the bottom-right anchor script to evalScript on direct button click", () => {
		const { getByTitle } = render(<AnchorPointWidget {...baseProps} />);
		fireEvent.click(getByTitle("bottom-right"));
		expect(mockEvalScript).toHaveBeenCalledTimes(1);
		const script = mockEvalScript.mock.calls[0]?.[0];
		expect(script).toContain('var POS = "bottom-right"');
	});

	it("dispatches one script per click (no double-firing from the workspace handler)", () => {
		const { getByTitle } = render(<AnchorPointWidget {...baseProps} />);
		fireEvent.click(getByTitle("top-center"));
		expect(mockEvalScript).toHaveBeenCalledTimes(1);
	});
});
