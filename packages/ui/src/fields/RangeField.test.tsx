/**
 * RangeField contract (issue #679):
 * - the label names the control only; the paired NumberField is the single
 *   place that shows the value (no "Label 30" duplication)
 * - `unit` renders as a suffix on the numeric readout so the value keeps
 *   its meaning even without a label
 * - both controls expose descriptive aria-labels / aria-valuetext
 *
 * @vitest-environment jsdom
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RangeField } from "./RangeField";

afterEach(cleanup);

const baseProps = {
	value: 30,
	onChange: vi.fn(),
	min: 0,
	max: 100,
	step: 1,
};

describe("RangeField", () => {
	it("renders the label without duplicating the value", () => {
		const { container } = render(
			<RangeField label="Volume" unit="%" {...baseProps} />,
		);
		const label = [...container.querySelectorAll("div")].find(
			(el) => el.children.length === 0 && el.textContent === "Volume",
		);
		expect(label).toBeTruthy();
		expect(container.textContent).not.toContain("Volume 30");
	});

	it("shows the unit as a suffix on the numeric readout", () => {
		const { container } = render(
			<RangeField label="Volume" unit="%" {...baseProps} />,
		);
		const unit = container.querySelector("[data-number-field-unit]");
		expect(unit?.textContent).toBe("%");
	});

	it("keeps the value meaningful without a label", () => {
		const { container } = render(<RangeField unit="%" {...baseProps} />);
		const range = container.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		const number = container.querySelector<HTMLInputElement>(
			'input[type="number"]',
		);
		expect(range?.getAttribute("aria-label")).toBe("Range");
		expect(range?.getAttribute("aria-valuetext")).toBe("30%");
		expect(number?.getAttribute("aria-label")).toBe("Range value %");
		expect(
			container.querySelector("[data-number-field-unit]")?.textContent,
		).toBe("%");
	});

	it("names both controls from the label when present", () => {
		const { container } = render(
			<RangeField label="Opacity" unit="%" {...baseProps} />,
		);
		const range = container.querySelector<HTMLInputElement>(
			'input[type="range"]',
		);
		const number = container.querySelector<HTMLInputElement>(
			'input[type="number"]',
		);
		expect(range?.getAttribute("aria-label")).toBe("Opacity");
		expect(range?.getAttribute("aria-valuetext")).toBe("30%");
		expect(number?.getAttribute("aria-label")).toBe("Opacity value %");
	});
});
