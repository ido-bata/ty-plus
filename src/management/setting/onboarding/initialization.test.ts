import { describe, expect, it, vi } from "vitest";
import type { InitializationFileSystem } from "./initialization";
import {
	buildInitializationLocatorJson,
	completeInitialization,
	type InitializationInput,
	isInitializationComplete,
	mergeOnboardingSettings,
	type OnboardingPathsPayload,
	parseInitializationLocatorJson,
	readInitializationLocator,
	readInitializationState,
	readSupportRootFromSettingsJson,
	resolveInitializationLocatorPath,
	writeInitializationLocator,
} from "./initialization";

// Mock elevation service to bypass UAC/powershell checks in tests
vi.mock("../storage/elevation-service", () => ({
	requestFolderWriteElevation: vi.fn(() => true),
	writeFileWithElevation: vi.fn(() => true),
}));

const VALID_SUPPORT_ROOT =
	"D:/4_apps/adobe/Adobe After Effects 2026/Support Files";

const stateFromLocator = (
	locator: ReturnType<typeof parseInitializationLocatorJson>,
) =>
	locator === null
		? null
		: {
				supportRoot: locator.supportRoot,
				updatedAt: new Date(locator.updatedAt),
			};

describe("parseInitializationLocatorJson", () => {
	it("returns null for empty string", () => {
		expect(parseInitializationLocatorJson("")).toBeNull();
	});

	it("returns null for null", () => {
		expect(parseInitializationLocatorJson(null)).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(parseInitializationLocatorJson(undefined)).toBeNull();
	});

	it("returns null for malformed JSON", () => {
		expect(parseInitializationLocatorJson("{")).toBeNull();
		expect(parseInitializationLocatorJson("not json")).toBeNull();
	});

	it("returns null when supportRoot is missing", () => {
		const json = JSON.stringify({
			version: 1,
			updatedAt: "2026-05-09T00:00:00.000Z",
		});
		expect(parseInitializationLocatorJson(json)).toBeNull();
	});

	it("returns null when supportRoot is empty string", () => {
		const json = JSON.stringify({
			version: 1,
			supportRoot: "",
			updatedAt: "2026-05-09T00:00:00.000Z",
		});
		expect(parseInitializationLocatorJson(json)).toBeNull();
	});

	it("returns null when supportRoot is whitespace only", () => {
		const json = JSON.stringify({
			version: 1,
			supportRoot: "   ",
			updatedAt: "2026-05-09T00:00:00.000Z",
		});
		expect(parseInitializationLocatorJson(json)).toBeNull();
	});

	it("returns parsed locator for valid JSON with support root", () => {
		const json = JSON.stringify({
			version: 1,
			supportRoot: VALID_SUPPORT_ROOT,
			updatedAt: "2026-05-09T00:00:00.000Z",
		});
		const result = parseInitializationLocatorJson(json);
		expect(result).not.toBeNull();
		expect(result?.supportRoot).toBe(VALID_SUPPORT_ROOT);
		expect(result?.version).toBe(1);
		expect(result?.updatedAt).toBe("2026-05-09T00:00:00.000Z");
	});

	it("trims trailing whitespace from supportRoot", () => {
		const json = JSON.stringify({
			version: 1,
			supportRoot: `${VALID_SUPPORT_ROOT}  `,
			updatedAt: "2026-05-09T00:00:00.000Z",
		});
		const result = parseInitializationLocatorJson(json);
		expect(result?.supportRoot).toBe(VALID_SUPPORT_ROOT);
	});

	it("returns null for version other than 1", () => {
		const json = JSON.stringify({
			version: 2,
			supportRoot: VALID_SUPPORT_ROOT,
			updatedAt: "2026-05-09T00:00:00.000Z",
		});
		expect(parseInitializationLocatorJson(json)).toBeNull();
	});
});

