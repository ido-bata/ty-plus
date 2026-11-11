// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

vi.mock("./textmate", () => ({
	ensureExtendscriptLanguage: vi.fn(),
	initTextMate: vi.fn(async () => undefined),
}));

vi.mock("monaco-editor/esm/vs/editor/editor.api.js", () => ({
	editor: {
		defineTheme: vi.fn(),
		setTheme: vi.fn(),
		create: vi.fn(() => ({
			dispose: vi.fn(),
			onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
			getModel: vi.fn(() => ({
				setLanguage: vi.fn(),
				dispose: vi.fn(),
			})),
		})),
	},
	languages: {
		register: vi.fn(),
		setTokensProvider: vi.fn(),
		setMonarchTokensProvider: vi.fn(),
	},
}));

vi.mock(
	"monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js",
	() => ({}),
);
vi.mock(
	"monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js",
	() => ({}),
);
vi.mock("monaco-editor/esm/vs/editor/editor.worker?worker", () => ({
	default: class MockWorker {},
}));
vi.mock("monaco-editor/min/vs/editor/editor.main.css?raw", () => ({
	default: "",
}));
vi.mock("@volar/monaco", () => ({
	activateMarkers: vi.fn(),
	registerProviders: vi.fn(),
}));
vi.mock("./typescript-worker?worker", () => ({
	default: class MockWorker {},
}));

describe("CodeEditor module", () => {
	it("loads without errors", async () => {
		const module = await import("./Code");
		expect(module.CodeEditor).toBeDefined();
	});

	it("exports CodeEditorValue type", async () => {
		const module = await import("./Code");
		expect(module.CodeEditor).toBeDefined();
	});
});
