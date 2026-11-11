import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The transport's `spawnProcess()` calls `node:child_process.spawn()`. If
 * the test exercises that code path without mocking the module, vitest's
 * per-test-file isolate keeps the worker alive waiting for the
 * child-process handle to close — which never happens because
 * `/bin/test-runtime` does not exist, so the spawn emits `error`
 * asynchronously while the FDs stay open until GC. The fix is to mock
 * `node:child_process` with inert stand-ins that synchronously resolve
 * `connect()`.
 *
 * The mock uses only the `node:events` builtin (vitest hoists the
 * `vi.mock(...)` factory and runs it before any top-level imports, so
 * pulling additional builtins into the factory triggers TDZ errors).
 */
vi.mock("node:child_process", async () => {
	const events = await import("node:events");

	class FakeStdio extends events.EventEmitter {
		write(
			_chunk: unknown,
			_encoding?: BufferEncoding | ((err?: Error | null) => void),
			callback?: (err?: Error | null) => void,
		): boolean {
			if (typeof _encoding === "function") {
				(_encoding as () => void)();
				return true;
			}
			callback?.(null);
			return true;
		}
		end(): void {}
		pause(): this {
			return this;
		}
		resume(): this {
			return this;
		}
		setEncoding(): this {
			return this;
		}
	}

	class FakeChildProcess extends events.EventEmitter {
		stdin = new FakeStdio();
		stdout = new FakeStdio();
		stderr = new FakeStdio();
		pid = 99999;
		killed = false;
		kill(): boolean {
			this.killed = true;
			return true;
		}
	}

	return {
		spawn: vi.fn(() => new FakeChildProcess()),
		ChildProcess: FakeChildProcess,
	};
});

/**
 * Stand-in stdio used only by the error-path test below. Mirrors the shape
 * of `FakeStdio` defined inside the `vi.mock` factory so the production
 * code can call `proc.stdout?.on("data", ...)` without accessing a property
 * that does not exist on the erroring fake.
 */
class ErroringFakeStdio extends EventEmitter {
	write(
		_chunk: unknown,
		_encoding?: BufferEncoding | ((err?: Error | null) => void),
		callback?: (err?: Error | null) => void,
	): boolean {
		if (typeof _encoding === "function") {
			(_encoding as () => void)();
			return true;
		}
		callback?.(null);
		return true;
	}
	end(): void {}
	pause(): this {
		return this;
	}
	resume(): this {
		return this;
	}
	setEncoding(): this {
		return this;
	}
}

/**
 * A `FakeChildProcess` that synchronously emits `error` the instant the
 * production code attaches an `error` listener via `proc.on("error", ...)`.
 *
 * The production `spawnProcess()` body is fully synchronous between
 * `proc.on("error", handler)` and the trailing `resolve()`. `error` has to
 * fire in that exact window for `reject(error)` to actually reject the
 * promise — `process.nextTick` / `queueMicrotask` / `setImmediate` all land
 * after the executor returns, by which time `resolve()` has already settled
 * the promise as fulfilled and the rejection becomes a no-op (state would
 * then incorrectly transition to `connected`). Overriding `on()` is the only
 * clean way to keep the failure path reachable without changing the default
 * mock.
 */
class ErroringFakeChildProcess extends EventEmitter {
	stdin = new ErroringFakeStdio();
	stdout = new ErroringFakeStdio();
	stderr = new ErroringFakeStdio();
	pid = 99999;
	killed = false;

	on(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
		super.on(eventName, listener);
		if (eventName === "error") {
			super.emit(
				"error",
				new Error("spawn failed: spawn /bin/test-runtime ENOENT"),
			);
		}
		return this;
	}

	kill(): boolean {
		this.killed = true;
		return true;
	}
}

import {
	type FrameCodec,
	type RuntimeSpawnConfig,
	RuntimeTransport,
} from "./transport";

describe("RuntimeTransport", () => {
	let transport: RuntimeTransport;
	let mockCodec: FrameCodec;
	let mockConfig: RuntimeSpawnConfig;

	beforeEach(() => {
		mockCodec = {
			encode: vi.fn((msg) => JSON.stringify(msg)),
			decode: vi.fn((data) => JSON.parse(data)),
		};
		mockConfig = {
			executablePath: "/bin/test-runtime",
			spawnTimeout: 5000,
		};
	});

	afterEach(() => {
		transport?.disconnect();
	});

	it("starts in disconnected state", () => {
		transport = new RuntimeTransport(mockConfig, mockCodec);
		expect(transport.state).toBe("disconnected");
	});

	it("emits state change on connect", async () => {
		transport = new RuntimeTransport(mockConfig, mockCodec);
		const stateChanges: string[] = [];
		transport.onStateChange((state) => stateChanges.push(state));

		await transport.connect();

		expect(stateChanges).toContain("connecting");
		expect(stateChanges).toContain("connected");
	});

	it("emits state change on disconnect", async () => {
		transport = new RuntimeTransport(mockConfig, mockCodec);
		const stateChanges: string[] = [];
		transport.onStateChange((state) => stateChanges.push(state));

		await transport.connect();
		await transport.disconnect();
		expect(stateChanges).toContain("disconnecting");
		expect(stateChanges).toContain("disconnected");
	});

	it("rejects send when not connected", async () => {
		transport = new RuntimeTransport(mockConfig, mockCodec);
		await expect(transport.send("test")).rejects.toThrow("not connected");
	});

	it("rejects request when not connected", async () => {
		transport = new RuntimeTransport(mockConfig, mockCodec);
		const method = { name: "test.method" };
		await expect(transport.request(method, {})).rejects.toThrow(
			"not connected",
		);
	});

	it("registers and unregisters frame listeners", () => {
		transport = new RuntimeTransport(mockConfig, mockCodec);
		const listener = vi.fn();
		const unsubscribe = transport.onFrame(listener);

		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("registers and unregisters state listeners", () => {
		transport = new RuntimeTransport(mockConfig, mockCodec);
		const listener = vi.fn();
		const unsubscribe = transport.onStateChange(listener);

		unsubscribe();
	});

	it("transitions to failed and rejects connect when spawn emits error", async () => {
		vi.mocked(spawn).mockImplementationOnce(
			() =>
				new ErroringFakeChildProcess() as unknown as ReturnType<typeof spawn>,
		);

		transport = new RuntimeTransport(mockConfig, mockCodec);
		const stateChanges: string[] = [];
		transport.onStateChange((state) => stateChanges.push(state));

		await expect(transport.connect()).rejects.toThrow(
			/spawn failed: spawn \/bin\/test-runtime ENOENT/,
		);

		expect(transport.state).toBe("failed");
		expect(stateChanges).toContain("connecting");
		expect(stateChanges).toContain("failed");
		// "connected" must not appear: if the error fires after `resolve()`
		// settles the inner promise, the rejection becomes a no-op and the
		// outer `await` would resolve into `setState("connected")`. Pin the
		// negative so a regression that re-introduces that race is caught.
		expect(stateChanges).not.toContain("connected");
	});
});
