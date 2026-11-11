import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "./bytes-to-base64";

describe("bytesToBase64", () => {
	it("matches the naive spread encoder for a small buffer", () => {
		// The contract: same output as `btoa(String.fromCharCode(...bytes))`
		// for any buffer, so existing callers that round-trip the string
		// through `atob` are not affected by the chunked implementation.
		const bytes = new Uint8Array([72, 101, 108, 108, 111, 33]); // "Hello!"
		expect(bytesToBase64(bytes)).toBe("SGVsbG8h");
	});

	it("returns an empty string for an empty buffer", () => {
		expect(bytesToBase64(new Uint8Array(0))).toBe("");
	});

	it("round-trips through atob to the original bytes", () => {
		// Sanity: re-decoding must give back the exact byte sequence, even
		// when the buffer crosses a chunk boundary.
		const original = new Uint8Array(70_000);
		for (let i = 0; i < original.length; i += 1) {
			original[i] = (i * 31 + 7) & 0xff;
		}
		const encoded = bytesToBase64(original);
		const decoded = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));
		expect(Array.from(decoded)).toEqual(Array.from(original));
	});

	it("does not overflow the call stack on a multi-MB buffer", () => {
		// Regression: the previous `String.fromCharCode(...bytes)` form hit
		// V8's argument-list limit (≈65 535) on buffers above ~64 KB and
		// threw "Maximum call stack size exceeded". A 2 MB buffer exercises
		// multiple chunks and must encode without error.
		const big = new Uint8Array(2_000_000);
		for (let i = 0; i < big.length; i += 1) {
			big[i] = i & 0xff;
		}
		let encoded: string;
		expect(() => {
			encoded = bytesToBase64(big);
		}).not.toThrow();
		// Base64 length is 4 * ceil(n / 3) — verify the encoder didn't
		// silently truncate the input.
		const expectedLen = Math.ceil(big.length / 3) * 4;
		expect(encoded!.length).toBe(expectedLen);
	});

	it("encodes binary data (0xff) correctly across chunk boundaries", () => {
		// 0xff is the most error-prone byte for hand-rolled encoders because
		// it produces "w" in base64. A 32 KiB + 1 buffer straddles exactly
		// one chunk boundary and must encode every byte.
		const bytes = new Uint8Array(0x8001).fill(0xff);
		const encoded = bytesToBase64(bytes);
		const decoded = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));
		expect(Array.from(decoded)).toEqual(Array.from(bytes));
	});
});
