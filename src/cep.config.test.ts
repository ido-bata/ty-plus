import { afterEach, describe, expect, test, vi } from "vitest";

import config from "../cep.config";

const originalEnv = { ...process.env };

const loadConfigWithEnv = async (env: Record<string, string | undefined>) => {
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

describe("CEP debug port ephemeral-range guard (#682)", () => {
	// vite-cep-plugin assigns .debug ports sequentially from
	// startingDebugPort, one per panel per host.
	const portSpan = config.panels.length * config.hosts.length;
	const EPHEMERAL_FLOOR = 49152;

	test("warns when the .debug span reaches the ephemeral range", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		// last port = base + span - 1 = 49152 -> inside the ephemeral range.
		await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: undefined,
			CEP_DEBUG_BASE: String(EPHEMERAL_FLOOR - portSpan + 1),
		});
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("49152"));
	});

	test("does not warn while the whole span stays below the floor", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		// last port = base + span - 1 = 49151 -> still below the floor.
		await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: undefined,
			CEP_DEBUG_BASE: String(EPHEMERAL_FLOOR - portSpan),
		});
		expect(warn).not.toHaveBeenCalled();
	});

	test("does not warn for the built-in dev and release bands", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: undefined,
			CEP_DEBUG_BASE: undefined,
		});
		await loadConfigWithEnv({
			NODE_ENV: "production",
			TY_PLUS_CEP_BUILD_MODE: "development",
			CEP_DEBUG_BASE: undefined,
		});
		expect(warn).not.toHaveBeenCalled();
	});
});
