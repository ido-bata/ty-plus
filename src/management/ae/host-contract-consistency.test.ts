import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ALLOWED_HOST_METHODS } from "./cep/host-executor";
import type { AfterEffectsHostApi, HostFunctionCaller } from "./host/contract";
import { createAdapter } from "./host-bridge";

/**
 * Contract consistency guard (Issue #64).
 *
 * `getInstalledEffects` used to sit in `AfterEffectsHostApi` and the
 * `createAdapter` surface while missing from BOTH `ALLOWED_HOST_METHODS`
 * and the ExtendScript bundle's export table — every call failed with
 * "Host method is not allowed". The three declarations live in
 * different modules (and the ES3 bundle cannot import the contract), so
 * nothing but this test keeps them in lockstep.
 */

const caller: HostFunctionCaller = async <K extends keyof AfterEffectsHostApi>(
	method: K,
) => ({
	hostId: "after-effects" as const,
	method,
	value: undefined,
});

const adapterMethodNames = (): string[] => {
	const adapter = createAdapter({ caller });
	return Object.keys(adapter).filter(
		(key) =>
			typeof (adapter as unknown as Record<string, unknown>)[key] ===
			"function",
	);
};

const bundleExportNames = (): Set<string> => {
	const source = readFileSync(
		fileURLToPath(new URL("./jsx/host-bundle.ext.ts", import.meta.url)),
		"utf8",
	);
	const start = source.indexOf("const hostBundle = {");
	expect(start).toBeGreaterThan(-1);
	const end = source.indexOf("\n};", start);
	expect(end).toBeGreaterThan(start);
	const body = source.slice(start, end);
	const names = new Set<string>();
	// Callable exports only: `name: wrapCallable(...)`. Data properties
	// (`__schemaVersion`, `__bundleVersion`) and indentation quirks in the
	// ES3 bundle must not matter.
	for (const match of body.matchAll(
		/^\s*([A-Za-z_$][\w$]*)\s*:\s*wrapCallable/gm,
	)) {
		names.add(match[1]);
	}
	return names;
};

describe("host contract consistency", () => {
	test("every adapter method is allowed by the CEP executor", () => {
		for (const method of adapterMethodNames()) {
			expect(
				ALLOWED_HOST_METHODS.has(method as keyof AfterEffectsHostApi),
				`adapter exposes "${method}" but the executor allowlist rejects it`,
			).toBe(true);
		}
	});

	test("every allowlisted method exists on the adapter", () => {
		const methods = new Set(adapterMethodNames());
		for (const method of ALLOWED_HOST_METHODS) {
			expect(
				methods.has(method),
				`allowlist permits "${method}" but the adapter does not implement it`,
			).toBe(true);
		}
	});

	test("every contract method is exported by the ExtendScript host bundle", () => {
		const exports = bundleExportNames();
		for (const method of ALLOWED_HOST_METHODS) {
			expect(
				exports.has(method),
				`host bundle does not export "${method}"`,
			).toBe(true);
		}
	});
});