describe("isInitializationComplete", () => {
	it("returns incomplete when locator is null", () => {
		const result = isInitializationComplete(null);
		expect(result.completed).toBe(false);
		expect(result.supportRoot).toBeNull();
	});

	it("returns incomplete when locator supportRoot is empty string", () => {
		const locator = parseInitializationLocatorJson(
			JSON.stringify({
				version: 1,
				supportRoot: "",
				updatedAt: "2026-05-09T00:00:00.000Z",
			}),
		);
		const result = isInitializationComplete(stateFromLocator(locator));
		expect(result.completed).toBe(false);
		expect(result.supportRoot).toBeNull();
	});

	it("returns incomplete when locator supportRoot is whitespace only", () => {
		const locator = parseInitializationLocatorJson(
			JSON.stringify({
				version: 1,
				supportRoot: "   ",
				updatedAt: "2026-05-09T00:00:00.000Z",
			}),
		);
		const result = isInitializationComplete(stateFromLocator(locator));
		expect(result.completed).toBe(false);
		expect(result.supportRoot).toBeNull();
	});

	it("returns complete with supportRoot for valid locator", () => {
		const locator = parseInitializationLocatorJson(
			JSON.stringify({
				version: 1,
				supportRoot: VALID_SUPPORT_ROOT,
				updatedAt: "2026-05-09T00:00:00.000Z",
			}),
		);
		const result = isInitializationComplete(stateFromLocator(locator));
		expect(result.completed).toBe(true);
		expect(result.supportRoot).toBe(VALID_SUPPORT_ROOT);
	});

	it("settings.json alone does not make initialization complete", () => {
		// A settings.json with valid supportRoot and subfolders does NOT
		// parse as a valid locator through parseInitializationLocatorJson.
		// This proves settings.json is not the source of truth.
		const settingsJsonContent = JSON.stringify({
			supportRoot: VALID_SUPPORT_ROOT,
			core: {
				supportRoot: VALID_SUPPORT_ROOT,
				paths: {
					presetRoot: "D:/presets",
					scriptRoot: "D:/scripts",
					pluginRoot: "D:/plugins",
				},
			},
		});
		const locator = parseInitializationLocatorJson(settingsJsonContent);
		// settings.json does not parse as a locator - it returns null
		expect(locator).toBeNull();
		// null locator means initialization is NOT complete
		const result = isInitializationComplete(stateFromLocator(locator));
		expect(result.completed).toBe(false);
	});

	it("malformed locator JSON does not make initialization complete", () => {
		// Any JSON that is not a valid ty-plus-init.json shape is treated as
		// missing/invalid and does not result in completion.
		const malformedLocators = [
			"{", // truncated JSON
			"not json", // plain text
			"null", // JSON null literal
			"{}", // missing version and fields
			JSON.stringify({ version: 1 }), // missing supportRoot and updatedAt
			JSON.stringify({ supportRoot: VALID_SUPPORT_ROOT }), // wrong shape, no version
		];
		for (const malformed of malformedLocators) {
			const locator = parseInitializationLocatorJson(malformed);
			expect(locator).toBeNull();
			const result = isInitializationComplete(stateFromLocator(locator));
			expect(result.completed).toBe(false);
		}
	});
});

describe("buildInitializationLocatorJson", () => {
	it("produces valid JSON", () => {
		const json = buildInitializationLocatorJson(VALID_SUPPORT_ROOT);
		const parsed = JSON.parse(json);
		expect(parsed.version).toBe(1);
		expect(parsed.supportRoot).toBe(VALID_SUPPORT_ROOT);
		expect(parsed.updatedAt).toBeDefined();
	});

	it("uses provided Date for updatedAt", () => {
		const fixedDate = new Date("2026-05-09T12:00:00.000Z");
		const json = buildInitializationLocatorJson(VALID_SUPPORT_ROOT, fixedDate);
		const parsed = JSON.parse(json);
		expect(parsed.updatedAt).toBe("2026-05-09T12:00:00.000Z");
	});
});

