/**
 * Options for a request with deadline and cancellation support.
 */
export interface RequestOptions {
	/** Timeout in milliseconds. */
	readonly timeout?: number;
	/** AbortSignal for cancellation. */
	readonly signal?: AbortSignal;
}

/**
 * Error thrown when a request is cancelled.
 */
export class RequestCancelledError extends Error {
	constructor(requestId: string) {
		super(`request ${requestId} was cancelled`);
		this.name = "RequestCancelledError";
	}
}

/**
 * Error thrown when a request times out.
 */
export class RequestTimeoutError extends Error {
	constructor(requestId: string, timeoutMs: number) {
		super(`request ${requestId} timed out after ${timeoutMs}ms`);
		this.name = "RequestTimeoutError";
	}
}

/**
 * Manages deadlines and cancellation for pending requests.
 */
export class RequestCancellation {
	private readonly abortControllers = new Map<string, AbortController>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly callbacks = new Map<string, (requestId: string) => void>();

	/**
	 * Registers a request with optional timeout and signal.
	 *
	 * @returns A cleanup function to remove the registration.
	 */
	register(
		requestId: string,
		timeout?: number,
		signal?: AbortSignal,
		onCancel?: (requestId: string) => void,
	): () => void {
		const controller = new AbortController();
		this.abortControllers.set(requestId, controller);

		if (onCancel) {
			this.callbacks.set(requestId, onCancel);
		}

		// Handle external signal
		if (signal) {
			if (signal.aborted) {
				controller.abort();
				onCancel?.(requestId);
			} else {
				signal.addEventListener(
					"abort",
					() => {
						controller.abort();
						onCancel?.(requestId);
					},
					{ once: true },
				);
			}
		}

		// Handle timeout
		if (timeout && timeout > 0) {
			const timer = setTimeout(() => {
				controller.abort();
				onCancel?.(requestId);
			}, timeout);
			this.timers.set(requestId, timer);
		}

		return () => this.cleanup(requestId);
	}

	/**
	 * Checks if a request has been cancelled.
	 */
	isCancelled(requestId: string): boolean {
		const controller = this.abortControllers.get(requestId);
		return controller?.signal.aborted ?? false;
	}

	/**
	 * Gets the AbortSignal for a request.
	 */
	getSignal(requestId: string): AbortSignal | undefined {
		return this.abortControllers.get(requestId)?.signal;
	}

	/**
	 * Manually cancels a request.
	 */
	cancel(requestId: string): void {
		const controller = this.abortControllers.get(requestId);
		if (controller) {
			controller.abort();
			const callback = this.callbacks.get(requestId);
			callback?.(requestId);
		}
	}

	/**
	 * Cleans up a request's resources.
	 */
	private cleanup(requestId: string): void {
		const timer = this.timers.get(requestId);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(requestId);
		}
		this.abortControllers.delete(requestId);
		this.callbacks.delete(requestId);
	}

	/**
	 * Cleans up all resources.
	 */
	clear(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		this.abortControllers.clear();
		this.callbacks.clear();
	}
}
