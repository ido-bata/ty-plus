import { describe, expect, it } from "vitest";
import { canAttemptElevation, detectPlatform } from "./trusted-root-policy";

const winWithCepNode = (cepNode: unknown): Window =>
	({ cep_node: cepNode }) as unknown as Window;

describe("detectPlatform", () => {
	it("returns 'windows' on win32", () => {
		expect(
			detectPlatform(winWithCepNode({ process: { platform: "win32" } })),
		).toBe("windows");
	});

	it("returns 'mac' on darwin", () => {
		expect(
			detectPlatform(winWithCepNode({ process: { platform: "darwin" } })),
		).toBe("mac");
	});

	it("returns 'unknown' on linux", () => {
		expect(
			detectPlatform(winWithCepNode({ process: { platform: "linux" } })),
		).toBe("unknown");
	});

	it("returns 'unknown' when CEP node is unavailable", () => {
		expect(detectPlatform({} as Window)).toBe("unknown");
	});
});

describe("canAttemptElevation", () => {
	it("returns true when cep_node + child_process.execFileSync are available", () => {
		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({ execFileSync: () => undefined }),
		});
		expect(canAttemptElevation(win)).toBe(true);
	});

	it("returns false when cep_node is unavailable", () => {
		expect(canAttemptElevation({} as Window)).toBe(false);
	});

	it("returns false when require('child_process') is missing execFileSync", () => {
		const win = winWithCepNode({
			process: { platform: "win32" },
			require: () => ({}),
		});
		expect(canAttemptElevation(win)).toBe(false);
	});
});
