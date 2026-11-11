/**
 * Tests for workspace-ui-settings-file.ts
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	_resetBusForTests,
	_setDevConsoleEnabled,
	getEntries,
} from "@/management/debug/logger";
import {
	ensureUiSettingsFile,
	readUiSettings,
	writeUiSettings,
} from "./workspace-ui-settings-file";

beforeEach(() => {
	_resetBusForTests();
	_setDevConsoleEnabled(false);
});

/** Actions of the skipped-write diagnostic (Issue #216). */
const skipActions = (): string[] =>
	getEntries()
		.map((entry) => entry.action ?? "")
		.filter((action) => action.endsWith(":skipped-no-root"));

// ── Fake window builders ─────────────────────────────────────────────────────

/**
 * Creates a fake Window with CSInterface and cep_node fs mock.
 */
const fakeWindowWithCsInterfaceAndFs = (
	supportRoot: string,
	fsMock: Record<string, unknown>,
) =>
	({
		CSInterface: function (this: { getSystemPath: () => string }) {
			this.getSystemPath = () => supportRoot;
		},
		cep_node: {
			require: () => fsMock,
		},
	}) as unknown as Window;

/**
 * Creates a fake Window with __adobe_cep__ and cep_node fs mock.
 */
const _fakeWindowWithAdobeCepAndFs = (
	supportRoot: string,
	fsMock: Record<string, unknown>,
) =>
	({
		__adobe_cep__: {
			getSystemPath: () => supportRoot,
		},
		cep_node: {
			require: () => fsMock,
		},
	}) as unknown as Window;

/**
 * Creates a fake Window with cep_node only (no support root APIs).
 */
const fakeWindowWithNodeFsOnly = (fsMock: Record<string, unknown>) =>
	({
		cep_node: {
			require: () => fsMock,
		},
	}) as unknown as Window;

// ── Test helpers ─────────────────────────────────────────────────────────────

const makeUiSettingsJson = (
	overrides: Partial<{
		version: number;
		showGridOverlay: boolean;
		showPresetLabels: boolean;
		selectedFont: string;
	}> = {},
) =>
	JSON.stringify(
		{
			version: 1,
			showGridOverlay: true,
			showPresetLabels: true,
			selectedFont: "",
			...overrides,
		},
		null,
		2,
	);

// ── readUiSettings ──────────────────────────────────────────────────

describe("readUiSettings", () => {
	it("returns parsed settings when file exists and is valid", async () => {
		const uiJson = makeUiSettingsJson({
			showGridOverlay: false,
			showPresetLabels: false,
			selectedFont: "Helvetica",
		});
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (path: string) => {
					if (path.includes("ty-plus/settings/ui.json")) {
						return uiJson;
					}
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
			},
		});

		const result = await readUiSettings(win);

		expect(result.showGridOverlay).toBe(false);
		expect(result.showPresetLabels).toBe(false);
		expect(result.selectedFont).toBe("Helvetica");
	});

	it("returns defaults when file is missing", async () => {
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
			},
		});

		const result = await readUiSettings(win);

		expect(result.showGridOverlay).toBe(true);
		expect(result.showPresetLabels).toBe(true);
		expect(result.selectedFont).toBe("");
	});

	it("returns defaults when file is empty", async () => {
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (_path: string) => "",
			},
		});

		const result = await readUiSettings(win);

		expect(result.showGridOverlay).toBe(true);
		expect(result.showPresetLabels).toBe(true);
		expect(result.selectedFont).toBe("");
	});

	it("returns defaults when file contains invalid JSON", async () => {
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (_path: string) => "not valid json {",
			},
		});

		const result = await readUiSettings(win);

		expect(result.showGridOverlay).toBe(true);
		expect(result.showPresetLabels).toBe(true);
		expect(result.selectedFont).toBe("");
	});

	it("returns defaults when support root cannot be resolved", async () => {
		const win = fakeWindowWithNodeFsOnly({
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
			},
		});

		const result = await readUiSettings(win);

		expect(result.showGridOverlay).toBe(true);
		expect(result.showPresetLabels).toBe(true);
		expect(result.selectedFont).toBe("");
	});

	it("reads from an absolute path under a POSIX support root (Issue #216)", async () => {
		const readCalls: string[] = [];
		const supportRoot = "/Users/test/Library/Application Support/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (path: string) => {
					readCalls.push(path);
					return makeUiSettingsJson({ showGridOverlay: false });
				},
			},
		});

		const result = await readUiSettings(win);

		expect(result.showGridOverlay).toBe(false);
		expect(readCalls[0]).toBe(
			"/Users/test/Library/Application Support/Adobe/CEP/ty-plus/settings/ui.json",
		);
		expect(readCalls[0].startsWith("/")).toBe(true);
		expect(readCalls[0].endsWith("/settings/ui.json")).toBe(true);
	});
});

