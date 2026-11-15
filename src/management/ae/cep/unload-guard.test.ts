// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
	__resetUnloadGuardForTests,
	installUnloadGuard,
	isSurfaceUnloading,
	onSurfaceUnload,
} from "./unload-guard";

type FakeWindow = {
	setTimeout: Window["setTimeout"];
	clearTimeout: Window["clearTimeout"];
	setInterval: Window["setInterval"];
	clearInterval: Window["clearInterval"];
	requestAnimationFrame?: Window["requestAnimationFrame"];
	cancelAnimationFrame?: Window["cancelAnimationFrame"];
	queueMicrotask?: Window["queueMicrotask"];
	addEventListener: Window["addEventListener"];
	removeEventListener: Window["removeEventListener"];
	dispatch: (type: string | Event) => void;
};

const makeWindow = (): FakeWindow => {
	const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
	const target = {
		setTimeout: window.setTimeout.bind(window),
		clearTimeout: window.clearTimeout.bind(window),
		setInterval: window.setInterval.bind(window),
		clearInterval: window.clearInterval.bind(window),
		requestAnimationFrame: window.requestAnimationFrame?.bind(window),
		cancelAnimationFrame: window.cancelAnimationFrame?.bind(window),
		queueMicrotask: window.queueMicrotask?.bind(window),
		addEventListener: (
			type: string,
			listener: EventListenerOrEventListenerObject,
		) => {
			let set = listeners.get(type);
			if (!set) {
				set = new Set();
				listeners.set(type, set);
			}
			set.add(listener);
		},
		removeEventListener: (
			type: string,
			listener: EventListenerOrEventListenerObject,
		) => {
			listeners.get(type)?.delete(listener);
		},
		dispatch: (type: string | Event) => {
			const event = typeof type === "string" ? new Event(type) : type;
			for (const listener of listeners.get(event.type) ?? []) {
				if (typeof listener === "function") {
					listener(event);
				} else {
					listener.handleEvent(event);
				}
			}
		},
	};
	return target as unknown as FakeWindow;
};

afterEach(() => {
	__resetUnloadGuardForTests();
	vi.useRealTimers();
});

describe("installUnloadGuard", () => {
	it("is idempotent across repeated installs", () => {
		const win = makeWindow();
		installUnloadGuard(win as unknown as Window);
		const patched = win.setTimeout;
		installUnloadGuard(win as unknown as Window);
		expect(win.setTimeout).toBe(patched);
	});

	it("tracks and fires scheduled timeouts normally", async () => {
		vi.useFakeTimers();
		const win = makeWindow();
		installUnloadGuard(win as unknown as Window);
		const spy = vi.fn();
		win.setTimeout(spy, 10);
		await vi.advanceTimersByTimeAsync(10);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("clears pending timers on pagehide so callbacks never fire", async () => {
		vi.useFakeTimers();
		const win = makeWindow();
		installUnloadGuard(win as unknown as Window);
		const spy = vi.fn();
		win.setTimeout(spy, 10);
		win.setInterval(spy, 10);
		win.dispatch("pagehide");
		expect(isSurfaceUnloading()).toBe(true);
		await vi.advanceTimersByTimeAsync(1000);
		expect(spy).not.toHaveBeenCalled();
	});

	it("runs unload listeners once and tolerates throwing listeners", () => {
		const win = makeWindow();
		installUnloadGuard(win as unknown as Window);
		const good = vi.fn();
		onSurfaceUnload(() => {
			throw new Error("boom");
		});
		onSurfaceUnload(good);
		win.dispatch("pagehide");
		win.dispatch("unload");
		expect(good).toHaveBeenCalledTimes(1);
	});

	it("ignores a persisted pagehide (bfcache) and keeps the surface alive", async () => {
		vi.useFakeTimers();
		const win = makeWindow();
		installUnloadGuard(win as unknown as Window);
		const spy = vi.fn();
		win.setInterval(spy, 10);
		const persisted = new Event("pagehide") as PageTransitionEvent;
		Object.defineProperty(persisted, "persisted", { value: true });
		win.dispatch(persisted);
		expect(isSurfaceUnloading()).toBe(false);
		await vi.advanceTimersByTimeAsync(20);
		expect(spy).toHaveBeenCalled();
	});

	it("refuses new timers and queueMicrotask after unload begins", async () => {
		vi.useFakeTimers();
		const win = makeWindow();
		installUnloadGuard(win as unknown as Window);
		win.dispatch("pagehide");
		const spy = vi.fn();
		const id = win.setTimeout(spy, 0);
		expect(id).toBe(0);
		win.queueMicrotask?.(spy);
		await vi.advanceTimersByTimeAsync(10);
		await Promise.resolve();
		expect(spy).not.toHaveBeenCalled();
	});

	it("drops queueMicrotask callbacks scheduled after unload", async () => {
		const win = makeWindow();
		installUnloadGuard(win as unknown as Window);
		const spy = vi.fn();
		win.dispatch("pagehide");
		win.queueMicrotask?.(spy);
		await new Promise((r) => setTimeout(r, 0));
		expect(spy).not.toHaveBeenCalled();
	});
});
