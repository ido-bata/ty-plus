import { afterEach, describe, expect, test, vi } from "vitest";

import config from "../cep.config";

const originalEnv = { ...process.env };

const loadConfigWithEnv = async (
	env: Record<string, string | undefined>,
) => {
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	vi.resetModules();
	return (await import("../cep.config")).default;
};

afterEach(() => {
	process.env = { ...originalEnv };
	vi.resetModules();
});

describe("CEP config", () => {
	test("loads the ExtendScript host bundle through manifest ScriptPath", () => {
		for (const panel of config.panels) {
			expect(panel.scriptPath).toBe("./jsx/ty-plus-host.jsx");
		}
	});
});

describe("CEP debug port band (#100)", () => {
	test("release builds keep the 89xx band", async () => {
		const cfg = await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: undefined,
			CEP_DEBUG_BASE: undefined,
		});
		expect(cfg.startingDebugPort).toBe(8970);
	});

	test("dev builds default to the 91xx band", async () => {
		const cfg = await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: "development",
			CEP_DEBUG_BASE: undefined,
		});
		expect(cfg.startingDebugPort).toBe(9170);
	});

	test("non-production NODE_ENV is treated as a dev build", async () => {
		const cfg = await loadConfigWithEnv({
			NODE_ENV: "development",
			TY_PLUS_CEP_BUILD_MODE: undefined,
			CEP_DEBUG_BASE: undefined,
		});
		expect(cfg.startingDebugPort).toBe(9170);
	});

	test("CEP_DEBUG_BASE overrides the band for both flavors", async () => {
		const dev = await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: "development",
			CEP_DEBUG_BASE: "9300",
		});
		expect(dev.startingDebugPort).toBe(9300);
		const rel = await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: undefined,
			CEP_DEBUG_BASE: "9300",
		});
		expect(rel.startingDebugPort).toBe(9300);
	});
});
