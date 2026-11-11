import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { protocolVersion, type WireMessage } from "./generated";
import {
	type OperationWorkerArtifact,
	type OperationWorkerManifest,
	resolveOperationWorkerBinary as resolveOperationWorkerBinaryCore,
	WorkerBinaryError,
} from "./operation-worker-binary";
import {
	encodeOperationWorkerFrame,
	OperationWorkerFrameDecoder,
} from "./operation-worker-frame";
import { createNodeOperationWorkerRuntime } from "./operation-worker-node-runtime";
import {
	createOperationWorkerRunner,
	type OperationWorkerAttemptError,
	type OperationWorkerError,
	type WorkerChild,
	type WorkerLifecycleEvent,
} from "./operation-worker-runner";
import {
	acceptedFrame,
	createMacosWorkerFixture,
	createWindowsWorkerFixture,
	fakeChildWithFrames,
	finalFrame,
	invocationFixture as fixtureInvocation,
	malformedFirstFrame,
	progressFrame,
} from "./operation-worker-runner.test-fixtures";

const resolveOperationWorkerBinary = (
	input: Parameters<typeof resolveOperationWorkerBinaryCore>[0],
) =>
	resolveOperationWorkerBinaryCore(input, createNodeOperationWorkerRuntime());

const invocationFixture = {
	...fixtureInvocation,
	method: {
		...fixtureInvocation.method,
		name: "online.catalog.search",
		encode: (
			payload: { value: string },
			context: typeof fixtureInvocation.context,
		) => {
			const encoded = fixtureInvocation.method.encode(payload, context);
			if (encoded.kind !== "request") return encoded;
			return {
				...encoded,
				message: { ...encoded.message, method: "online.catalog.search" },
			};
		},
	},
};

const binary = {
	absolutePath:
		"C:/Extension/worker/versions/hash/windows/operation-worker.exe",
	sha256: "hash",
	signature: {
		algorithm: "authenticode" as const,
		value: "signature",
		certificateSha256: "c".repeat(64),
	},
};

const sha256 = (bytes: Uint8Array): string =>
	createHash("sha256").update(bytes).digest("hex");

const signatureFor = (
	algorithm: "authenticode" | "codesign",
): OperationWorkerArtifact["signature"] => ({
	algorithm,
	certificateSha256: "c".repeat(64),
	value: "signature-worker",
});

const resolveInput = async () => ({
	extensionRoot: "C:/Extension",
	manifest: {
		productVersion: "build-1",
		extensionVersion: "build-1",
		protocolVersion,
		capabilities: ["storage"],
		workers: {
			windows: {
				relativePath: binary.absolutePath,
				sha256: binary.sha256,
				signature: binary.signature,
			},
			macos: {
				relativePath: "/Extension/worker/versions/hash/macos/operation-worker",
				sha256: binary.sha256,
				signature: {
					algorithm: "codesign" as const,
					value: "signature",
					certificateSha256: "c".repeat(64),
				},
			},
		},
	},
	platform: "windows" as const,
	expectedProductVersion: "build-1",
	expectedExtensionVersion: "build-1",
	expectedProtocolVersion: protocolVersion,
	expectedCapabilities: ["storage"],
	expectedTrustMode: "release" as const,
});

const replaceEnvelope = (
	message: WireMessage,
	changes: Readonly<Record<string, unknown>>,
): WireMessage => {
	if (message.kind !== "event" && message.kind !== "response") return message;
	return {
		...message,
		message: { ...message.message, ...changes },
	} as WireMessage;
};

const runnerFor = (
	child: ReturnType<typeof fakeChildWithFrames>,
	platform: "windows" | "macos" = "windows",
) => {
	const end = child.stdin.end.bind(child.stdin);
	setTimeout(end, 0);
	return createOperationWorkerRunner({
		resolveInput,
		resolveBinary: async () => binary,
		spawnChild: () => child,
		platform,
		extensionRoot: platform === "windows" ? "C:/Extension" : "/Extension",
	});
};

const controlledChild = (
	onWrite?: (count: number, child: WorkerChild) => void,
	writeResult = true,
	killCloses = true,
) => {
	const child = new EventEmitter() as EventEmitter & {
		stdin: EventEmitter & {
			write: (chunk: Uint8Array) => boolean;
			end: () => void;
		};
		stdout: EventEmitter;
		stderr: EventEmitter;
		frames: Uint8Array[];
		killCount: number;
		ended: boolean;
	};
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const frames: Uint8Array[] = [];
	let ended = false;
	let killCount = 0;
	const stdin = Object.assign(new EventEmitter(), {
		write: (chunk: Uint8Array) => {
			frames.push(new Uint8Array(chunk));
			onWrite?.(frames.length, child as unknown as WorkerChild);
			return writeResult;
		},
		end: () => {
			ended = true;
		},
	});
	Object.assign(child, { stdin, stdout, stderr, frames });
	Object.defineProperties(child, {
		killCount: { get: () => killCount },
		ended: { get: () => ended },
		kill: {
			value: () => {
				killCount += 1;
				if (killCloses) child.emit("close", null, "SIGKILL");
				return true;
			},
		},
	});
	return child;
};

