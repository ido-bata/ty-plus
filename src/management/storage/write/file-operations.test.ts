/**
 * Tests for writeBytesToFile (the JS-side wrapper around the ExtendScript
 * write script). The companion test file at
 * src/management/storage/file-operations.test.ts exercises the script
 * builders; this file exercises the wrapper's result-handling and the
 * post-write existence check.
 *
 * Bug regression: previously `writeBytesToFile` treated any non-error return
 * from ExtendScript as success. When the ExtendScript `File.write` silently
 * no-ops (e.g., the destination directory was unwritable at flush time, or
 * the path resolved to a file on a read-only volume), the wrapper returned
 * success and the caller proceeded to `upsertLocalPreset`, surfacing a
 * "Download complete" alert for a file that did not actually land on disk.
 *
 * Fix: the ExtendScript script returns the written file's `length` after
 * close; the wrapper compares that length with the requested byte count
 * and throws on mismatch.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/management/ae/cep/eval", () => ({
	evalScript: vi.fn(),
}));

import { evalScript } from "@/management/ae/cep/eval";
import { writeBytesToFile } from "./file-operations";

const win = {} as Window;

const bytes = (n: number): Uint8Array => {
	const out = new Uint8Array(n);
	for (let i = 0; i < n; i += 1) out[i] = i & 0xff;
	return out;
};

describe("writeBytesToFile (post-write existence check)", () => {
	beforeEach(() => {
		vi.mocked(evalScript).mockReset();
	});

	it("resolves when the ExtendScript script returns the exact byte count", async () => {
		const payload = bytes(2048);
		vi.mocked(evalScript).mockResolvedValueOnce(String(payload.length));

		await expect(
			writeBytesToFile(win, "C:/tmp/test.bin", payload),
		).resolves.toBeUndefined();
	});

	it("throws when the ExtendScript script returns a length smaller than the payload", async () => {
		// ExtendScript File.write silently returned early (or wrote fewer
		// bytes than requested). The wrapper must NOT treat this as success.
		const payload = bytes(2048);
		vi.mocked(evalScript).mockResolvedValueOnce("1024");

		await expect(
			writeBytesToFile(win, "C:/tmp/test.bin", payload),
		).rejects.toThrow(/writeBytesToFile/);
	});

	it("throws when the ExtendScript script returns zero (file missing after write)", async () => {
		const payload = bytes(1024);
		vi.mocked(evalScript).mockResolvedValueOnce("0");

		await expect(
			writeBytesToFile(win, "C:/tmp/test.bin", payload),
		).rejects.toThrow(/writeBytesToFile/);
	});

	it("throws when the ExtendScript script returns an empty result", async () => {
		// Legacy "silent success" — script returned undefined or empty. The
		// original wrapper swallowed this case; the fix rejects it.
		const payload = bytes(1024);
		vi.mocked(evalScript).mockResolvedValueOnce("");

		await expect(
			writeBytesToFile(win, "C:/tmp/test.bin", payload),
		).rejects.toThrow(/writeBytesToFile/);
	});

	it("throws when the ExtendScript script returns a non-numeric token", async () => {
		const payload = bytes(1024);
		vi.mocked(evalScript).mockResolvedValueOnce("permission denied");

		await expect(
			writeBytesToFile(win, "C:/tmp/test.bin", payload),
		).rejects.toThrow(/permission denied/);
	});

	it("rejects on length mismatch with the payload size in the error", async () => {
		const payload = bytes(4096);
		vi.mocked(evalScript).mockResolvedValueOnce("2048");

		await expect(
			writeBytesToFile(win, "C:/tmp/test.bin", payload),
		).rejects.toThrow(/4096/);
	});
});
