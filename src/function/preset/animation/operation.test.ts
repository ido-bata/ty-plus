import { describe, expect, it, vi } from "vitest";
import { getPresetOperation } from "@/function/preset/operations";
import type { HostAdapter } from "@/management/ae/host/contract";

describe("preset operation", () => {
	it("calls host.applyPreset with the preset filePath", async () => {
		const mockApplyPreset = vi.fn().mockResolvedValue(undefined);
		const host = {
			id: "after-effects",
			code: "AEFT",
			applyPreset: mockApplyPreset,
		} as unknown as HostAdapter;

		const op = getPresetOperation("preset");
		const result = await op(host, {
			type: "preset",
			filePath: "/path/to/animation.ffx",
		});

		expect(mockApplyPreset).toHaveBeenCalledOnce();
		expect(mockApplyPreset).toHaveBeenCalledWith("/path/to/animation.ffx");
		expect(result.action).toBe("applyPreset");
	});
});