// ── writeUiSettings ────────────────────────────────────────────────

describe("writeUiSettings", () => {
	it("writes to ty-plus/settings/ui.json", async () => {
		const writeCalls: Array<{ path: string; data: string }> = [];
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				mkdir: async () => undefined,
				writeFile: async (path: string, data: string) => {
					writeCalls.push({ path, data });
				},
			},
		});

		await writeUiSettings(win, {
			version: 1,
			showGridOverlay: false,
			showPresetLabels: true,
			selectedFont: "Arial",
		});

		expect(writeCalls).toHaveLength(1);
		expect(writeCalls[0].path).toMatch(/ty-plus[/\\]settings[/\\]ui\.json$/);
		const written = JSON.parse(writeCalls[0].data);
		expect(written.showGridOverlay).toBe(false);
		expect(written.showPresetLabels).toBe(true);
		expect(written.selectedFont).toBe("Arial");
	});

	it("creates parent directories recursively", async () => {
		const mkdirCalls: string[] = [];
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				mkdir: async (path: string) => {
					mkdirCalls.push(path);
				},
				writeFile: async () => {},
			},
		});

		await writeUiSettings(win, {
			version: 1,
			showGridOverlay: true,
			showPresetLabels: true,
			selectedFont: "",
		});

		expect(mkdirCalls.some((p) => p.includes("ty-plus/settings"))).toBe(true);
	});

	it("no-ops when support root cannot be resolved", async () => {
		const writeCalls: string[] = [];
		const win = fakeWindowWithNodeFsOnly({
			promises: {
				mkdir: async (path: string) => {
					writeCalls.push(path);
				},
				writeFile: async (path: string) => {
					writeCalls.push(path);
				},
			},
		});

		await writeUiSettings(win, {
			version: 1,
			showGridOverlay: true,
			showPresetLabels: true,
			selectedFont: "",
		});

		expect(writeCalls).toHaveLength(0);

		// Issue #216: a write that gets no root drops the bytes in silence on
		// every branch (`if (!root) return` throws nothing). The skip must be
		// observable, and it must say which resolution steps failed.
		expect(skipActions()).toEqual(["writeUiSettings:skipped-no-root"]);
		const entries = getEntries();
		const skip = entries[entries.length - 1];
		expect(skip.level).toBe("warn");
		expect(skip.context).toMatchObject({
			supportRoot: null,
			source: "none",
			steps: {
				explicitSupportRoot: "null",
				persistenceSettingsRoot: "null",
				hostSupportRoot: "null",
			},
		});
	});

	// Issue #216: the suffix assertion above cannot see a lost leading
	// separator — `…/ty-plus/settings/ui.json` matches whether it is absolute
	// or resolved against the CEP process cwd. These pin the prefix.
	it("writes an absolute path under a POSIX support root", async () => {
		const writeCalls: string[] = [];
		const supportRoot = "/Users/test/Library/Application Support/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				mkdir: async () => undefined,
				writeFile: async (path: string) => {
					writeCalls.push(path);
				},
				readFile: async () => {
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
			},
		});

		await writeUiSettings(win, {
			version: 1,
			showGridOverlay: false,
			showPresetLabels: true,
			selectedFont: "",
		});

		expect(writeCalls).toHaveLength(1);
		expect(writeCalls[0]).toBe(
			"/Users/test/Library/Application Support/Adobe/CEP/ty-plus/settings/ui.json",
		);
		expect(writeCalls[0].startsWith("/")).toBe(true);
		expect(writeCalls[0].endsWith("/settings/ui.json")).toBe(true);

		// The diagnostic must not fire when the write actually happens.
		expect(skipActions()).toHaveLength(0);
	});
});

// ── ensureUiSettingsFile ───────────────────────────────────────────

