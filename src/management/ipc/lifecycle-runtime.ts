/**
 * State of the runtime process.
 */
export type RuntimeState =
	| "idle"
	| "starting"
	| "running"
	| "crashed"
	| "restarting"
	| "stopped";

/**
 * Information about a runtime crash.
 */
export interface CrashInfo {
	/** When the crash occurred. */
	readonly timestamp: Date;
	/** Exit code if available. */
	readonly exitCode: number | null;
	/** Signal if killed by signal. */
	readonly signal: string | null;
	/** Error message if available. */
	readonly error?: string;
}

/**
 * Options for crash recovery.
 */
export interface CrashRecoveryOptions {
	/** Maximum number of restart attempts. */
	readonly maxRestarts?: number;
	/** Delay between restart attempts (ms). */
	readonly restartDelay?: number;
	/** Whether to allow automatic restart. */
	readonly autoRestart?: boolean;
}

/**
 * Tracks runtime process state and handles crash recovery.
 */
export class RuntimeLifecycle {
	private state: RuntimeState = "idle";
	private crashCount = 0;
	private lastCrash: CrashInfo | null = null;
	private readonly stateListeners = new Set<(state: RuntimeState) => void>();
	private readonly crashListeners = new Set<(info: CrashInfo) => void>();
	private readonly options: Required<CrashRecoveryOptions>;

	constructor(options: CrashRecoveryOptions = {}) {
		this.options = {
			maxRestarts: options.maxRestarts ?? 3,
			restartDelay: options.restartDelay ?? 1000,
			autoRestart: options.autoRestart ?? true,
		};
	}

	get currentState(): RuntimeState {
		return this.state;
	}

	get crashInfo(): CrashInfo | null {
		return this.lastCrash;
	}

	get restartsAttempted(): number {
		return this.crashCount;
	}

	/**
	 * Transitions to starting state.
	 */
	start(): void {
		if (this.state !== "idle" && this.state !== "stopped") {
			throw new Error(`cannot start from state ${this.state}`);
		}
		this.setState("starting");
	}

	/**
	 * Transitions to running state.
	 */
	running(): void {
		if (this.state !== "starting" && this.state !== "restarting") {
			throw new Error(`cannot transition to running from ${this.state}`);
		}
		this.setState("running");
	}

	/**
	 * Handles a crash event.
	 *
	 * @returns Whether an automatic restart should be attempted.
	 */
	crash(info: CrashInfo): boolean {
		this.lastCrash = info;
		this.crashCount++;

		for (const listener of this.crashListeners) {
			listener(info);
		}

		if (
			this.options.autoRestart &&
			this.crashCount <= this.options.maxRestarts
		) {
			this.setState("crashed");
			return true;
		}

		this.setState("stopped");
		return false;
	}

	/**
	 * Transitions to restarting state.
	 */
	restart(): void {
		if (this.state !== "crashed") {
			throw new Error(`cannot restart from state ${this.state}`);
		}
		this.setState("restarting");
	}

	/**
	 * Stops the runtime.
	 */
	stop(): void {
		if (this.state === "idle" || this.state === "stopped") {
			return;
		}
		this.setState("stopped");
	}

	/**
	 * Checks if the runtime can accept requests.
	 */
	canAcceptRequests(): boolean {
		return this.state === "running";
	}

	/**
	 * Checks if the runtime is in a recoverable state.
	 */
	canRecover(): boolean {
		return (
			this.state === "crashed" && this.crashCount <= this.options.maxRestarts
		);
	}

	onStateChange(listener: (state: RuntimeState) => void): () => void {
		this.stateListeners.add(listener);
		return () => {
			this.stateListeners.delete(listener);
		};
	}

	onCrash(listener: (info: CrashInfo) => void): () => void {
		this.crashListeners.add(listener);
		return () => {
			this.crashListeners.delete(listener);
		};
	}

	private setState(state: RuntimeState): void {
		if (this.state === state) {
			return;
		}
		this.state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}
}

/**
 * Tracks non-idempotent requests to prevent duplicate sends.
 */
export class NonIdempotentTracker {
	private readonly pending = new Map<
		string,
		{ timestamp: Date; method: string }
	>();
	private readonly completed = new Map<
		string,
		{ timestamp: Date; method: string }
	>();

	/**
	 * Registers a non-idempotent request.
	 *
	 * @returns Whether the request can proceed (not already pending).
	 */
	register(requestId: string, method: string): boolean {
		if (this.pending.has(requestId) || this.completed.has(requestId)) {
			return false;
		}
		this.pending.set(requestId, { timestamp: new Date(), method });
		return true;
	}

	/**
	 * Marks a request as completed.
	 */
	complete(requestId: string): void {
		const info = this.pending.get(requestId);
		if (info) {
			this.pending.delete(requestId);
			this.completed.set(requestId, info);
		}
	}

	/**
	 * Checks if a request has already been sent.
	 */
	hasBeenSent(requestId: string): boolean {
		return this.pending.has(requestId) || this.completed.has(requestId);
	}

	/**
	 * Clears all tracking data.
	 */
	clear(): void {
		this.pending.clear();
		this.completed.clear();
	}
}