const withoutObjectHasOwn = <T>(run: () => T): T => {
	const descriptor = Object.getOwnPropertyDescriptor(Object, "hasOwn");
	Object.defineProperty(Object, "hasOwn", {
		configurable: true,
		value: undefined,
	});
	try {
		return run();
	} finally {
		if (descriptor === undefined) {
			Reflect.deleteProperty(Object, "hasOwn");
		} else {
			Object.defineProperty(Object, "hasOwn", descriptor);
		}
	}
};

describe("operation worker runner", () => {
	it("reports lifecycle without allowing observer failures to alter execution", async () => {
		const child = fakeChildWithFrames([
			acceptedFrame,
			progressFrame(0),
			finalFrame,
		]);
		const events: string[] = [];
		const result = await runnerFor(child).invoke(invocationFixture, {
			onLifecycle: (event) => {
				events.push(event.kind);
				throw new Error("observer must be isolated");
			},
		});
		expect(result).toEqual({ ok: true });
		expect(events).toEqual([
			"spawned",
			// Issue #158: the request frame leaving this side is distinct
			// from the worker's `accepted` handshake — a child that never
			// answers is visible as sent-but-not-accepted.
			"request-sent",
			"accepted",
			"response",
			"stdout_eof",
			"stderr-summary",
			"close",
		]);
	});

	it("attaches the scheduler correlation to every lifecycle event (Issue #158)", async () => {
		const child = fakeChildWithFrames([
			acceptedFrame,
			progressFrame(0),
			finalFrame,
		]);
		const correlation = {
			logicalOperationId: "job-42",
			requestId: "request-42",
			attempt: 2,
			operation: "host_thumbnail_lookup",
			sessionId: "session-42",
			idempotencyKey: "job-42",
		} as const;
		const events: WorkerLifecycleEvent[] = [];
		const result = await runnerFor(child).invoke(invocationFixture, {
			correlation,
			onLifecycle: (event) => {
				events.push(event);
			},
		});

		expect(result).toEqual({ ok: true });
		const kinds = events.map((event) => event.kind);
		// The whole point of the field log: manifest -> spawn -> request ->
		// response -> close must be attributable to ONE logical job.
		expect(kinds).toContain("spawned");
		expect(kinds).toContain("request-sent");
		expect(kinds).toContain("accepted");
		expect(kinds).toContain("response");
		expect(kinds).toContain("close");
		for (const event of events) {
			expect(event.correlation).toEqual(correlation);
		}
	});

	it("leaves correlation off the events when the scheduler supplied none", async () => {
		const child = fakeChildWithFrames([acceptedFrame, finalFrame]);
		const events: WorkerLifecycleEvent[] = [];
		await runnerFor(child).invoke(invocationFixture, {
			onLifecycle: (event) => {
				events.push(event);
			},
		});

		expect(events.length).toBeGreaterThan(0);
		for (const event of events) {
			expect(event.correlation).toBeUndefined();
		}
	});

	it("keeps stdin open and sends one cancel frame to the same child", async () => {
		const child = controlledChild((count, current: WorkerChild) => {
			if (count === 1) {
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
			}
			if (count === 2) {
				queueMicrotask(() => {
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(finalFrame),
					);
					(current.stdout as EventEmitter).emit("end");
					(current as unknown as EventEmitter).emit("close", 0, null);
				});
			}
		});
		const controller = new AbortController();
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: {
				graceMs: 100,
				forceErrorCode: "worker_forced_termination",
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await expect(promise).resolves.toEqual({ ok: true });
		expect(child.frames).toHaveLength(2);
		expect(child.ended).toBe(false);
		expect(child.killCount).toBe(0);
	});

	it("tolerates cancel write backpressure and validates one cancellation acknowledgement", async () => {
		const acknowledgement: WireMessage = {
			kind: "event",
			message: {
				protocol_version: protocolVersion,
				request_id: "request-1",
				session_id: "session-1",
				payload: {
					event: "cancellation_acknowledged",
					data: {
						target_request_id: "request-1",
						decision: "accepted",
					},
				},
			},
		};
		const child = controlledChild((count, current) => {
			if (count === 1)
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
			if (count === 2)
				queueMicrotask(() => {
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acknowledgement),
					);
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(finalFrame),
					);
					(current.stdout as EventEmitter).emit("end");
					(current as unknown as EventEmitter).emit("close", 0, null);
				});
		}, false);
		const controller = new AbortController();
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: {
				graceMs: 100,
				forceErrorCode: "worker_forced_termination",
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await expect(promise).resolves.toEqual({ ok: true });
		expect(child.killCount).toBe(0);
	});

	it("writes the request before sending cancel for a pre-aborted signal", async () => {
		const child = controlledChild((count, current) => {
			if (count === 1)
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
			if (count === 2)
				queueMicrotask(() => {
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(finalFrame),
					);
					(current.stdout as EventEmitter).emit("end");
					(current as unknown as EventEmitter).emit("close", 0, null);
				});
		});
		const controller = new AbortController();
		controller.abort();
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: {
				graceMs: 100,
				forceErrorCode: "worker_forced_termination",
			},
		});
		await expect(promise).resolves.toEqual({ ok: true });
		const decoder = new OperationWorkerFrameDecoder();
		expect(
			child.frames.flatMap((frame) =>
				decoder.push(frame).map((message) => message.kind),
			),
		).toEqual(["request", "cancel"]);
	});

	it("deduplicates repeated abort trigger callbacks into one cancel frame", async () => {
		let trigger: (() => void) | undefined;
		const signal = {
			aborted: false,
			addEventListener: (_event: string, listener: () => void) => {
				trigger = listener;
			},
			removeEventListener: () => undefined,
		} as unknown as AbortSignal;
		const child = controlledChild((count, current) => {
			if (count === 1)
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
			if (count === 2)
				queueMicrotask(() => {
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(finalFrame),
					);
					(current.stdout as EventEmitter).emit("end");
					(current as unknown as EventEmitter).emit("close", 0, null);
				});
		});
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: signal,
			cancelPolicy: {
				graceMs: 100,
				forceErrorCode: "worker_forced_termination",
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		trigger?.();
		trigger?.();
		await expect(promise).resolves.toEqual({ ok: true });
		expect(child.frames).toHaveLength(2);
	});

	it("waits for real close after forced cancellation", async () => {
		const child = controlledChild((count, current: WorkerChild) => {
			if (count === 1)
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
		});
		const controller = new AbortController();
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: { graceMs: 1, forceErrorCode: "worker_forced_termination" },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await expect(promise).rejects.toMatchObject({
			code: "worker_forced_termination",
		});
		expect(child.killCount).toBe(1);
	});

	it("keeps the promise pending between kill and the real close event", async () => {
		const child = controlledChild(
			(count, current) => {
				if (count === 1)
					queueMicrotask(() =>
						(current.stdout as EventEmitter).emit(
							"data",
							encodeOperationWorkerFrame(acceptedFrame),
						),
					);
			},
			true,
			false,
		);
		const controller = new AbortController();
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: { graceMs: 1, forceErrorCode: "worker_forced_termination" },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(child.killCount).toBe(1);
		let settled = false;
		void promise.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);
		child.emit("close", null, "SIGKILL");
		await expect(promise).rejects.toMatchObject({
			code: "worker_forced_termination",
		});
	});

	it("enforces grace deadline deterministically before awaiting real close", async () => {
		vi.useFakeTimers();
		try {
			const child = controlledChild(
				(count, current) => {
					if (count === 1)
						queueMicrotask(() =>
							(current.stdout as EventEmitter).emit(
								"data",
								encodeOperationWorkerFrame(acceptedFrame),
							),
						);
				},
				true,
				false,
			);
			const controller = new AbortController();
			const promise = createOperationWorkerRunner({
				resolveInput,
				resolveBinary: async () => binary,
				spawnChild: () => child as unknown as WorkerChild,
				platform: "windows",
				extensionRoot: "C:/Extension",
			}).invoke(invocationFixture, {
				signal: controller.signal,
				cancelPolicy: {
					graceMs: 100,
					forceErrorCode: "worker_forced_termination",
				},
			});
			await vi.runAllTicks();
			controller.abort();
			await vi.runAllTicks();
			vi.advanceTimersByTime(99);
			await vi.runAllTicks();
			expect(child.killCount).toBe(0);
			vi.advanceTimersByTime(1);
			await vi.runAllTicks();
			expect(child.killCount).toBe(1);
			let settled = false;
			void promise.then(
				() => {
					settled = true;
				},
				() => {
					settled = true;
				},
			);
			await vi.runAllTicks();
			expect(settled).toBe(false);
			child.emit("close", null, "SIGKILL");
			await expect(promise).rejects.toMatchObject({
				code: "worker_forced_termination",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("lets a correlated final win an EPIPE race without killing the child", async () => {
		const child = controlledChild((count, current) => {
			if (count === 1)
				queueMicrotask(() => {
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					);
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(finalFrame),
					);
					(current.stdin as unknown as EventEmitter).emit(
						"error",
						new Error("EPIPE"),
					);
					(current.stdout as EventEmitter).emit("end");
					(current as unknown as EventEmitter).emit("close", 0, null);
				});
		});
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture);
		await expect(promise).resolves.toEqual({ ok: true });
		expect(child.killCount).toBe(0);
	});

	it("forces termination after a synchronous cancel EPIPE", async () => {
		const child = controlledChild((count, current) => {
			if (count === 1)
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
			if (count === 2) throw new Error("EPIPE");
		});
		const controller = new AbortController();
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: { graceMs: 1, forceErrorCode: "worker_forced_termination" },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await expect(promise).rejects.toMatchObject({
			code: "worker_forced_termination",
		});
		expect(child.killCount).toBe(1);
	});

	it("lets a synchronous final emitted before EPIPE win without killing", async () => {
		let finish: (() => void) | undefined;
		const child = controlledChild((count, current) => {
			if (count === 1)
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
			if (count === 2) {
				(current.stdout as EventEmitter).emit(
					"data",
					encodeOperationWorkerFrame(finalFrame),
				);
				finish = () => {
					(current.stdout as EventEmitter).emit("end");
					(current as unknown as EventEmitter).emit("close", 0, null);
				};
				throw new Error("EPIPE");
			}
		});
		const controller = new AbortController();
		const promise = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "windows",
			extensionRoot: "C:/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: { graceMs: 1, forceErrorCode: "worker_forced_termination" },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(child.killCount).toBe(0);
		finish?.();
		await expect(promise).resolves.toEqual({ ok: true });
	});

	it("uses the macOS forced termination branch", async () => {
		const child = controlledChild((count, current) => {
			if (count === 1)
				queueMicrotask(() =>
					(current.stdout as EventEmitter).emit(
						"data",
						encodeOperationWorkerFrame(acceptedFrame),
					),
				);
		});
		const controller = new AbortController();
		const promise = createOperationWorkerRunner({
			resolveInput: async () => ({
				...(await resolveInput()),
				extensionRoot: "/Extension",
				platform: "macos" as const,
			}),
			resolveBinary: async () => binary,
			spawnChild: () => child as unknown as WorkerChild,
			platform: "macos",
			extensionRoot: "/Extension",
		}).invoke(invocationFixture, {
			signal: controller.signal,
			cancelPolicy: { graceMs: 1, forceErrorCode: "worker_forced_termination" },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		await expect(promise).rejects.toMatchObject({
			code: "worker_forced_termination",
		});
		expect(child.killCount).toBe(1);
	});

	it("records commit progress before a crash as non-retryable attempt state", async () => {
		const committing: WireMessage = {
			kind: "event",
			message: {
				protocol_version: protocolVersion,
				request_id: "request-1",
				session_id: "session-1",
				payload: {
					data: { sequence: 1, stage: "committing" },
					event: "progress",
				},
			},
		};
		const child = fakeChildWithFrames([acceptedFrame, committing]);
		await expect(runnerFor(child).invoke(invocationFixture)).rejects.toSatisfy(
			(error: OperationWorkerAttemptError) => {
				expect(error.attempt).toEqual({
					accepted: true,
					commitObserved: true,
					retryEligible: false,
				});
				return true;
			},
		);
	});

	it("preserves stable domain error and diagnostic identity for retryable finals", async () => {
		const failure: WireMessage = {
			kind: "response",
			message: {
				protocol_version: protocolVersion,
				request_id: "request-1",
				session_id: "session-1",
				outcome: {
					status: "failure",
					error: {
						code: "network_unavailable",
						diagnostic_id: "diag-network-1",
						retryable: true,
						user_safe_detail: "network unavailable",
					},
				},
			},
		};
		await expect(
			runnerFor(fakeChildWithFrames([acceptedFrame, failure])).invoke(
				invocationFixture,
			),
		).rejects.toSatisfy((error: OperationWorkerAttemptError) => {
			expect(error.code).toBe("network_unavailable");
			expect(error.diagnostic).toBe("network unavailable");
			expect(error.diagnosticId).toBe("diag-network-1");
			expect(error.attempt.retryEligible).toBe(true);
			return true;
		});
	});
	it("requires accepted, monotonic progress, one final, and EOF", async () => {
		const child = fakeChildWithFrames([
			acceptedFrame,
			progressFrame(1),
			finalFrame,
		]);
		const progress: number[] = [];

		await expect(
			runnerFor(child).invoke(invocationFixture, {
				onProgress: (event) => progress.push(event.sequence),
			}),
		).resolves.toEqual({ ok: true });
		expect(child.stdinFrames).toHaveLength(1);
		expect(child.stdinEnded).toBe(true);
		expect(child.stdoutKinds).toEqual(["accepted", "progress", "final"]);
		expect(progress).toEqual([1]);
	});

	it("rejects duplicate accepted and mismatched protocol or identity", async () => {
		const wrongProtocol = replaceEnvelope(finalFrame, {
			protocol_version: { major: 2, minor: 0 },
		});
		const wrongRequest = replaceEnvelope(finalFrame, {
			request_id: "another-request",
		});
		const wrongSession = replaceEnvelope(finalFrame, {
			session_id: "another-session",
		});
		for (const frames of [
			[acceptedFrame, acceptedFrame, finalFrame],
			[acceptedFrame, wrongProtocol],
			[acceptedFrame, wrongRequest],
			[acceptedFrame, wrongSession],
		] as const) {
			await expect(
				runnerFor(fakeChildWithFrames(frames)).invoke(invocationFixture),
			).rejects.toMatchObject({ code: "protocol_violation" });
		}
	});

	it("rejects invalid locally encoded metadata before resolving or spawning", async () => {
		let resolveInputCalls = 0;
		let spawnCalls = 0;
		const runner = createOperationWorkerRunner({
			resolveInput: async () => {
				resolveInputCalls += 1;
				return resolveInput();
			},
			resolveBinary: async () => binary,
			spawnChild: () => {
				spawnCalls += 1;
				return fakeChildWithFrames([]);
			},
			platform: "windows",
			extensionRoot: "C:/Extension",
		});
		const invalidInvocation = {
			...invocationFixture,
			method: {
				...invocationFixture.method,
				encode: (
					payload: { value: string },
					context: typeof invocationFixture.context,
				) => {
					const request = invocationFixture.method.encode(payload, context);
					if (request.kind !== "request") return request;
					return {
						...request,
						message: {
							...request.message,
							protocol_version: { major: 2, minor: 0 },
						},
					} as WireMessage;
				},
			},
		};

		await expect(runner.invoke(invalidInvocation)).rejects.toMatchObject({
			code: "protocol_violation",
		});
		const contextMismatchInvocation = {
			...invocationFixture,
			method: {
				...invocationFixture.method,
				encode: (
					payload: { value: string },
					context: typeof invocationFixture.context,
				) => {
					const request = invocationFixture.method.encode(payload, context);
					if (request.kind !== "request") return request;
					return {
						...request,
						message: {
							...request.message,
							context: {
								...request.message.context,
								managed_root: "session_default" as const,
							},
						},
					};
				},
			},
		};
		await expect(
			runner.invoke(contextMismatchInvocation),
		).rejects.toMatchObject({ code: "protocol_violation" });
		expect(resolveInputCalls).toBe(0);
		expect(spawnCalls).toBe(0);
	});

	it("rejects prototype-chain methods before resolver or spawn", async () => {
		let resolveInputCalls = 0;
		let spawnCalls = 0;
		const invalidInvocation = {
			...invocationFixture,
			method: {
				...invocationFixture.method,
				name: "toString",
				encode: (
					payload: { value: string },
					context: typeof invocationFixture.context,
				) => {
					const request = invocationFixture.method.encode(payload, context);
					if (request.kind !== "request") return request;
					return {
						...request,
						message: { ...request.message, method: "toString" },
					};
				},
			},
		};
		const runner = createOperationWorkerRunner({
			resolveInput: async () => {
				resolveInputCalls += 1;
				return resolveInput();
			},
			resolveBinary: async () => binary,
			spawnChild: () => {
				spawnCalls += 1;
				return fakeChildWithFrames([]);
			},
			platform: "windows",
			extensionRoot: "C:/Extension",
		});
		await expect(runner.invoke(invalidInvocation)).rejects.toMatchObject({
			code: "protocol_violation",
		});
		expect(resolveInputCalls).toBe(0);
		expect(spawnCalls).toBe(0);
	});

	it("rejects legacy policy keys when a dotted wire name is required", async () => {
		let resolveInputCalls = 0;
		let spawnCalls = 0;
		const legacyInvocation = {
			...invocationFixture,
			method: {
				...invocationFixture.method,
				name: "online_catalog_search",
				encode: (
					payload: { value: string },
					context: typeof invocationFixture.context,
				) => {
					const request = invocationFixture.method.encode(payload, context);
					if (request.kind !== "request") return request;
					return {
						...request,
						message: { ...request.message, method: "online_catalog_search" },
					};
				},
			},
		};
		const runner = createOperationWorkerRunner({
			resolveInput: async () => {
				resolveInputCalls += 1;
				return resolveInput();
			},
			resolveBinary: async () => binary,
			spawnChild: () => {
				spawnCalls += 1;
				return fakeChildWithFrames([]);
			},
			platform: "windows",
			extensionRoot: "C:/Extension",
		});

		await expect(runner.invoke(legacyInvocation)).rejects.toMatchObject({
			code: "protocol_violation",
		});
		expect(resolveInputCalls).toBe(0);
		expect(spawnCalls).toBe(0);
	});

	it("uses own-property policy lookup when Object.hasOwn is unavailable", async () => {
		const result = withoutObjectHasOwn(() =>
			runnerFor(fakeChildWithFrames([acceptedFrame, finalFrame])).invoke(
				invocationFixture,
			),
		);
		await expect(result).resolves.toEqual({ ok: true });

		const inheritedInvocation = {
			...invocationFixture,
			method: {
				...invocationFixture.method,
				name: "toString",
				encode: (
					payload: { value: string },
					context: typeof invocationFixture.context,
				) => {
					const request = invocationFixture.method.encode(payload, context);
					if (request.kind !== "request") return request;
					return {
						...request,
						message: { ...request.message, method: "toString" },
					};
				},
			},
		};
		const inheritedResult = withoutObjectHasOwn(() =>
			runnerFor(fakeChildWithFrames([])).invoke(inheritedInvocation),
		);
		await expect(inheritedResult).rejects.toMatchObject({
			code: "protocol_violation",
		});
	});

	it("maps accepted-order and progress violations to protocol_violation", async () => {
		for (const frames of [
			[finalFrame],
			[acceptedFrame, progressFrame(1), progressFrame(1), finalFrame],
		] as const) {
			const child = fakeChildWithFrames(frames);
			await expect(
				runnerFor(child).invoke(invocationFixture),
			).rejects.toMatchObject({ code: "protocol_violation" });
		}
	});

	it("maps malformed frames and duplicate finals to protocol_violation", async () => {
		await expect(
			runnerFor(fakeChildWithFrames([malformedFirstFrame])).invoke(
				invocationFixture,
			),
		).rejects.toMatchObject({ code: "protocol_violation" });
		await expect(
			runnerFor(
				fakeChildWithFrames([acceptedFrame, finalFrame, finalFrame]),
			).invoke(invocationFixture),
		).rejects.toMatchObject({ code: "protocol_violation" });
	});

	it("maps missing final and non-zero process exit to worker_crashed", async () => {
		await expect(
			runnerFor(fakeChildWithFrames([acceptedFrame])).invoke(invocationFixture),
		).rejects.toMatchObject({ code: "worker_crashed" });
		await expect(
			runnerFor(
				fakeChildWithFrames([acceptedFrame, finalFrame], { exitCode: 7 }),
			).invoke(invocationFixture),
		).rejects.toMatchObject({ code: "worker_crashed" });
	});

	it("preserves a typed operation failure decoded from the final response", async () => {
		const expected = Object.assign(new Error("network unavailable"), {
			code: "network_unavailable" as const,
		});
		const invocation = {
			...invocationFixture,
			method: {
				...invocationFixture.method,
				decode: (): never => {
					throw expected;
				},
			},
		};

		await expect(
			runnerFor(fakeChildWithFrames([acceptedFrame, finalFrame])).invoke(
				invocation,
			),
		).rejects.toBe(expected);
	});

	it("maps asynchronous spawn errors and cleans listeners", async () => {
		const child = fakeChildWithFrames([], {
			processError: new Error("ENOENT C:/Users/rebui/private/worker.exe"),
		});
		await expect(
			runnerFor(child).invoke(invocationFixture),
		).rejects.toMatchObject({
			code: "worker_crashed",
		});
		expect(child.listenerCount("error")).toBe(0);
		expect(child.stdout.listenerCount("data")).toBe(0);
		expect(child.stderr.listenerCount("data")).toBe(0);
		expect(child.stdin.listenerCount("error")).toBe(0);
	});

	it("keeps a failed invocation active until the child actually closes", async () => {
		const child = fakeChildWithFrames([], {
			processError: new Error("spawn failed"),
			killCloses: false,
		});
		const runner = runnerFor(child);
		const invocation = runner.invoke(invocationFixture);
		const rejection = expect(invocation).rejects.toMatchObject({
			code: "worker_crashed",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		await expect(runner.drain(0)).resolves.toBe(false);
		child.emit("close", null, "SIGTERM");
		await rejection;
		await expect(runner.drain(0)).resolves.toBe(true);
	});

	it("stops new invocations and drains only after the active child closes", async () => {
		const child = fakeChildWithFrames([acceptedFrame, finalFrame]);
		const runner = runnerFor(child);
		const activeInvocation = runner.invoke(invocationFixture);
		runner.stopAccepting();
		await expect(runner.drain(0)).resolves.toBe(false);
		await expect(runner.invoke(invocationFixture)).rejects.toMatchObject({
			code: "worker_forced_termination",
		});
		await expect(activeInvocation).resolves.toEqual({ ok: true });
		await expect(runner.drain(0)).resolves.toBe(true);
	});

	it("keeps request/context out of argv and env, and uses platform spawn options", async () => {
		const child = fakeChildWithFrames([acceptedFrame, finalFrame]);
		setTimeout(() => child.stdin.end(), 0);
		let spawnArgs: unknown[] = [];
		const runner = createOperationWorkerRunner({
			resolveInput: async () => ({
				...(await resolveInput()),
				extensionRoot: "/Extension",
				platform: "macos",
			}),
			resolveBinary: async () => binary,
			spawnChild: (...args) => {
				spawnArgs = args;
				return child;
			},
			platform: "macos",
			extensionRoot: "/Extension",
		});

		await runner.invoke(invocationFixture);
		expect(spawnArgs[0]).toBe(binary.absolutePath);
		// Issue #158: the third argument is the scheduler correlation. This
		// run passes none, and it is deliberately a separate argument so the
		// spawn options / env stay free of request data.
		expect(spawnArgs).toHaveLength(3);
		expect(spawnArgs[2]).toBeUndefined();
		expect(spawnArgs[1]).toEqual({
			shell: false,
			windowsHide: false,
			cwd: "/Extension",
			stdio: ["pipe", "pipe", "pipe"],
			env: { TY_PLUS_WORKER_ARTIFACT_SHA256: "hash" },
		});
		expect(JSON.stringify(spawnArgs[1])).not.toContain("request-marker");
		expect(JSON.stringify(spawnArgs[1])).not.toContain("After Effects");
	});

	it("passes the scheduler correlation to resolution and spawn, never into env", async () => {
		const child = fakeChildWithFrames([acceptedFrame, finalFrame]);
		setTimeout(() => child.stdin.end(), 0);
		const correlation = {
			logicalOperationId: "job-1",
			requestId: "request-1",
			attempt: 1,
			operation: "host_thumbnail_lookup",
			sessionId: "session-1",
		} as const;
		let spawnArgs: unknown[] = [];
		let resolvedAttempt: unknown;
		let resolvedBinaryCorrelation: unknown;
		const runner = createOperationWorkerRunner({
			resolveInput: async (attempt) => {
				resolvedAttempt = attempt;
				return {
					...(await resolveInput()),
					extensionRoot: "/Extension",
					platform: "macos",
				};
			},
			resolveBinary: async (_input, received) => {
				resolvedBinaryCorrelation = received;
				return binary;
			},
			spawnChild: (...args) => {
				spawnArgs = args;
				return child;
			},
			platform: "macos",
			extensionRoot: "/Extension",
		});

		await runner.invoke(invocationFixture, { correlation });

		expect(resolvedAttempt).toMatchObject({ correlation });
		expect(resolvedBinaryCorrelation).toEqual(correlation);
		expect(spawnArgs[2]).toEqual(correlation);
		// The spawn options carry no request payload or correlation id.
		expect(JSON.stringify(spawnArgs[1])).not.toContain("request-marker");
		expect(JSON.stringify(spawnArgs[1])).not.toContain("job-1");
		expect(JSON.stringify(spawnArgs[1])).not.toContain("request-1");
	});

	it("uses windowsHide on Windows and cleans all listeners after EOF", async () => {
		const child = fakeChildWithFrames([acceptedFrame, finalFrame]);
		setTimeout(() => child.stdin.end(), 0);
		let options: unknown;
		const runner = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: (_path, spawnOptions) => {
				options = spawnOptions;
				return child;
			},
			platform: "windows",
			extensionRoot: "C:/Extension",
		});
		await runner.invoke(invocationFixture);
		expect(options).toMatchObject({ windowsHide: true });
		expect(child.listenerCount("close")).toBe(0);
		expect(child.stdout.listenerCount("data")).toBe(0);
		expect(child.stderr.listenerCount("data")).toBe(0);
	});

	it("keeps the verified content-addressed tuple when the manifest switches before spawn", async () => {
		const artifactRoot = join(process.cwd(), ".tmp");
		await mkdir(artifactRoot, { recursive: true });
		const sandboxRoot = await mkdtemp(
			join(artifactRoot, "operation-worker-runner-"),
		);
		try {
			const extensionRoot = join(sandboxRoot, "extension");
			const oldWindowsWorker = createWindowsWorkerFixture();
			const newWindowsWorker = Buffer.from(oldWindowsWorker);
			newWindowsWorker[newWindowsWorker.byteLength - 1] = 1;
			const macosWorker = createMacosWorkerFixture();
			const relativePathFor = (
				platform: "windows" | "macos",
				bytes: Uint8Array,
			): string =>
				`worker/versions/${sha256(bytes)}/${platform}/operation-worker${
					platform === "windows" ? ".exe" : ""
				}`;
			const oldWindowsPath = relativePathFor("windows", oldWindowsWorker);
			const newWindowsPath = relativePathFor("windows", newWindowsWorker);
			const macosPath = relativePathFor("macos", macosWorker);
			for (const [relativePath, bytes] of [
				[oldWindowsPath, oldWindowsWorker],
				[newWindowsPath, newWindowsWorker],
				[macosPath, macosWorker],
			] as const) {
				const absolutePath = join(extensionRoot, relativePath);
				await mkdir(dirname(absolutePath), { recursive: true });
				await writeFile(absolutePath, bytes);
			}

			const manifestFor = (
				windowsBytes: Uint8Array,
			): OperationWorkerManifest => ({
				capabilities: ["storage"],
				extensionVersion: "build-1",
				productVersion: "build-1",
				protocolVersion,
				workers: {
					macos: {
						relativePath: macosPath,
						sha256: sha256(macosWorker),
						signature: signatureFor("codesign"),
					},
					windows: {
						relativePath: relativePathFor("windows", windowsBytes),
						sha256: sha256(windowsBytes),
						signature: signatureFor("authenticode"),
					},
				},
			});
			let manifest = manifestFor(oldWindowsWorker);
			let spawnedTuple = "";
			const runner = createOperationWorkerRunner({
				resolveInput: async () => ({
					expectedCapabilities: ["storage"],
					expectedExtensionVersion: "build-1",
					expectedProductVersion: "build-1",
					expectedProtocolVersion: protocolVersion,
					expectedTrustMode: "release" as const,
					extensionRoot,
					manifest,
					platform: "windows",
				}),
				resolveBinary: async (input) => {
					const resolvedBinary = await resolveOperationWorkerBinary(input);
					manifest = manifestFor(newWindowsWorker);
					return resolvedBinary;
				},
				spawnChild: (path, options) => {
					spawnedTuple = `${path}:${options.env.TY_PLUS_WORKER_ARTIFACT_SHA256}`;
					const child = fakeChildWithFrames([acceptedFrame, finalFrame]);
					setTimeout(() => child.stdin.end(), 0);
					return child;
				},
				platform: "windows",
				extensionRoot,
			});

			await runner.invoke(invocationFixture);
			expect(spawnedTuple).toBe(
				`${resolve(extensionRoot, oldWindowsPath)}:${sha256(oldWindowsWorker)}`,
			);
			expect(manifest.workers.windows.relativePath).toBe(newWindowsPath);
		} finally {
			await rm(sandboxRoot, { force: true, recursive: true });
		}
	});

	it("preserves resolver errors and maps synchronous spawn failures", async () => {
		const resolverFailure = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => {
				throw new WorkerBinaryError("binary_missing");
			},
			spawnChild: () => fakeChildWithFrames([]),
			platform: "windows",
			extensionRoot: "C:/Extension",
		});
		await expect(
			resolverFailure.invoke(invocationFixture),
		).rejects.toMatchObject({
			code: "binary_missing",
		});

		const spawnFailure = createOperationWorkerRunner({
			resolveInput,
			resolveBinary: async () => binary,
			spawnChild: () => {
				throw new Error("spawn failed");
			},
			platform: "windows",
			extensionRoot: "C:/Extension",
		});
		await expect(spawnFailure.invoke(invocationFixture)).rejects.toMatchObject({
			code: "worker_crashed",
		});
	});

	it("rejects resolver input that targets another extension root", async () => {
		let resolverCalls = 0;
		const runner = createOperationWorkerRunner({
			resolveInput: async () => ({
				...(await resolveInput()),
				extensionRoot: "C:/AnotherExtension",
			}),
			resolveBinary: async () => {
				resolverCalls += 1;
				return binary;
			},
			spawnChild: () => fakeChildWithFrames([]),
			platform: "windows",
			extensionRoot: "C:/Extension",
		});

		await expect(runner.invoke(invocationFixture)).rejects.toMatchObject({
			code: "binary_manifest_mismatch",
		});
		expect(resolverCalls).toBe(0);
	});

	it("redacts and bounds stderr diagnostics", async () => {
		const child = fakeChildWithFrames([acceptedFrame], {
			stderr: `token=secret ${"🦀".repeat(10_000)} C:/Users/rebui/private`,
		});
		await expect(runnerFor(child).invoke(invocationFixture)).rejects.toSatisfy(
			(error: OperationWorkerError) => {
				expect(error.code).toBe("worker_crashed");
				expect(error.message).not.toContain("secret");
				expect(
					new TextEncoder().encode(error.diagnostic ?? "").byteLength,
				).toBeLessThanOrEqual(1024);
				return true;
			},
		);
	});
});