describe("ensureUiSettingsFile", () => {
	it("creates default settings file when missing", async () => {
		const writeCalls: Array<{ path: string; data: string }> = [];
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (path: string) => {
					if (path.includes("ty-plus/settings/ui.json")) {
						throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
					}
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
				mkdir: async () => undefined,
				writeFile: async (path: string, data: string) => {
					writeCalls.push({ path, data });
				},
			},
		});

		await ensureUiSettingsFile(win);

		expect(writeCalls).toHaveLength(1);
		expect(writeCalls[0].path).toMatch(/ty-plus[/\\]settings[/\\]ui\.json$/);
		const written = JSON.parse(writeCalls[0].data);
		expect(written.version).toBe(1);
		expect(written.showGridOverlay).toBe(true);
		expect(written.showPresetLabels).toBe(true);
		expect(written.selectedFont).toBe("");
	});

	it("does not overwrite when file already exists", async () => {
		const existingJson = makeUiSettingsJson({
			showGridOverlay: false,
			selectedFont: "Courier",
		});
		const writeCalls: string[] = [];
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (path: string) => {
					if (path.includes("ty-plus/settings/ui.json")) {
						return existingJson;
					}
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
				writeFile: async (path: string) => {
					writeCalls.push(path);
				},
			},
		});

		await ensureUiSettingsFile(win);

		expect(writeCalls).toHaveLength(0);
	});

	it("does not overwrite when file is empty", async () => {
		const writeCalls: string[] = [];
		const supportRoot = "C:/Users/test/AppData/Roaming/Adobe/CEP";
		const win = fakeWindowWithCsInterfaceAndFs(supportRoot, {
			promises: {
				readFile: async (_path: string) => "",
				mkdir: async () => undefined,
				writeFile: async (path: string) => {
					writeCalls.push(path);
				},
			},
		});

		await ensureUiSettingsFile(win);

		// Empty file treated as missing - should write defaults
		expect(writeCalls.some((p) => p.includes("ty-plus/settings/ui.json"))).toBe(
			true,
		);
	});

	it("no-ops when support root cannot be resolved", async () => {
		const writeCalls: string[] = [];
		const win = fakeWindowWithNodeFsOnly({
			promises: {
				readFile: async (_path: string) => {
					throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
				},
				writeFile: async (path: string) => {
					writeCalls.push(path);
				},
			},
		});

		await ensureUiSettingsFile(win);

		expect(writeCalls).toHaveLength(0);

		// Same observability contract as `writeUiSettings` (Issue #216).
		expect(skipActions()).toEqual(["ensureUiSettingsFile:skipped-no-root"]);
		expect(getEntries()[0].context).toMatchObject({ source: "none" });
	});
});

// ── real filesystem (Issue #216) ────────────────────────────────────

/**
 * Everything above records the path string; this one puts bytes on a disk.
 * Before the fix the resolved path lost its leading `/`, so `mkdir`/`writeFile`
 * resolved against the test process cwd and no `ui.json` ever appeared inside
 * the managed root — the exact data loss reported in Issue #216.
 */
describe("writeUiSettings against a real filesystem (Issue #216)", () => {
	it("lands settings/ui.json inside the absolute managed root and reads it back", async () => {
		const fsPromises = await import("node:fs/promises");
		const base = await mkdtemp(join(tmpdir(), "ty-plus-ui-"));
		try {
			const supportRoot = `${base}/support`;
			const writePaths: string[] = [];
			const win = {
				CSInterface: function (this: { getSystemPath: () => string }) {
					this.getSystemPath = () => supportRoot;
				},
				cep_node: {
					require: () => ({
						promises: {
							mkdir: fsPromises.mkdir,
							readFile: fsPromises.readFile,
							writeFile: async (path: string, data: string) => {
								writePaths.push(String(path));
								await fsPromises.writeFile(path, data, "utf8");
							},
						},
					}),
				},
			} as unknown as Window;

			await writeUiSettings(win, {
				version: 1,
				showGridOverlay: false,
				showPresetLabels: true,
				selectedFont: "Helvetica",
			});

			const expected = `${supportRoot}/ty-plus/settings/ui.json`;
			expect(writePaths).toEqual([expected]);
			expect(expected.startsWith("/")).toBe(true);

			const onDisk = JSON.parse(await fsPromises.readFile(expected, "utf8"));
			expect(onDisk.showGridOverlay).toBe(false);
			expect(onDisk.selectedFont).toBe("Helvetica");

			// Round-trip through the production reader, not the fs mock.
			await expect(readUiSettings(win)).resolves.toMatchObject({
				showGridOverlay: false,
				selectedFont: "Helvetica",
			});
		} finally {
			await rm(base, { recursive: true, force: true });
		}
	});
});