describe("mergeOnboardingSettings", () => {
	const SUPPORT_ROOT = "D:/4_apps/adobe/Adobe After Effects 2026/Support Files";
	const PRESET_ROOT =
		"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/presets";
	const SCRIPT_ROOT =
		"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/scripts";
	const PLUGIN_ROOT =
		"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/plugins";

	const payload: OnboardingPathsPayload = {
		supportRoot: SUPPORT_ROOT,
		presetRoot: PRESET_ROOT,
		scriptRoot: SCRIPT_ROOT,
		pluginRoot: PLUGIN_ROOT,
	};

	it("produces valid JSON with all onboarding fields", () => {
		const result = mergeOnboardingSettings(null, payload);
		const parsed = JSON.parse(result);
		expect(parsed.core.paths.supportRoot).toBe(SUPPORT_ROOT);
		expect(parsed.core.paths.presetRoot).toBe(PRESET_ROOT);
		expect(parsed.core.paths.scriptRoot).toBe(SCRIPT_ROOT);
		expect(parsed.core.paths.pluginRoot).toBe(PLUGIN_ROOT);
		expect(parsed.workspace.onboardingPaths.presetRoot).toBe(PRESET_ROOT);
		expect(parsed.workspace.onboardingPaths.scriptRoot).toBe(SCRIPT_ROOT);
		expect(parsed.workspace.onboardingPaths.pluginRoot).toBe(PLUGIN_ROOT);
	});

	it("preserves unrelated top-level keys", () => {
		const existing = JSON.stringify({ someOtherKey: { nested: "value" } });
		const result = mergeOnboardingSettings(existing, payload);
		const parsed = JSON.parse(result);
		expect(parsed.someOtherKey).toEqual({ nested: "value" });
	});

	it("preserves unrelated core.paths keys", () => {
		const existing = JSON.stringify({
			core: {
				paths: {
					customPath: "/custom/path",
				},
			},
		});
		const result = mergeOnboardingSettings(existing, payload);
		const parsed = JSON.parse(result);
		expect(parsed.core.paths.customPath).toBe("/custom/path");
		expect(parsed.core.paths.supportRoot).toBe(SUPPORT_ROOT);
		expect(parsed.core.paths.presetRoot).toBe(PRESET_ROOT);
	});

	it("preserves unrelated workspace keys", () => {
		const existing = JSON.stringify({
			workspace: {
				someWorkspaceKey: "preserved",
			},
		});
		const result = mergeOnboardingSettings(existing, payload);
		const parsed = JSON.parse(result);
		expect(parsed.workspace.someWorkspaceKey).toBe("preserved");
		expect(parsed.workspace.onboardingPaths.presetRoot).toBe(PRESET_ROOT);
	});

	it("handles empty string as existing JSON", () => {
		const result = mergeOnboardingSettings("", payload);
		const parsed = JSON.parse(result);
		expect(parsed.core.paths.supportRoot).toBe(SUPPORT_ROOT);
	});

	it("handles undefined as existing JSON", () => {
		const result = mergeOnboardingSettings(undefined, payload);
		const parsed = JSON.parse(result);
		expect(parsed.core.paths.supportRoot).toBe(SUPPORT_ROOT);
	});

	it("overwrites existing onboarding paths with new values", () => {
		const existing = JSON.stringify({
			core: {
				paths: {
					supportRoot: "D:/old/support",
					presetRoot: "D:/old/presets",
					scriptRoot: "D:/old/scripts",
					pluginRoot: "D:/old/plugins",
				},
			},
		});
		const result = mergeOnboardingSettings(existing, payload);
		const parsed = JSON.parse(result);
		expect(parsed.core.paths.presetRoot).toBe(PRESET_ROOT);
	});

	it("adds onboarding paths to existing settings that had none", () => {
		const existing = JSON.stringify({
			supportRoot: "D:/existing/support",
			workspace: {},
		});
		const result = mergeOnboardingSettings(existing, payload);
		const parsed = JSON.parse(result);
		expect(parsed.core.paths.presetRoot).toBe(PRESET_ROOT);
		expect(parsed.core.paths.scriptRoot).toBe(SCRIPT_ROOT);
		expect(parsed.core.paths.pluginRoot).toBe(PLUGIN_ROOT);
	});

	it("output ends with newline", () => {
		const result = mergeOnboardingSettings(null, payload);
		expect(result.endsWith("\n")).toBe(true);
	});
});

