import { describe, expect, test, vi } from "vitest";
import type { AfterEffectsHostApi, HostFunctionCaller } from "./host/contract";
import { createAdapter } from "./host-bridge";

describe("After Effects host bridge", () => {
	test("propagates a getHostContext failure without manufacturing a fallback", async () => {
		const failure = new Error("host unavailable");
		const caller = vi.fn(async () => {
			throw failure;
		});

		await expect(createAdapter({ caller }).getHostContext()).rejects.toBe(
			failure,
		);
	});

	test("rejects an absent host context instead of returning empty roots", async () => {
		const caller: HostFunctionCaller = async <
			K extends keyof AfterEffectsHostApi,
		>(
			method: K,
		) => ({
			hostId: "after-effects" as const,
			method,
			value: undefined,
		});

		await expect(createAdapter({ caller }).getHostContext()).rejects.toThrow(
			"Host context unavailable",
		);
	});
});
