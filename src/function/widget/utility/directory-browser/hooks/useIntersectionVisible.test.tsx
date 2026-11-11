/**
 * @vitest-environment jsdom
 *
 * `useIntersectionVisible` is the IO-gated hook that backs the
 * lazy-thumbnail pipeline in `ThumbnailTile` (THB-PERF-003 lazy).
 * Contract guarantees exercised here:
 *
 * 1. **Initial state is `false`** — the hook is intentionally lazy;
 *    the caller stays idle until the observer confirms the element
 *    is on-screen.
 * 2. **Intersection flips to `true`** — once the observed element
 *    crosses into the viewport (or the `rootMargin`), the boolean
 *    flips `true` and the caller can start work.
 * 3. **Scrolling out flips to `false`** — leaving the viewport flips
 *    the boolean back to `false` so the caller can suspend work.
 * 4. **Element swap reattaches the observer** — replacing the
 *    observed DOM node (e.g. swapping a placeholder for the real
 *    thumbnail container) detaches from the old node and reattaches
 *    to the new one.
 * 5. **Missing `IntersectionObserver` falls back to `true`** — when
 *    the global is undefined (true SSR / hostile embed), the hook
 *    reports visible so the caller does not stay idle forever.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIntersectionVisible } from "./useIntersectionVisible";

type Callback<T> = (value: T) => void;

type ObserverEntry = {
	isIntersecting: boolean;
	target: Element;
};

type ObserverLike = {
	observe: (target: Element) => void;
	unobserve: (target: Element) => void;
	disconnect: () => void;
	takeRecords: () => IntersectionObserverEntry[];
	readonly root: Element | Document | null;
	readonly rootMargin: string;
	readonly thresholds: ReadonlyArray<number>;
};

type Observable = {
	listeners: Set<Callback<ObserverEntry[]>>;
	observed: Set<Element>;
	observer: ObserverLike | null;
};

function createIntersectionObserverMock(): {
	instances: Observable[];
	trigger: (index: number, entries: ObserverEntry[]) => void;
} {
	const instances: Observable[] = [];
	const Ctor = function (
		this: ObserverLike,
		cb: Callback<ObserverEntry[]>,
		init?: { rootMargin?: string },
	) {
		const observable: Observable = {
			listeners: new Set<Callback<ObserverEntry[]>>([cb]),
			observed: new Set<Element>(),
			observer: null,
		};
		observable.observer = {
			observe: (target: Element) => {
				observable.observed.add(target);
			},
			unobserve: (target: Element) => {
				observable.observed.delete(target);
			},
			disconnect: () => {
				observable.observed.clear();
			},
			takeRecords: () => [],
			root: null,
			rootMargin: init?.rootMargin ?? "0px",
			thresholds: [0],
		};
		instances.push(observable);
		return observable.observer;
	} as unknown as new (
		cb: Callback<ObserverEntry[]>,
		init?: { rootMargin?: string },
	) => ObserverLike;
	const factory = vi.fn(Ctor);
	(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
		factory as unknown as typeof IntersectionObserver;
	return {
		instances,
		trigger: (index, entries) => {
			const inst = instances[index];
			if (!inst) throw new Error(`no observer instance at index ${index}`);
			for (const cb of inst.listeners) {
				cb(entries);
			}
		},
	};
}

function restoreIntersectionObserver(): void {
	delete (globalThis as { IntersectionObserver?: unknown })
		.IntersectionObserver;
}

describe("useIntersectionVisible", () => {
	let originalObserver: unknown;

	beforeEach(() => {
		originalObserver = (globalThis as { IntersectionObserver?: unknown })
			.IntersectionObserver;
	});

	afterEach(() => {
		if (originalObserver === undefined) {
			restoreIntersectionObserver();
		} else {
			(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
				originalObserver;
		}
	});

	it("starts as false and stays false until the observer fires", () => {
		const mock = createIntersectionObserverMock();
		const { result } = renderHook(() => useIntersectionVisible("0px"));
		const [ref] = result.current;
		expect(result.current[1]).toBe(false);

		const el = document.createElement("div");
		act(() => {
			ref(el);
		});
		expect(mock.instances).toHaveLength(1);
		expect(mock.instances[0]?.observed.has(el)).toBe(true);
		expect(result.current[1]).toBe(false);
	});

	it("flips to true on intersection and back to false on scroll-out", () => {
		const mock = createIntersectionObserverMock();
		const { result } = renderHook(() => useIntersectionVisible("0px"));
		const [ref] = result.current;

		const el = document.createElement("div");
		act(() => {
			ref(el);
		});

		act(() => {
			mock.trigger(0, [{ isIntersecting: true, target: el }]);
		});
		expect(result.current[1]).toBe(true);

		act(() => {
			mock.trigger(0, [{ isIntersecting: false, target: el }]);
		});
		expect(result.current[1]).toBe(false);
	});

	it("reattaches the observer when the callback ref points to a new element", () => {
		const mock = createIntersectionObserverMock();
		const { result } = renderHook(() => useIntersectionVisible("0px"));
		const [ref] = result.current;

		const first = document.createElement("div");
		const second = document.createElement("div");
		act(() => {
			ref(first);
		});
		// First observer instance is bound to the first element.
		expect(mock.instances[0]?.observed.has(first)).toBe(true);
		expect(mock.instances[0]?.observed.has(second)).toBe(false);

		act(() => {
			ref(second);
		});
		// A second observer is created for the swapped element, and the
		// first observer has been disconnected.
		expect(mock.instances).toHaveLength(2);
		expect(mock.instances[1]?.observed.has(second)).toBe(true);
		expect(mock.instances[0]?.observed.size ?? 0).toBe(0);
	});

	it("falls back to true when IntersectionObserver is unavailable", () => {
		restoreIntersectionObserver();
		const { result } = renderHook(() => useIntersectionVisible("0px"));
		const [ref] = result.current;
		expect(result.current[1]).toBe(false);

		const el = document.createElement("div");
		act(() => {
			ref(el);
		});
		expect(result.current[1]).toBe(true);
	});
});