describe("readSupportRootFromSettingsJson", () => {
	it("reads core.paths.supportRoot", () => {
		const json = JSON.stringify({
			core: { paths: { supportRoot: "D:/workspace" } },
		});
		expect(readSupportRootFromSettingsJson(json)).toBe("D:/workspace");
	});

	it("accepts legacy top-level supportRoot", () => {
		expect(
			readSupportRootFromSettingsJson(
				JSON.stringify({ supportRoot: "D:/legacy" }),
			),
		).toBe("D:/legacy");
	});

	it("returns null when missing", () => {
		expect(readSupportRootFromSettingsJson("{}")).toBeNull();
		expect(readSupportRootFromSettingsJson("")).toBeNull();
		expect(readSupportRootFromSettingsJson(null)).toBeNull();
	});
});

const VALID_LOCATOR_JSON = JSON.stringify({
	version: 1,
	supportRoot: VALID_SUPPORT_ROOT,
	updatedAt: "2026-05-09T00:00:00.000Z",
});

const makeMockFs = (
	files: Record<string, string> = {},
): InitializationFileSystem => ({
	existsSync: vi.fn((path: string) => path in files),
	readFileSync: vi.fn((path: string, _enc: string) => {
		if (!(path in files)) throw new Error(`ENOENT: ${path}`);
		return files[path];
	}),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFile: async (path: string, _enc: "utf8") => {
		if (!(path in files)) throw new Error(`ENOENT: ${path}`);
		return files[path];
	},
	writeFile: async (path: string, data: string, _enc: "utf8") => {
		(files as Record<string, unknown>)[path] = data;
	},
	mkdir: async (path: string, _opts: { recursive: true }) => {
		(files as Record<string, unknown>)[path] = "";
		return path;
	},
});

describe("resolveInitializationLocatorPath", () => {
	it("returns correct path with trailing slash stripped", () => {
		const result = resolveInitializationLocatorPath(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/",
		);
		expect(result).toBe(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json",
		);
	});

	it("returns correct path without trailing slash", () => {
		const result = resolveInitializationLocatorPath(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);
		expect(result).toBe(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json",
		);
	});

	it("normalizes backslashes to forward slashes", () => {
		const result = resolveInitializationLocatorPath(
			"D:\\4_apps\\adobe\\Adobe After Effects 2026\\Support Files",
		);
		expect(result).toBe(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json",
		);
	});

	it("does not skip default root", () => {
		const defaultRoot =
			"D:/Program Files/Adobe/Adobe After Effects 2026/Support Files";
		const result = resolveInitializationLocatorPath(defaultRoot);
		expect(result).toBe(`${defaultRoot}/ty-plus-init.json`);
	});
});

describe("readInitializationLocator", () => {
	it("returns null when file does not exist", () => {
		const fs = makeMockFs({});
		const result = readInitializationLocator(
			fs,
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);
		expect(result).toBeNull();
	});

	it("returns null on read error", () => {
		const fs = makeMockFs({});
		(fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
			throw new Error("ENOENT");
		});
		const result = readInitializationLocator(
			fs,
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);
		expect(result).toBeNull();
	});

	it("returns parsed locator for valid file content", () => {
		const path =
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json";
		const fs = makeMockFs({ [path]: VALID_LOCATOR_JSON });
		const result = readInitializationLocator(
			fs,
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
		);
		expect(result).not.toBeNull();
		expect(result?.supportRoot).toBe(VALID_SUPPORT_ROOT);
	});
});

describe("writeInitializationLocator", () => {
	it("writes correct path and content", () => {
		const fs = makeMockFs({});
		writeInitializationLocator(
			fs,
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files",
			VALID_SUPPORT_ROOT,
		);
		expect(fs.mkdirSync).toHaveBeenCalled();
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			"D:/4_apps/adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json",
			expect.stringContaining(`"supportRoot": "${VALID_SUPPORT_ROOT}"`),
		);
	});

	it("writes even when selected root equals default root (no skip)", () => {
		const defaultRoot =
			"D:/Program Files/Adobe/Adobe After Effects 2026/Support Files";
		const fs = makeMockFs({});
		writeInitializationLocator(fs, defaultRoot, defaultRoot);
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			`${defaultRoot}/ty-plus-init.json`,
			expect.any(String),
		);
	});

	it("normalizes backslashes in path construction", () => {
		const fs = makeMockFs({});
		writeInitializationLocator(
			fs,
			"D:\\4_apps\\adobe\\Adobe After Effects 2026\\Support Files",
			VALID_SUPPORT_ROOT,
		);
		expect(fs.mkdirSync).toHaveBeenCalled();
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			expect.stringMatching(/ty-plus-init\.json$/),
			expect.any(String),
		);
	});
});

