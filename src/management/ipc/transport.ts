import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { RuntimeFrameListener, RuntimeFrameTransport } from "./frame";
import type {
	RuntimeConnectionLifecycle,
	RuntimeConnectionListener,
	RuntimeConnectionState,
	RuntimeUnsubscribe,
} from "./lifecycle";
import type { RuntimeMethod, RuntimeRequestDispatcher } from "./request";

/**
 * Configuration for spawning the runtime process.
 */
export interface RuntimeSpawnConfig {
	/** Path to the runtime executable. */
	readonly executablePath: string;
	/** Arguments to pass to the runtime process. */
	readonly args?: readonly string[];
	/** Working directory for the runtime process. */
	readonly cwd?: string;
	/** Environment variables for the runtime process. */
	readonly env?: Record<string, string>;
	/** Timeout for spawning the process (ms). */
	readonly spawnTimeout?: number;
}

/**
 * Frame codec for encoding/decoding JSON frames over the transport.
 */
export interface FrameCodec {
	encode(message: unknown): string;
	decode(data: string): unknown;
}

/**
 * CEP Node transport that spawns and communicates with the Rust runtime.
 *
 * This transport manages the lifecycle of the runtime process and provides
 * a framed JSON transport for request/response communication.
 */
export class RuntimeTransport
	extends EventEmitter
	implements
		RuntimeConnectionLifecycle,
		RuntimeFrameTransport<string, string>,
		RuntimeRequestDispatcher
{
	private _state: RuntimeConnectionState = "disconnected";
	private process: ChildProcess | null = null;
	private readonly frameListeners = new Set<RuntimeFrameListener<string>>();
	private readonly stateListeners = new Set<RuntimeConnectionListener>();
	private readonly pendingRequests = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (reason: unknown) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private requestIdCounter = 0;
	private buffer = "";
	private readonly config: RuntimeSpawnConfig;
	private readonly codec: FrameCodec;
	private readonly requestTimeout: number;

	constructor(config: RuntimeSpawnConfig, codec: FrameCodec) {
		super();
		this.config = config;
		this.codec = codec;
		this.requestTimeout = config.spawnTimeout ?? 30000;
	}

	get state(): RuntimeConnectionState {
		return this._state;
	}

	async connect(): Promise<void> {
		if (this.state !== "disconnected" && this.state !== "failed") {
			return;
		}

		this.setState("connecting");

		try {
			await this.spawnProcess();
			this.setState("connected");
		} catch (error) {
			this.setState("failed");
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		if (this.state === "disconnected" || this.state === "disconnecting") {
			return;
		}

		this.setState("disconnecting");

		// Reject all pending requests
		for (const [id, pending] of this.pendingRequests) {
			clearTimeout(pending.timer);
			pending.reject(new Error("disconnecting"));
			this.pendingRequests.delete(id);
		}

		// Kill the process
		if (this.process) {
			try {
				this.process.kill();
			} catch {
				// Process may have already exited
			}
			this.process = null;
		}

		this.buffer = "";
		this.setState("disconnected");
	}

	onStateChange(listener: RuntimeConnectionListener): RuntimeUnsubscribe {
		this.stateListeners.add(listener);
		return () => {
			this.stateListeners.delete(listener);
		};
	}

	async send(frame: string): Promise<void> {
		if (this.state !== "connected" || !this.process?.stdin) {
			throw new Error("not connected");
		}

		const stdin = this.process.stdin;
		return new Promise((resolve, reject) => {
			stdin.write(`${frame}\n`, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	onFrame(listener: RuntimeFrameListener<string>): RuntimeUnsubscribe {
		this.frameListeners.add(listener);
		return () => {
			this.frameListeners.delete(listener);
		};
	}

	async request<Scope, Request, Response>(
		method: RuntimeMethod<Scope, Request, Response>,
		request: Request,
	): Promise<Response> {
		if (this.state !== "connected") {
			throw new Error("not connected");
		}

		const id = String(++this.requestIdCounter);
		const message = this.codec.encode({
			id,
			method: method.name,
			params: request,
		});

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`request ${method.name} timed out`));
			}, this.requestTimeout);

			this.pendingRequests.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timer,
			});

			this.send(message).catch((error) => {
				clearTimeout(timer);
				this.pendingRequests.delete(id);
				reject(error);
			});
		});
	}

	private setState(state: RuntimeConnectionState): void {
		if (this.state === state) {
			return;
		}
		this._state = state;
		for (const listener of this.stateListeners) {
			listener(state);
		}
	}

	private async spawnProcess(): Promise<void> {
		return new Promise((resolve, reject) => {
			const proc = spawn(this.config.executablePath, this.config.args ?? [], {
				cwd: this.config.cwd,
				env: this.config.env as Record<string, string>,
				stdio: ["pipe", "pipe", "pipe"],
			});

			proc.on("error", (error) => {
				this.process = null;
				reject(error);
			});

			proc.on("exit", () => {
				this.process = null;
				this.setState("disconnected");
			});

			proc.stdout?.on("data", (data: Buffer) => {
				this.handleData(data.toString());
			});

			proc.stderr?.on("data", (data: Buffer) => {
				// Log stderr for debugging
				console.error("runtime stderr:", data.toString());
			});

			this.process = proc;

			// Consider connected once process is spawned
			// The actual handshake would happen here in production
			resolve();
		});
	}

	private handleData(data: string): void {
		this.buffer += data;
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (line.trim()) {
				this.handleFrame(line);
			}
		}
	}

	private handleFrame(data: string): void {
		// Check if this is a response to a pending request
		try {
			const message = this.codec.decode(data) as Record<string, unknown>;
			const id = message.id as string | undefined;
			if (id) {
				const pending = this.pendingRequests.get(id);
				if (pending) {
					clearTimeout(pending.timer);
					this.pendingRequests.delete(id);

					if (message.error) {
						pending.reject(message.error);
					} else {
						pending.resolve(message.result);
					}
					return;
				}
			}
		} catch {
			// Not a JSON message or not a response, treat as frame
		}

		// Emit as frame for listeners
		for (const listener of this.frameListeners) {
			listener(data);
		}
	}
}
