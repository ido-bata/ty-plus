import { describe, expect, it, vi } from "vitest";
import { getPresetOperation } from "@/function/preset/operations";
import type { HostAdapter } from "@/management/ae/host/contract";

describe("script operation", () => {
	it("calls host.runScriptFile with the preset filePath", async () => {
		const mockRunScriptFile = vi.fn().mockResolvedValue(undefined);
		const host = {
			id: "after-effects",
			code: "AEFT",
			runScriptFile: mockRunScriptFile,
		} as unknown as HostAdapter;

		const op = getPresetOperation("script");
		const result = await op(host, {
			type: "script",
			filePath: "/path/to/script.jsx",
		});

		expect(mockRunScriptFile).toHaveBeenCalledOnce();
		expect(mockRunScriptFile).toHaveBeenCalledWith("/path/to/script.jsx");
		expect(result.action).toBe("runScriptFile");
	});
});
