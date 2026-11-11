import { describe, expect, it } from "vitest";
import { protocolLimits, type WireMessage } from "./generated";
import {
	encodeOperationWorkerFrame,
	OperationWorkerFrameDecoder,
	type OperationWorkerFrameError,
} from "./operation-worker-frame";

const acceptedFixture: WireMessage = {
	kind: "event",
	message: {
		payload: {
			data: {
				request_id: "request-1",
				session_id: "session-1",
			},
			event: "accepted",
		},
		protocol_version: { major: 1, minor: 0 },
		request_id: "request-1",
		session_id: "session-1",
	},
};

const encodeJson = (value: unknown): Uint8Array =>
	new TextEncoder().encode(JSON.stringify(value));

const framePayload = (payload: Uint8Array): Uint8Array => {
	const frame = new Uint8Array(4 + payload.byteLength);
	new DataView(frame.buffer).setUint32(0, payload.byteLength, false);
	frame.set(payload, 4);
	return frame;
};

const messageWithEncodedSize = (size: number): WireMessage => {
	const message: WireMessage = {
		kind: "response",
		message: {
			outcome: { payload: "", status: "success" },
			protocol_version: { major: 1, minor: 0 },
			request_id: "request-1",
			session_id: "session-1",
		},
	};
	const emptySize = encodeJson(message).byteLength;
	if (size < emptySize) {
		throw new Error("requested fixture size is too small");
	}
	const { outcome } = message.message;
	if (outcome.status !== "success") {
		throw new Error("expected a success response fixture");
	}
	outcome.payload = "x".repeat(size - emptySize);
	return message;
};

const expectFrameError = (
	action: () => unknown,
	code: OperationWorkerFrameError["code"],
): void => {
	try {
		action();
	} catch (error) {
		expect(error).toMatchObject({ code, name: "OperationWorkerFrameError" });
		return;
	}
	throw new Error(`expected ${code}`);
};

