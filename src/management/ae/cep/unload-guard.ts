/**
 * Surface unload guard (Issue #71).
 *
 * CEPHtmlEngine's Node-integrated renderer can SIGSEGV inside
 * `node::task_queue::EnqueueMicrotask` when the V8 context is torn down
 * while microtasks are still being enqueued. A minimal control extension
 * reproduced the same crash signature, and clearing every pending timer on
 * `pagehide`/`unload` dropped the reproduction rate to zero — the steady
 * state of timer-driven microtask enqueues is what races the teardown.
 *
 * This module wraps the window timer APIs so every handle a surface
 * schedules is tracked, then clears the whole set when the surface starts
 * unloading. It also exposes an unload-listener registry so subsystems can
 * stop their own work cooperatively, and `isSurfaceUnloading()` so late
 * async continuations can bail out instead of enqueueing more work into a
 * dying context.
 *
 * The guard must be installed before any other module schedules timers, so
 * each CEP entry shim imports it first.
 */

type TimeoutCallback = (...args: unknown[]) => void;
type TimeoutHandler = TimeoutCallback | string;

const pendingTimeouts = new Set<number>();
const pendingAnimationFrames = new Set<number>();
const unloadListeners = new Set<() => void>();

let installed = false;
let unloading = false;

/**
 * True once the surface has started tearing down (`pagehide`/`unload`
 * fired). Async continuations should check this before scheduling
 * follow-up work.
 */
export const isSurfaceUnloading = (): boolean => unloading;

/**
 * Register a callback that runs once when the surface begins unloading.
 * Returns an unsubscribe function. Callbacks are best-effort: a throwing
 * listener does not prevent the remaining listeners or the timer sweep.
 */
export const onSurfaceUnload = (listener: () => void): (() => void) => {
	if (unloading) {
		return () => {};
	}
	unloadListeners.add(listener);
	return () => {
		unloadListeners.delete(listener);
	};
};

const sweepPendingTimers = (
	clearTimeoutFn: (id: number) => void,
	clearIntervalFn: (id: number) => void,
	cancelAnimationFrameFn: ((id: number) => void) | undefined,
): void => {
	for (const id of pendingTimeouts) {
		try {
			clearTimeoutFn(id);
		} catch {
			/* best effort during teardown */
		}
		try {
			clearIntervalFn(id);
		} catch {
			/* best effort during teardown */
		}
	}
	pendingTimeouts.clear();
	if (cancelAnimationFrameFn) {
		for (const id of pendingAnimationFrames) {
			try {
				cancelAnimationFrameFn(id);
			} catch {
				/* best effort during teardown */
			}
		}
	}
	pendingAnimationFrames.clear();
	for (const listener of unloadListeners) {
		try {
			listener();
		} catch {
			/* best effort during teardown */
		}
	}
	unloadListeners.clear();
};

type SetTimeoutFn = (
	handler: TimeoutHandler,
	timeout?: number,
	...args: unknown[]
) => number;
type SetIntervalFn = SetTimeoutFn;
type ClearFn = (id?: number) => void;

/**
 * Install the guard on the given window. Idempotent: only the first call
 * patches the timer APIs.
 */