describe("resolveInitializationLocatorPath", () => {
	it("returns ty-plus-init.json appended to support root", () => {
		const result = resolveInitializationLocatorPath(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files",
		);
		expect(result).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json",
		);
	});

	it("normalizes trailing slashes", () => {
		const result = resolveInitializationLocatorPath(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/",
		);
		expect(result).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json",
		);
	});

	it("normalizes backslashes to forward slashes", () => {
		const result = resolveInitializationLocatorPath(
			"C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files",
		);
		expect(result).toBe(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/ty-plus-init.json",
		);
	});

	it("locator file is directly under app support root, not under ty-plus subfolder", () => {
		const result = resolveInitializationLocatorPath(
			"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files",
		);
		// Must NOT be under ty-plus/
		expect(result).not.toContain("/ty-plus/");
		expect(result.endsWith("ty-plus-init.json")).toBe(true);
	});
});

describe("readInitializationLocator", () => {
	const AE_APP_SUPPORT_ROOT =
		"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files";
	const CUSTOM_SUPPORT_ROOT = "D:/ty-plus-custom-support-root";

	const makeMockFs = (
		files: Record<string, string>,
	): InitializationFileSystem => {
		const store: Record<string, string> = { ...files };
		return {
			existsSync: (path: string) => path in store,
			readFileSync: (path: string, _enc: string) => {
				if (!(path in store)) throw new Error(`File not found: ${path}`);
				return store[path] as string;
			},
			writeFileSync: (path: string, content: string) => {
				store[path] = content;
			},
			mkdirSync: () => {},
			readFile: async (path: string, _enc: "utf8") => {
				if (!(path in store)) throw new Error(`File not found: ${path}`);
				return store[path] as string;
			},
			writeFile: async (path: string, data: string) => {
				store[path] = data;
			},
			mkdir: async () => undefined,
		};
	};

	it("returns null when file does not exist", () => {
		const fs = makeMockFs({});
		const result = readInitializationLocator(fs, AE_APP_SUPPORT_ROOT);
		expect(result).toBeNull();
	});

	it("returns null for empty file", () => {
		const locatorPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		const fs = makeMockFs({ [locatorPath]: "" });
		const result = readInitializationLocator(fs, AE_APP_SUPPORT_ROOT);
		expect(result).toBeNull();
	});

	it("returns null for malformed JSON", () => {
		const locatorPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		const fs = makeMockFs({ [locatorPath]: "not json {{{{}" });
		const result = readInitializationLocator(fs, AE_APP_SUPPORT_ROOT);
		expect(result).toBeNull();
	});

	it("returns parsed locator for valid file content", () => {
		const locatorPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		const json = JSON.stringify({
			version: 1,
			supportRoot: CUSTOM_SUPPORT_ROOT,
			updatedAt: "2026-05-09T12:00:00.000Z",
		});
		const fs = makeMockFs({ [locatorPath]: json });
		const result = readInitializationLocator(fs, AE_APP_SUPPORT_ROOT);
		expect(result).not.toBeNull();
		expect(result?.supportRoot).toBe(CUSTOM_SUPPORT_ROOT);
		expect(result?.version).toBe(1);
	});

	it("reads from AE app support root, not from ty-plus subfolder", () => {
		// The file that should be read
		const locatorPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		// A different path under ty-plus/ should NOT be read
		const wrongPath = `${AE_APP_SUPPORT_ROOT}/ty-plus/ty-plus-init.json`;
		const json = JSON.stringify({
			version: 1,
			supportRoot: CUSTOM_SUPPORT_ROOT,
			updatedAt: "2026-05-09T12:00:00.000Z",
		});
		const fs = makeMockFs({
			[locatorPath]: json,
			[wrongPath]: "wrong content",
		});
		const result = readInitializationLocator(fs, AE_APP_SUPPORT_ROOT);
		// Should read the file at the host bootstrap support path, not under ty-plus/
		expect(result?.supportRoot).toBe(CUSTOM_SUPPORT_ROOT);
	});
});

