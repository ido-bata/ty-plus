/**
 * Tests for workspace-ui-settings-file.ts
 */

import { describe, expect, it } from "vitest";
import {
	ensureUiSettingsFile,
	readUiSettings,
	writeUiSettings,
} from "./workspace-ui-settings-file";

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
	});
});
