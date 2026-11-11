import { describe, expect, it } from "vitest";

import {
	GetHostContextMethod,
	PluginEffectScanMethod,
	type PluginEffectScanRequest,
	type PluginEffectScanResult,
} from "./runtime-gateway";

describe("runtime-gateway", () => {
	it("PluginEffectScanMethod has correct name", () => {
		expect(PluginEffectScanMethod.name).toBe("plugin_effect_scan");
	});

	it("GetHostContextMethod has correct name", () => {
		expect(GetHostContextMethod.name).toBe("get_host_context");
	});

	it("PluginEffectScanRequest type is valid", () => {
		const request: PluginEffectScanRequest = {
			roots: ["/Plugins", "/Effects"],
		};
		expect(request.roots).toHaveLength(2);
	});

	it("PluginEffectScanResult type is valid", () => {
		const result: PluginEffectScanResult = {
			rows: [
				{
					file_path: "/Plugins/Blur.aex",
					match_name: "ADBE Gaussian Blur 2",
					display_name: "Gaussian Blur",
				},
			],
			warnings: [],
		};
		expect(result.rows).toHaveLength(1);
		expect(result.warnings).toHaveLength(0);
	});
});