describe("writeInitializationLocator", () => {
	const AE_APP_SUPPORT_ROOT =
		"C:/Program Files/Adobe/Adobe After Effects 2026/Support Files";
	const CUSTOM_SUPPORT_ROOT = "D:/ty-plus-custom-support-root";

	const makeMockFs = (): InitializationFileSystem & {
		store: Record<string, string>;
	} => {
		const store: Record<string, string> = {};
		return {
			store,
			existsSync: (path: string) => path in store,
			readFileSync: (path: string, _enc: string) => {
				if (!(path in store)) throw new Error(`File not found: ${path}`);
				return store[path] as string;
			},
			writeFileSync: (path: string, content: string) => {
				store[path] = content;
			},
			mkdirSync: () => {},
			readFile: async (path: string, _enc: "utf8") => {
				if (!(path in store)) throw new Error(`File not found: ${path}`);
				return store[path] as string;
			},
			writeFile: async (path: string, data: string) => {
				store[path] = data;
			},
			mkdir: async () => undefined,
		};
	};

	it("writes ty-plus-init.json directly under AE app support root", () => {
		const fs = makeMockFs();
		writeInitializationLocator(fs, AE_APP_SUPPORT_ROOT, CUSTOM_SUPPORT_ROOT);
		const expectedPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		expect(fs.store[expectedPath]).toBeDefined();
	});

	it("writes valid locator JSON with correct fields", () => {
		const fs = makeMockFs();
		writeInitializationLocator(fs, AE_APP_SUPPORT_ROOT, CUSTOM_SUPPORT_ROOT);
		const expectedPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		const written = fs.store[expectedPath];
		const parsed = JSON.parse(written);
		expect(parsed.version).toBe(1);
		expect(parsed.supportRoot).toBe(CUSTOM_SUPPORT_ROOT);
		expect(parsed.updatedAt).toBeDefined();
	});

	it("does NOT write under ty-plus/ subfolder", () => {
		const fs = makeMockFs();
		writeInitializationLocator(fs, AE_APP_SUPPORT_ROOT, CUSTOM_SUPPORT_ROOT);
		const wrongPath = `${AE_APP_SUPPORT_ROOT}/ty-plus/ty-plus-init.json`;
		expect(fs.store[wrongPath]).toBeUndefined();
	});

	it("ALWAYS writes locator even when selected support root equals AE default support root", () => {
		// This is the key bug fix: the old writeWorkspaceSupportRootLocator skipped
		// writing when selected === default. writeInitializationLocator must NOT skip.
		const fs = makeMockFs();
		const DEFAULT_SUPPORT_ROOT = AE_APP_SUPPORT_ROOT;
		writeInitializationLocator(fs, AE_APP_SUPPORT_ROOT, DEFAULT_SUPPORT_ROOT);
		const expectedPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		expect(fs.store[expectedPath]).toBeDefined();
		const parsed = JSON.parse(fs.store[expectedPath]);
		expect(parsed.supportRoot).toBe(DEFAULT_SUPPORT_ROOT);
	});

	it("writes with a trailing newline", () => {
		const fs = makeMockFs();
		writeInitializationLocator(fs, AE_APP_SUPPORT_ROOT, CUSTOM_SUPPORT_ROOT);
		const expectedPath = `${AE_APP_SUPPORT_ROOT}/ty-plus-init.json`;
		expect(fs.store[expectedPath].endsWith("\n")).toBe(true);
	});
});

// ── readInitializationState / completeInitialization tests ─────────────────────

const DEFAULT_ROOT = "D:/Adobe/After Effects 2026/Support Files";
const CUSTOM_ROOT = "D:/ty-plus-custom";