describe("operation worker frame codec", () => {
	it("reassembles a header and payload delivered in separate chunks", () => {
		const frame = encodeOperationWorkerFrame(acceptedFixture);
		const decoder = new OperationWorkerFrameDecoder();

		expect(decoder.push(frame.slice(0, 2))).toEqual([]);
		expect(decoder.push(frame.slice(2, 7))).toEqual([]);
		expect(decoder.push(frame.slice(7))).toEqual([acceptedFixture]);
		decoder.finish();
	});

	it("decodes multiple complete frames from one chunk", () => {
		const first = encodeOperationWorkerFrame(acceptedFixture);
		const secondMessage: WireMessage = {
			kind: "cancel",
			message: { target_request_id: "request-1" },
		};
		const second = encodeOperationWorkerFrame(secondMessage);
		const combined = new Uint8Array(first.byteLength + second.byteLength);
		combined.set(first);
		combined.set(second, first.byteLength);

		const decoder = new OperationWorkerFrameDecoder();
		expect(decoder.push(combined)).toEqual([acceptedFixture, secondMessage]);
		decoder.finish();
	});

	it("uses the UTF-8 payload byte length in the big-endian header", () => {
		const message: WireMessage = {
			kind: "response",
			message: {
				outcome: { payload: "日本語", status: "success" },
				protocol_version: { major: 1, minor: 0 },
				request_id: "request-1",
				session_id: "session-1",
			},
		};
		const frame = encodeOperationWorkerFrame(message);
		const declaredLength = new DataView(
			frame.buffer,
			frame.byteOffset,
			4,
		).getUint32(0, false);

		expect(declaredLength).toBe(encodeJson(message).byteLength);
		expect(declaredLength).toBe(frame.byteLength - 4);
	});

	it("accepts the exact protocol frame limit and rejects a larger payload", () => {
		const exact = messageWithEncodedSize(protocolLimits.maxFrameBytes);
		const oversized = messageWithEncodedSize(protocolLimits.maxFrameBytes + 1);
		const exactFrame = encodeOperationWorkerFrame(exact);

		expect(exactFrame).toHaveLength(protocolLimits.maxFrameBytes + 4);
		const decoder = new OperationWorkerFrameDecoder();
		expect(decoder.push(exactFrame)).toEqual([exact]);
		decoder.finish();
		expectFrameError(
			() => encodeOperationWorkerFrame(oversized),
			"frame_too_large",
		);
	});

	it("rejects zero, high-bit, and oversized declared lengths", () => {
		expectFrameError(
			() => new OperationWorkerFrameDecoder().push(Uint8Array.of(0, 0, 0, 0)),
			"frame_zero_length",
		);
		for (const highByte of [0x80, 0x81, 0xff]) {
			expectFrameError(
				() =>
					new OperationWorkerFrameDecoder().push(
						Uint8Array.of(highByte, 0, 0, 1),
					),
				"frame_length_invalid",
			);
		}

		const oversizedHeader = new Uint8Array(4);
		new DataView(oversizedHeader.buffer).setUint32(
			0,
			protocolLimits.maxFrameBytes + 1,
			false,
		);
		expectFrameError(
			() => new OperationWorkerFrameDecoder().push(oversizedHeader),
			"frame_too_large",
		);
	});

	it("distinguishes invalid UTF-8, JSON, and wire messages", () => {
		expectFrameError(
			() =>
				new OperationWorkerFrameDecoder().push(
					framePayload(Uint8Array.of(0xc3, 0x28)),
				),
			"frame_utf8_invalid",
		);
		expectFrameError(
			() =>
				new OperationWorkerFrameDecoder().push(
					framePayload(new TextEncoder().encode("{")),
				),
			"frame_json_invalid",
		);
		expectFrameError(
			() =>
				new OperationWorkerFrameDecoder().push(
					framePayload(encodeJson({ kind: "future", message: {} })),
				),
			"frame_message_invalid",
		);
	});

	it.each([
		{ kind: "request", message: {} },
		{ kind: "cancel", message: {} },
		{ kind: "response", message: {} },
		{ kind: "event", message: {} },
		{
			...acceptedFixture,
			message: { ...acceptedFixture.message, unexpected: true },
		},
	])("rejects nested schema-invalid wire messages", (message) => {
		expectFrameError(
			() =>
				new OperationWorkerFrameDecoder().push(
					framePayload(encodeJson(message)),
				),
			"frame_message_invalid",
		);
	});

	it("normalizes serialization failures and serialized schema failures", () => {
		const cyclicPayload: Record<string, unknown> = {};
		cyclicPayload.self = cyclicPayload;
		const cyclic = {
			kind: "response",
			message: {
				...messageWithEncodedSize(256).message,
				outcome: { payload: cyclicPayload, status: "success" },
			},
		} as WireMessage;
		const bigint = {
			kind: "response",
			message: {
				...messageWithEncodedSize(256).message,
				outcome: { payload: 1n, status: "success" },
			},
		} as WireMessage;
		const missingRequired = {
			...acceptedFixture,
			message: { ...acceptedFixture.message, request_id: undefined },
		} as unknown as WireMessage;

		for (const message of [cyclic, bigint, missingRequired]) {
			expectFrameError(
				() => encodeOperationWorkerFrame(message),
				"frame_message_invalid",
			);
		}
	});

	it("reports truncated headers and payloads only when the stream finishes", () => {
		const headerDecoder = new OperationWorkerFrameDecoder();
		expect(headerDecoder.push(Uint8Array.of(0, 0))).toEqual([]);
		expectFrameError(() => headerDecoder.finish(), "frame_truncated");

		const payloadDecoder = new OperationWorkerFrameDecoder();
		const frame = encodeOperationWorkerFrame(acceptedFixture);
		expect(payloadDecoder.push(frame.slice(0, -1))).toEqual([]);
		expectFrameError(() => payloadDecoder.finish(), "frame_truncated");
	});

	it("finishes cleanly after consuming every frame", () => {
		const decoder = new OperationWorkerFrameDecoder();
		expect(decoder.push(encodeOperationWorkerFrame(acceptedFixture))).toEqual([
			acceptedFixture,
		]);
		expect(decoder.finish()).toBeUndefined();
	});

	it("keeps a decoder terminal after the first frame error", () => {
		const decoder = new OperationWorkerFrameDecoder();
		expectFrameError(
			() => decoder.push(Uint8Array.of(0x80, 0, 0, 1)),
			"frame_length_invalid",
		);
		expectFrameError(
			() => decoder.push(encodeOperationWorkerFrame(acceptedFixture)),
			"frame_length_invalid",
		);
		expectFrameError(() => decoder.finish(), "frame_length_invalid");
	});
});
