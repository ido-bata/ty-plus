import { describe, expect, it, vi } from "vitest";
import { getPresetOperation } from "@/function/preset/operations";
import type { HostAdapter } from "@/management/ae/host/contract";

vi.mock("@/management/storage/candidates-cache/runtime", () => ({
	getCandidatesSnapshot: () => ({
		roots: [],
		rootFiles: [],
		pluginEffects: [
			{
				filePath: "/path/to/effect.aex",
				matchName: "ADBE effect",
				displayName: "effect",
			},
		],
	}),
}));

describe("plugin operation", () => {
	it("applies the catalog-resolved matchName, not the file stem", async () => {
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
		expect(mockApplyEffectByMatchName).toHaveBeenCalledWith("ADBE effect");
		expect(result.action).toBe("applyEffectByMatchName");
	});

	it("rejects when the plugin has no catalog matchName", async () => {
		const host = {
			id: "after-effects",
			code: "AEFT",
			applyEffectByMatchName: vi.fn(),
		} as unknown as HostAdapter;

		const op = getPresetOperation("plugin");
		await expect(
			op(host, { type: "plugin", filePath: "/path/to/unknown.aex" }),
		).rejects.toThrow(/No catalog matchName/);
	});
});
