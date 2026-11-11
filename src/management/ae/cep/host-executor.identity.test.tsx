// @vitest-environment happy-dom

import { act, render } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";

import {
	RuntimeProvider,
	useWidgetRuntime,
} from "@/function/widget/runtime-context";
import { createCepHostExecutor } from "./host-executor";

/**
 * Widgets put `host` straight into an effect dependency array, so
 * the factory's return identity *is* the effect's trigger. `useWorkspaceRuntime`
 * builds the caller inside the render body and `Main` wraps it in a fresh
 * `{ host, … }` object on every render. This harness reproduces exactly that
 * wiring, so a regression in either half shows up here.
 */

const makeWindow = (): Window => ({}) as unknown as Window;

let effectRuns = 0;
let observedHost: unknown = null;
const seenValues = new Set<unknown>();
const seenHosts = new Set<unknown>();

/** Stands in for align / easing: one effect keyed on `host`. */
const Widget = (): null => {
	const { host } = useWidgetRuntime();
	useEffect(() => {
		observedHost = host;
		effectRuns += 1;
	}, [host]);
	return null;
};

/** Builds the provider the way `Main.tsx` does: a new `value` every render. */
const Harness = ({ win, bump }: { win: Window; bump: number }) => {
	const host = createCepHostExecutor(win, "after-effects");
	const [picks, setPicks] = useState(0);
	const value = {
		host,
		activeWidgetInstanceId: picks > 0 ? "widget-1" : null,
		setActiveWidgetInstanceId: () => {},
	};
	seenValues.add(value);
	seenHosts.add(host);
	// A state update alongside the re-render, as `setActiveWidgetInstanceId`
	// does when a widget is picked.
	useEffect(() => {
		setPicks(bump);
	}, [bump]);
	return (
		<RuntimeProvider value={value}>
			<Widget />
		</RuntimeProvider>
	);
};

describe("caller identity", () => {
	it("hands out one caller per window and host", () => {
		const win = makeWindow();
		expect(createCepHostExecutor(win, "after-effects")).toBe(
			createCepHostExecutor(win, "after-effects"),
		);
		expect(createCepHostExecutor(makeWindow(), "after-effects")).not.toBe(
			createCepHostExecutor(win, "after-effects"),
		);
	});

	it("keeps a widget effect from re-firing across provider re-renders", () => {
		effectRuns = 0;
		seenValues.clear();
		seenHosts.clear();
		const win = makeWindow();

		const { rerender } = render(<Harness win={win} bump={0} />);
		for (let frame = 1; frame <= 5; frame += 1) {
			act(() => {
				rerender(<Harness win={win} bump={frame} />);
			});
		}

		// The premise of the test: the provider really does hand out a new
		// `value` object on every render, so nothing here could have
		// stabilized identity by wrapping the provider instead.
		expect(seenValues.size).toBeGreaterThan(1);
		// …and yet the dependency the widget effect watches never changes.
		expect(seenHosts.size).toBe(1);
		expect(effectRuns).toBe(1);
		expect(observedHost).toBe(createCepHostExecutor(win, "after-effects"));
	});
});
