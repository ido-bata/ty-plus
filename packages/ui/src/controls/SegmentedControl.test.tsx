/**
 * SegmentedControl contract (issue #723):
 *
 * - The strip never wraps — `flex-wrap: nowrap` plus `overflow-x: auto`
 *   is enforced by the shared `segmentedStripClass` styles.
 * - When every option provides a `compactLabel`, the control measures the
 *   strip with off-screen twin strips and swaps to the compact content
 *   once the full labels no longer fit on one row; it swaps back when
 *   the container grows again.
 * - Measurement twins are `<span>`s inside an `aria-hidden` clip host, so
 *   they never show up as buttons to role queries or `querySelectorAll`.
 *
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./SegmentedControl";

const LONG_OPTIONS = [
	{ value: "curve", label: "Comfortable curve", compactLabel: "Cv" },
	{ value: "bounce", label: "Springy bounce", compactLabel: "Bo" },
	{ value: "elastic", label: "Wobbly elastic", compactLabel: "El" },
];

class ResizeObserverStub {
	static instances: ResizeObserverStub[] = [];
	callback: ResizeObserverCallback;
	observed: Element[] = [];

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		ResizeObserverStub.instances.push(this);
	}

	observe(target: Element): void {
		this.observed.push(target);
	}
	unobserve(): void {}
	disconnect(): void {}
}

const setClientWidth = (el: Element, width: number): void => {
	Object.defineProperty(el, "clientWidth", {
		value: width,
		configurable: true,
	});
};

/** Fire the captured ResizeObserver callback inside `act`. */
const notifyResize = (): void => {
	const observer = ResizeObserverStub.instances.at(-1);
	if (!observer) throw new Error("ResizeObserver was not created");
	act(() => {
		observer.callback(
			observer.observed.map(
				(target) =>
					({
						target,
						contentRect: target.getBoundingClientRect(),
					}) as ResizeObserverEntry,
			),
			observer as unknown as ResizeObserver,
		);
	});
};

const stripOf = (container: HTMLElement): HTMLElement =>
	container.querySelector<HTMLElement>('[role="toolbar"]')!;

const measureStripsOf = (container: HTMLElement): HTMLElement[] =>
	Array.from(
		container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > div'),
	);

beforeEach(() => {
	ResizeObserverStub.instances = [];
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("SegmentedControl", () => {
	it("renders one button per option and reports changes", () => {
		const onChange = vi.fn();
		render(
			<SegmentedControl
				options={[
					{ value: "a", label: "Alpha" },
					{ value: "b", label: "Beta" },
				]}
				value="a"
				onChange={onChange}
			/>,
		);
		expect(screen.getAllByRole("button")).toHaveLength(2);
		screen.getByRole("button", { name: "Beta" }).click();
		expect(onChange).toHaveBeenCalledWith("b");
	});

	it("does not render measurement twins without compact labels", () => {
		const { container } = render(
			<SegmentedControl
				options={[
					{ value: "a", label: "Alpha" },
					{ value: "b", label: "Beta" },
				]}
				value="a"
				onChange={() => undefined}
			/>,
		);
		// No off-screen measurement strips and no extra span "buttons".
		expect(container.querySelectorAll("span")).toHaveLength(0);
		expect(measureStripsOf(container)).toHaveLength(0);
	});

	it("switches to compact labels when full labels overflow, and back", () => {
		const { container } = render(
			<SegmentedControl
				options={LONG_OPTIONS}
				value="curve"
				onChange={() => undefined}
			/>,
		);
		const strip = stripOf(container);
		const [fullMeasure, compactMeasure] = measureStripsOf(container);
		expect(fullMeasure).toBeDefined();
		expect(compactMeasure).toBeDefined();

		// Narrow container: full labels need 300px, compact need 90px,
		// only 120px are available -> compact mode.
		setClientWidth(strip, 120);
		setClientWidth(fullMeasure, 300);
		setClientWidth(compactMeasure, 90);
		notifyResize();

		const buttons = screen.getAllByRole("button");
		expect(buttons.map((b) => b.textContent)).toEqual(["Cv", "Bo", "El"]);
		// The accessible name stays the full label.
		expect(
			screen.getByRole("button", { name: "Comfortable curve" }),
		).toBeTruthy();
		// Full label is exposed as the hover title while compact.
		expect(
			screen
				.getByRole("button", { name: "Comfortable curve" })
				.getAttribute("title"),
		).toBe("Comfortable curve");

		// Container grows: full labels fit again -> full labels return.
		setClientWidth(strip, 320);
		notifyResize();
		expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
			"Comfortable curve",
			"Springy bounce",
			"Wobbly elastic",
		]);
	});

	it("keeps full labels when compact labels would be wider", () => {
		const { container } = render(
			<SegmentedControl
				options={[
					{
						value: "a",
						label: "Ab",
						compactLabel: "A much longer compact label",
					},
				]}
				value="a"
				onChange={() => undefined}
			/>,
		);
		const strip = stripOf(container);
		const [fullMeasure, compactMeasure] = measureStripsOf(container);
		setClientWidth(strip, 30);
		setClientWidth(fullMeasure, 40);
		setClientWidth(compactMeasure, 200);
		notifyResize();
		expect(screen.getByRole("button").textContent).toBe("Ab");
	});
});
