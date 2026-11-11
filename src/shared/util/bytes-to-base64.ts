/**
 * Chunk size for base64 conversion. 32 KiB keeps each
 * `String.fromCharCode.apply(null, chunk)` call well under V8's argument
 * limit (~65 535), avoiding the "Maximum call stack size exceeded" error
 * that the naive `String.fromCharCode(...bytes)` form hits on multi-MB
 * buffers (e.g. a downloaded preset that's several hundred KB or more).
 */
const BYTES_TO_BASE64_CHUNK = 0x8000;

/**
 * Encode a `Uint8Array` to a base64 string without overflowing the call
 * stack on large inputs.
 *
 * The naive `btoa(String.fromCharCode(...bytes))` is concise but spreads
 * every byte as a separate function argument, which blows the V8 arg cap
 * (and therefore the stack) for any non-trivial payload. We feed bytes
 * to `String.fromCharCode` in 32 KiB chunks instead, well under the
 * ~65 535 arg limit V8 enforces.
 */
export const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	for (let i = 0; i < bytes.length; i += BYTES_TO_BASE64_CHUNK) {
		const sub = bytes.subarray(
			i,
			Math.min(i + BYTES_TO_BASE64_CHUNK, bytes.length),
		);
		binary += String.fromCharCode(...sub);
	}
	return btoa(binary);
};