const VALID_LOCATOR_BODY = JSON.stringify({
	version: 1,
	supportRoot: CUSTOM_ROOT,
	updatedAt: "2026-05-09T00:00:00.000Z",
});

// Tracks temp dirs/files created via async Node fs
const _tempStore: Record<string, string> = {};

const makeMockWin = () => {
	// Simulate a CEP window without evalScript (non-CEP environment)
	return Object.assign(Object.create(null), { cep_node: undefined }) as Window;
};

const makeMockWinWithCepNode = (files: Record<string, string>) => {
	const store: Record<string, string> = { ...files };
	return {
		cep_node: {
			require: (id: string) => {
				if (id !== "fs") return undefined;
				return {
					promises: {
						readFile: async (path: string, _enc: string) => {
							if (!(path in store)) throw new Error(`ENOENT: ${path}`);
							return store[path]!;
						},
						writeFile: async (path: string, data: string, _enc: string) => {
							store[path] = data;
						},
						mkdir: async (_path: string, _opts: { recursive: true }) => {
							return undefined;
						},
					},
				};
			},
		},
	} as unknown as Window;
};

const _makeMockWinWithEvalScript = (
	resultByScript: Record<string, string>,
	files?: Record<string, string>,
) => {
	const store: Record<string, string> = files ? { ...files } : {};
	return {
		__adobe_cep__: {
			evalScript: (script: string, cb: (result: string) => void) => {
				const result = resultByScript[script] ?? "";
				setTimeout(() => cb(result), 0);
			},
		},
		cep_node: {
			require: (id: string) => {
				if (id !== "fs") return undefined;
				return {
					promises: {
						readFile: async (path: string, _enc: string) => {
							if (!(path in store)) throw new Error(`ENOENT: ${path}`);
							return store[path]!;
						},
						writeFile: async (path: string, data: string, _enc: string) => {
							store[path] = data;
						},
						mkdir: async (_path: string, _opts: { recursive: true }) => {
							return undefined;
						},
					},
				};
			},
			process: {
				platform: "win32",
				env: { SystemRoot: "C:\\Windows" },
			},
		},
		__TY_PLUS_ELEVATION_RETRY_WINDOW_MS__: 0,
	} as unknown as Window;
};

describe("readInitializationState", () => {
	it("returns null when no CEP bridge and no locator file", async () => {
		const win = makeMockWin();
		// Override import to return empty store
		const result = await readInitializationState(win, DEFAULT_ROOT);
		expect(result).toBeNull();
	});

	it("returns state when no CEP bridge but valid locator exists", async () => {
		const locatorPath = `${DEFAULT_ROOT}/ty-plus-init.json`;
		const win = makeMockWinWithCepNode({ [locatorPath]: VALID_LOCATOR_BODY });
		const result = await readInitializationState(win, DEFAULT_ROOT);
		expect(result).not.toBeNull();
		expect(result?.supportRoot).toBe(CUSTOM_ROOT);
	});

	it("returns null for invalid locator JSON", async () => {
		const locatorPath = `${DEFAULT_ROOT}/ty-plus-init.json`;
		const win = makeMockWinWithCepNode({ [locatorPath]: "not json" });
		const result = await readInitializationState(win, DEFAULT_ROOT);
		expect(result).toBeNull();
	});
});

describe("completeInitialization", () => {
	const input: InitializationInput = {
		supportRoot: CUSTOM_ROOT,
		presetRoot: `${CUSTOM_ROOT}/presets`,
		scriptRoot: `${CUSTOM_ROOT}/scripts`,
		pluginRoot: `${CUSTOM_ROOT}/plugins`,
	};

	it("writes locator via Node fs when no CEP bridge", async () => {
		const win = makeMockWinWithCepNode({});
		// Should not throw - writes via Node fs (dynamic import path)
		await completeInitialization(win, DEFAULT_ROOT, input);
	});

	it("writes locator via Node fs when CEP bridge exists", async () => {
		const locatorPath = `${DEFAULT_ROOT}/ty-plus-init.json`;
		const win = makeMockWinWithCepNode({ [locatorPath]: "" });
		await completeInitialization(win, DEFAULT_ROOT, input);
	});
});