export const installUnloadGuard = (win: Window): void => {
	if (installed || typeof win === "undefined") return;
	installed = true;

	const originalSetTimeout = win.setTimeout.bind(win) as SetTimeoutFn;
	const originalClearTimeout = win.clearTimeout.bind(win) as ClearFn;
	const originalSetInterval = win.setInterval.bind(win) as SetIntervalFn;
	const originalClearInterval = win.clearInterval.bind(win) as ClearFn;
	const originalRequestAnimationFrame =
		typeof win.requestAnimationFrame === "function"
			? (win.requestAnimationFrame.bind(win) as (
					callback: FrameRequestCallback,
				) => number)
			: undefined;
	const originalCancelAnimationFrame =
		typeof win.cancelAnimationFrame === "function"
			? (win.cancelAnimationFrame.bind(win) as (id: number) => void)
			: undefined;
	const originalQueueMicrotask =
		typeof win.queueMicrotask === "function"
			? (win.queueMicrotask.bind(win) as (callback: () => void) => void)
			: undefined;

	win.setTimeout = ((
		handler: TimeoutHandler,
		timeout?: number,
		...args: unknown[]
	): number => {
		// Once teardown has begun the context is dying: scheduling more work
		// only feeds the microtask race this guard exists to avoid.
		if (unloading) return 0;
		let id = 0;
		if (typeof handler === "function") {
			id = originalSetTimeout(
				(...cbArgs: unknown[]) => {
					pendingTimeouts.delete(id);
					if (unloading) return;
					// Native timers invoke callbacks with the window as `this`;
					// preserve the receiver for strict-mode handlers.
					handler.apply(win, cbArgs);
				},
				timeout,
				...args,
			);
		} else {
			// String handlers are not used in this codebase; schedule them
			// unwrapped and track the id without auto-removal.
			id = originalSetTimeout(handler, timeout, ...args);
		}
		pendingTimeouts.add(id);
		return id;
	}) as typeof win.setTimeout;

	win.setInterval = ((
		handler: TimeoutHandler,
		timeout?: number,
		...args: unknown[]
	): number => {
		if (unloading) return 0;
		const id = originalSetInterval(
			typeof handler === "function"
				? (...cbArgs: unknown[]) => {
						if (unloading) return;
						handler.apply(win, cbArgs);
					}
				: handler,
			timeout,
			...args,
		);
		pendingTimeouts.add(id);
		return id;
	}) as typeof win.setInterval;

	win.clearTimeout = ((id?: number): void => {
		if (id !== undefined) pendingTimeouts.delete(id);
		originalClearTimeout(id);
	}) as typeof win.clearTimeout;

	win.clearInterval = ((id?: number): void => {
		if (id !== undefined) pendingTimeouts.delete(id);
		originalClearInterval(id);
	}) as typeof win.clearInterval;

	if (originalRequestAnimationFrame) {
		win.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
			if (unloading) return 0;
			let id = 0;
			id = originalRequestAnimationFrame((time) => {
				pendingAnimationFrames.delete(id);
				if (unloading) return;
				callback.call(win, time);
			});
			pendingAnimationFrames.add(id);
			return id;
		}) as typeof win.requestAnimationFrame;
	}

	if (originalCancelAnimationFrame) {
		win.cancelAnimationFrame = ((id: number): void => {
			pendingAnimationFrames.delete(id);
			originalCancelAnimationFrame(id);
		}) as typeof win.cancelAnimationFrame;
	}

	if (originalQueueMicrotask) {
		win.queueMicrotask = ((callback: () => void): void => {
			if (unloading) return;
			originalQueueMicrotask(callback);
		}) as typeof win.queueMicrotask;
	}

	const teardown = (): void => {
		if (unloading) return;
		unloading = true;
		sweepPendingTimers(
			(id) => originalClearTimeout(id),
			(id) => originalClearInterval(id),
			originalCancelAnimationFrame,
		);
	};

	// `pagehide` is the last reliable signal before the context is destroyed.
	// A persisted pagehide means the page enters the back/forward cache and
	// can be restored intact, so tearing down there would brick a live
	// surface. `beforeunload` is deliberately not used: it can be cancelled
	// and fires too early to matter for the teardown race. `unload` is the
	// fallback for hosts that skip `pagehide`.
	win.addEventListener("pagehide", (event) => {
		if ((event as PageTransitionEvent).persisted) return;
		teardown();
	});
	win.addEventListener("unload", teardown);
};

/** Test-only: restore the pre-install state in the current realm. */
export const __resetUnloadGuardForTests = (): void => {
	installed = false;
	unloading = false;
	pendingTimeouts.clear();
	pendingAnimationFrames.clear();
	unloadListeners.clear();
};
