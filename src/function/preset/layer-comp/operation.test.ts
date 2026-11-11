import { describe, expect, it, vi } from "vitest";
import { getPresetOperation } from "@/function/preset/operations";
import type { HostAdapter } from "@/management/ae/host/contract";

describe("plugin operation", () => {
	it("applies the effect by file stem", async () => {
		const mockApplyEffectByMatchName = vi.fn().mockResolvedValue(undefined);
		const host = {
			id: "after-effects",
			code: "AEFT",
			applyEffectByMatchName: mockApplyEffectByMatchName,
		} as unknown as HostAdapter;

		const op = getPresetOperation("plugin");
		const result = await op(host, {
			type: "plugin",
			filePath: "/path/to/effect.aex",
		});

		expect(mockApplyEffectByMatchName).toHaveBeenCalledOnce();
		expect(mockApplyEffectByMatchName).toHaveBeenCalledWith("effect");
		expect(result.action).toBe("applyEffectByMatchName");
	});
});
