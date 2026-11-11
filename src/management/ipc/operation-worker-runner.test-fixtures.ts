import { EventEmitter } from "node:events";
import { protocolVersion, type WireMessage } from "./generated";
import { encodeOperationWorkerFrame } from "./operation-worker-frame";
import type {
	ImmutableHostContext,
	OperationInvocation,
} from "./operation-worker-runner";

const requestId = "request-1";
const sessionId = "session-1";

export const createWindowsWorkerFixture = (): Buffer => {
	const peOffset = 0x80;
	const optionalHeaderSize = 112;
	const sectionTableOffset = peOffset + 24 + optionalHeaderSize;
	const rawSectionOffset = sectionTableOffset + 40;
	const worker = Buffer.alloc(rawSectionOffset + 0x200, 0);
	worker.write("MZ", 0, "ascii");
	worker.writeUInt32LE(peOffset, 0x3c);
	worker.write("PE\0\0", peOffset, "binary");
	worker.writeUInt16LE(0x8664, peOffset + 4);
	worker.writeUInt16LE(1, peOffset + 6);
	worker.writeUInt16LE(optionalHeaderSize, peOffset + 20);
	worker.writeUInt16LE(0x0002, peOffset + 22);
	worker.writeUInt16LE(0x020b, peOffset + 24);
	worker.writeUInt32LE(0x1000, peOffset + 24 + 16);
	worker.write(".text\0\0\0", sectionTableOffset, "ascii");
	worker.writeUInt32LE(0x200, sectionTableOffset + 8);
	worker.writeUInt32LE(0x1000, sectionTableOffset + 12);
	worker.writeUInt32LE(0x200, sectionTableOffset + 16);
	worker.writeUInt32LE(rawSectionOffset, sectionTableOffset + 20);
	worker.writeUInt32LE(0x60000020, sectionTableOffset + 36);
	return worker;
};

const createMachOSlice = (cpuType: number): Buffer => {
	const slice = Buffer.alloc(144, 0);
	slice.writeUInt32LE(0xfeedfacf, 0);
	slice.writeUInt32LE(cpuType, 4);
	slice.writeUInt32LE(2, 12);
	slice.writeUInt32LE(2, 16);
	slice.writeUInt32LE(96, 20);
	const segmentOffset = 32;
	slice.writeUInt32LE(0x19, segmentOffset);
	slice.writeUInt32LE(72, segmentOffset + 4);
	slice.writeUInt32LE(144, segmentOffset + 32);
	slice.writeUInt32LE(144, segmentOffset + 48);
	slice.writeUInt32LE(7, segmentOffset + 56);
	slice.writeUInt32LE(5, segmentOffset + 60);
	const mainOffset = segmentOffset + 72;
	slice.writeUInt32LE(0x80000028, mainOffset);
	slice.writeUInt32LE(24, mainOffset + 4);
	slice.writeUInt32LE(0x20, mainOffset + 8);
	return slice;
};

export const createMacosWorkerFixture = (): Buffer => {
	const x86SliceOffset = 48;
	const sliceSize = 144;
	const armSliceOffset = x86SliceOffset + sliceSize;
	const worker = Buffer.alloc(armSliceOffset + sliceSize, 0);
	worker.writeUInt32BE(0xcafebabe, 0);
	worker.writeUInt32BE(2, 4);
	worker.writeUInt32BE(0x01000007, 8);
	worker.writeUInt32BE(x86SliceOffset, 16);
	worker.writeUInt32BE(sliceSize, 20);
	worker.writeUInt32BE(0, 24);
	worker.writeUInt32BE(0x0100000c, 28);
	worker.writeUInt32BE(armSliceOffset, 36);
	worker.writeUInt32BE(sliceSize, 40);
	worker.writeUInt32BE(0, 44);
	createMachOSlice(0x01000007).copy(worker, x86SliceOffset);
	createMachOSlice(0x0100000c).copy(worker, armSliceOffset);
	return worker;
};

