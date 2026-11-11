import { isWireMessage, protocolLimits, type WireMessage } from "./generated";

export type OperationWorkerFrameErrorCode =
	| "frame_zero_length"
	| "frame_length_invalid"
	| "frame_too_large"
	| "frame_truncated"
	| "frame_utf8_invalid"
	| "frame_json_invalid"
	| "frame_message_invalid";

export class OperationWorkerFrameError extends Error {
	readonly code: OperationWorkerFrameErrorCode;

	constructor(code: OperationWorkerFrameErrorCode) {
		super(code);
		this.name = "OperationWorkerFrameError";
		this.code = code;
	}
}

const decodePayload = (payload: Uint8Array): WireMessage => {
	let json: string;
	try {
		json = new TextDecoder("utf-8", { fatal: true }).decode(payload);
	} catch {
		throw new OperationWorkerFrameError("frame_utf8_invalid");
	}

	let value: unknown;
	try {
		value = JSON.parse(json) as unknown;
	} catch {
		throw new OperationWorkerFrameError("frame_json_invalid");
	}

	if (!isWireMessage(value)) {
		throw new OperationWorkerFrameError("frame_message_invalid");
	}
	return value;
};

const serializeMessage = (message: WireMessage): string => {
	let json: string | undefined;
	try {
		json = JSON.stringify(message);
	} catch {
		throw new OperationWorkerFrameError("frame_message_invalid");
	}
	if (json === undefined) {
		throw new OperationWorkerFrameError("frame_message_invalid");
	}

	let serialized: unknown;
	try {
		serialized = JSON.parse(json) as unknown;
	} catch {
		throw new OperationWorkerFrameError("frame_message_invalid");
	}
	if (!isWireMessage(serialized)) {
		throw new OperationWorkerFrameError("frame_message_invalid");
	}
	return json;
};

export const encodeOperationWorkerFrame = (
	message: WireMessage,
): Uint8Array => {
	const payload = new TextEncoder().encode(serializeMessage(message));
	if (payload.byteLength === 0) {
		throw new OperationWorkerFrameError("frame_zero_length");
	}
	if (payload.byteLength > protocolLimits.maxFrameBytes) {
		throw new OperationWorkerFrameError("frame_too_large");
	}

	const frame = new Uint8Array(4 + payload.byteLength);
	new DataView(frame.buffer).setUint32(0, payload.byteLength, false);
	frame.set(payload, 4);
	return frame;
};

export class OperationWorkerFrameDecoder {
	private frame = new Uint8Array(4);
	private receivedBytes = 0;
	private expectedPayloadBytes: number | undefined;
	private failure: OperationWorkerFrameError | undefined;

	push(chunk: Uint8Array): readonly WireMessage[] {
		this.throwIfFailed();
		const messages: WireMessage[] = [];
		let chunkOffset = 0;

		try {
			while (chunkOffset < chunk.byteLength) {
				if (this.expectedPayloadBytes === undefined) {
					const headerBytes = Math.min(
						4 - this.receivedBytes,
						chunk.byteLength - chunkOffset,
					);
					this.frame.set(
						chunk.subarray(chunkOffset, chunkOffset + headerBytes),
						this.receivedBytes,
					);
					this.receivedBytes += headerBytes;
					chunkOffset += headerBytes;
					if (this.receivedBytes < 4) break;

					const length = this.readPayloadLength();
					const completeFrame = new Uint8Array(4 + length);
					completeFrame.set(this.frame);
					this.frame = completeFrame;
					this.expectedPayloadBytes = length;
				}

				const frameBytes = 4 + this.expectedPayloadBytes;
				const payloadBytes = Math.min(
					frameBytes - this.receivedBytes,
					chunk.byteLength - chunkOffset,
				);
				this.frame.set(
					chunk.subarray(chunkOffset, chunkOffset + payloadBytes),
					this.receivedBytes,
				);
				this.receivedBytes += payloadBytes;
				chunkOffset += payloadBytes;
				if (this.receivedBytes < frameBytes) break;

				messages.push(decodePayload(this.frame.subarray(4, frameBytes)));
				this.resetFrame();
			}
		} catch (error) {
			if (error instanceof OperationWorkerFrameError) {
				this.failure = error;
			}
			throw error;
		}

		return messages;
	}

	finish(): void {
		this.throwIfFailed();
		if (this.receivedBytes !== 0) {
			this.failure = new OperationWorkerFrameError("frame_truncated");
			throw this.failure;
		}
	}

	private readPayloadLength(): number {
		if (((this.frame[0] ?? 0) & 0x80) !== 0) {
			throw new OperationWorkerFrameError("frame_length_invalid");
		}
		const length = new DataView(
			this.frame.buffer,
			this.frame.byteOffset,
			4,
		).getUint32(0, false);
		if (length === 0) {
			throw new OperationWorkerFrameError("frame_zero_length");
		}
		if (length > protocolLimits.maxFrameBytes) {
			throw new OperationWorkerFrameError("frame_too_large");
		}
		return length;
	}

	private resetFrame(): void {
		this.frame = new Uint8Array(4);
		this.receivedBytes = 0;
		this.expectedPayloadBytes = undefined;
	}

	private throwIfFailed(): void {
		if (this.failure !== undefined) throw this.failure;
	}
}
