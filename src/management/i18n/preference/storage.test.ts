/**
 * Tests for preference/storage.ts
 *
 * Key behaviors tested:
 * - loadPreferenceFromFile: primary read from settings/ui.json
 * - savePreferenceToFile: write to settings/ui.json only (never legacy)
 * - loadPreferenceFromFile: fallback to legacy i18n-preference.json when
 *   settings/ui.json has no locale key
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../storage/persistence/managed-root", () => ({
	resolveWriteManagedRoot: vi.fn().mockResolvedValue("C:/mock/ty-plus"),
	resolveReadManagedRoot: vi.fn().mockResolvedValue("C:/mock/ty-plus"),
}));

const { loadPreferenceFromFile, savePreferenceToFile } = await import(
	"./storage"
);

// ── helpers ─────────────────────────────────────────────────────────────────────

const fakeWindowWithNodeFs = (fsMock: Record<string, unknown>) =>
	({
		cep_node: {
			require: () => fsMock,
		},
	}) as unknown as Window;

const withCepGateway = (hostSupportRoot: string | null) => {
	const orig = (globalThis as Record<string, unknown>).__cep_gateway;
	if (hostSupportRoot !== null) {
		(globalThis as Record<string, unknown>).__cep_gateway = {
			systemPaths: { hostSupportRoot },
		};
	} else {
		(globalThis as Record<string, unknown>).__cep_gateway = undefined;
	}
	return () => {
		if (orig !== undefined) {
			(globalThis as Record<string, unknown>).__cep_gateway = orig;
		} else {
			(globalThis as Record<string, unknown>).__cep_gateway = undefined;
		}
	};
};

// ── loadPreferenceFromFile ───────────────────────────────────────────────

describe("loadPreferenceFromFile", () => {
	it("returns locale from settings/ui.json when present", async () => {
		const unlisten = withCepGateway("/support");
		try {
			const win = fakeWindowWithNodeFs({
				promises: {
					readFile: async (_path: string) => '{"locale": "fr"}',
				},
			});
			const result = await loadPreferenceFromFile(win);
			expect(result).toBe("fr");
		} finally {
			unlisten();
		}
	});

	it("returns default when ui.json has no locale key", async () => {
		const unlisten = withCepGateway("/support");
		try {
			const win = fakeWindowWithNodeFs({
				promises: {
					readFile: async (_path: string) => '{"theme": "dark"}',
				},
			});
			const result = await loadPreferenceFromFile(win);
			expect(result).toBe("ja"); // DEFAULT_CEP_SHELL_LOCALE
		} finally {
			unlisten();
		}
	});

	it("returns default locale when no file exists", async () => {
		const unlisten = withCepGateway("/support");
		try {
			const win = fakeWindowWithNodeFs({
				promises: {
					readFile: async () => {
						throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
					},
				},
			});
			const result = await loadPreferenceFromFile(win);
			expect(result).toBe("ja"); // DEFAULT_CEP_SHELL_LOCALE
		} finally {
			unlisten();
		}
	});
});

// ── savePreferenceToFile ──────────────────────────────────────────────────

describe("savePreferenceToFile", () => {
	it("writes locale to settings/ui.json only", async () => {
		const writeCalls: Array<{ path: string; data: string }> = [];
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async () => "",
				writeFile: async (path: string, data: string) => {
					writeCalls.push({ path, data });
				},
				mkdir: async () => undefined,
			},
		});
		await savePreferenceToFile(win, "ko");
		// ADR-0006: the managed-root persistence lock also writes
		// `locks/persistence.lock/owner.json` through the same fs — only
		// the ui.json write is under test here.
		const uiWrites = writeCalls.filter((c) => c.path.endsWith("ui.json"));
		expect(uiWrites).toHaveLength(1);
		expect(uiWrites[0].path).toMatch(/ui\.json$/);
		expect(uiWrites[0].data).toBe('{\n  "locale": "ko"\n}\n');
	});

	it("merges locale with existing ui.json fields", async () => {
		let readCallCount = 0;
		const writeCalls: Array<{ path: string; data: string }> = [];
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async () => {
					readCallCount += 1;
					if (readCallCount === 1) {
						return '{"theme": "dark"}';
					}
					return "";
				},
				writeFile: async (path: string, data: string) => {
					writeCalls.push({ path, data });
				},
				mkdir: async () => undefined,
			},
		});
		await savePreferenceToFile(win, "pt");
		const uiWrites = writeCalls.filter((c) => c.path.endsWith("ui.json"));
		expect(uiWrites).toHaveLength(1);
		expect(uiWrites[0].data).toContain('"locale": "pt"');
		expect(uiWrites[0].data).toContain('"theme": "dark"');
	});

	it("does NOT write to legacy i18n-preference.json", async () => {
		const writtenPaths: string[] = [];
		const win = fakeWindowWithNodeFs({
			promises: {
				readFile: async () => "{}",
				writeFile: async (path: string, _data: string) => {
					writtenPaths.push(path);
				},
				mkdir: async () => undefined,
			},
		});
		await savePreferenceToFile(win, "en");
		// The persistence lock writes owner.json under locks/ — exclude it;
		// the assertion is about the legacy preference file specifically.
		const dataWrites = writtenPaths.filter((p) => !p.includes("locks/"));
		expect(dataWrites.every((p) => p.includes("ui.json"))).toBe(true);
		expect(dataWrites.some((p) => p.includes("i18n-preference.json"))).toBe(
			false,
		);
	});
});