export const invocationFixture: OperationInvocation<{ value: string }> = {
	request: { value: "request-marker" },
	method: {
		name: "fixture.operation",
		idempotency: "idempotent",
		cancellable: false,
		encode: (payload, context: ImmutableHostContext): WireMessage => ({
			kind: "request",
			message: {
				context: {
					host_context: {
						app_root: context.appRoot,
						session_id: context.sessionId,
						support_root: context.supportRoot,
					},
					managed_root:
						context.managedRoot === undefined
							? "session_default"
							: { explicit_shared: { root: context.managedRoot } },
				},
				metadata: {
					cancellable: false,
					deadline_unix_ms: 4_000_000_000,
					request_id: requestId,
					session_id: sessionId,
				},
				method: "fixture.operation",
				payload,
				protocol_version: protocolVersion,
			},
		}),
		decode: (message) => {
			if (
				message.kind !== "response" ||
				message.message.outcome.status !== "success"
			) {
				throw new Error("unexpected fixture response");
			}
			return message.message.outcome.payload as { ok: true };
		},
	},
	context: {
		appRoot: "C:/After Effects",
		supportRoot: "C:/Extension/support",
		sessionId,
		managedRoot: "C:/Extension/shared",
	},
	buildId: "build-1",
	capabilities: ["storage"],
};

export const acceptedFrame: WireMessage = {
	kind: "event",
	message: {
		payload: {
			data: { request_id: requestId, session_id: sessionId },
			event: "accepted",
		},
		protocol_version: protocolVersion,
		request_id: requestId,
		session_id: sessionId,
	},
};

export const progressFrame = (sequence: number): WireMessage => ({
	kind: "event",
	message: {
		payload: {
			data: { sequence, stage: "reading", user_safe_detail: null },
			event: "progress",
		},
		protocol_version: protocolVersion,
		request_id: requestId,
		session_id: sessionId,
	},
});

export const finalFrame: WireMessage = {
	kind: "response",
	message: {
		outcome: { payload: { ok: true }, status: "success" },
		protocol_version: protocolVersion,
		request_id: requestId,
		session_id: sessionId,
	},
};

const responseFrame = (payload: unknown): WireMessage => ({
	kind: "response",
	message: {
		outcome: { payload, status: "success" },
		protocol_version: protocolVersion,
		request_id: requestId,
		session_id: sessionId,
	},
});

export const malformedFirstFrame = new Uint8Array([0, 0, 0, 2, 123, 125]);

type FakeStream = EventEmitter & { readonly chunks: Uint8Array[] };

const makeStream = (): FakeStream => {
	const stream = new EventEmitter() as FakeStream;
	Object.defineProperty(stream, "chunks", { value: [], enumerable: true });
	return stream;
};

export type FakeWorkerChild = EventEmitter & {
	readonly stdinFrames: Uint8Array[];
	readonly stdinEnded: boolean;
	readonly stdout: FakeStream;
	readonly stderr: FakeStream;
	readonly stdin: EventEmitter & {
		write(chunk: Uint8Array): boolean;
		end(): void;
	};
	readonly stdoutKinds: string[];
	readonly kill: () => boolean;
};

export const fakeChildWithFrames = (
	frames: readonly (WireMessage | Uint8Array)[],
	options: {
		readonly stderr?: string;
		readonly exitCode?: number;
		readonly processError?: Error;
		readonly killCloses?: boolean;
	} = {},
): FakeWorkerChild => {
	const child = new EventEmitter() as FakeWorkerChild;
	const stdout = makeStream();
	const stderr = makeStream();
	const stdinFrames: Uint8Array[] = [];
	let stdinEnded = false;
	const stdin = Object.assign(new EventEmitter(), {
		write: (chunk: Uint8Array) => {
			stdinFrames.push(new Uint8Array(chunk));
			return true;
		},
		end: () => {
			stdinEnded = true;
			queueMicrotask(() => {
				if (options.processError !== undefined) {
					child.emit("error", options.processError);
					return;
				}
				for (const frame of frames) {
					const encoded =
						frame instanceof Uint8Array
							? frame
							: encodeOperationWorkerFrame(frame);
					const split = Math.max(1, Math.floor(encoded.byteLength / 2));
					stdout.emit("data", encoded.subarray(0, split));
					stdout.emit("data", encoded.subarray(split));
				}
				if (options.stderr !== undefined)
					stderr.emit("data", Buffer.from(options.stderr));
				stderr.emit("end");
				stdout.emit("end");
				child.emit("close", options.exitCode ?? 0, null);
			});
		},
	});
	const stdoutKinds = frames.map((frame) =>
		frame instanceof Uint8Array
			? "malformed"
			: frame.kind === "event"
				? frame.message.payload.event
				: "final",
	);
	Object.defineProperties(child, {
		stdinFrames: { value: stdinFrames, enumerable: true },
		stdinEnded: { get: () => stdinEnded, enumerable: true },
		stdout: { value: stdout },
		stderr: { value: stderr },
		stdin: { value: stdin },
		stdoutKinds: { value: stdoutKinds },
		kill: {
			value: () => {
				if (options.killCloses !== false) child.emit("close", null, "SIGTERM");
				return true;
			},
		},
	});
	return child;
};
