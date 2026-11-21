// @vitest-environment happy-dom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/management/preset/editor/textmate", () => ({
	ensureExtendscriptLanguage: vi.fn(),
	initTextMate: vi.fn(async () => undefined),
}));

import { PRESET_ADD_TOOL_POOL_EXTENSION_IDS } from "../preset/add-dialog-pool";
import { resolveDialogExtensionIdForOpen } from "./dialogs/ids";
import { DialogRoot, type DialogRootProps } from "./Root";

/**
 * Dialog smoke tests  Everifies each registered surface ID produces a visible
 * root or a visible fallback, never null.
 *
 * These are P1 smoke tests for the dialog surface bridge:
 * - debug-console
 * - dialog-presets
 * - dialog-preset-library
 * - dialog-messages
 * - dialog-settings
 *
 * DialogRoot is the entry point rendered by dialogs.tsx / debug/dialog.tsx.
 * The current implementation is a stub that returns null  Ethese tests
 * document the required behavior and will pass once DialogRoot is fully
 * implemented in Tasks 28-35.
 */

const REGISTERED_SURFACE_IDS = [
	"debug-console",
	"dialog-presets",
	"dialog-preset-library",
	"dialog-messages",
	"dialog-settings",
] as const;

describe("DialogRoot surface registry", () => {
	it("debug-console resolves via resolveDialogExtensionIdForOpen", () => {
		const ext = resolveDialogExtensionIdForOpen("debug-console");
		expect(ext).toBe("app.ty-plus.debug-console");
	});

	it("dialog-presets resolves via resolveDialogExtensionIdForOpen", () => {
		const ext = resolveDialogExtensionIdForOpen("dialog-presets");
		expect(ext).toBe("app.ty-plus.dialog-presets");
	});

	it("dialog-preset-library resolves via resolveDialogExtensionIdForOpen", () => {
		const ext = resolveDialogExtensionIdForOpen("dialog-preset-library");
		expect(ext).toBe("app.ty-plus.dialog-preset-library");
	});

	it("dialog-messages resolves via resolveDialogExtensionIdForOpen", () => {
		const ext = resolveDialogExtensionIdForOpen("dialog-messages");
		expect(ext).toBe("app.ty-plus.dialog-messages");
	});

	it("dialog-settings resolves via resolveDialogExtensionIdForOpen", () => {
		const ext = resolveDialogExtensionIdForOpen("dialog-settings");
		expect(ext).toBe("app.ty-plus.dialog-settings");
	});

	it("add-preset tool surfaces resolve to a pooled modeless extension id", () => {
		const ext = resolveDialogExtensionIdForOpen("dialog-preset-add");
		expect(ext).toBeTruthy();
		expect(PRESET_ADD_TOOL_POOL_EXTENSION_IDS).toContain(ext);
	});
});

/**
 * Smoke tests for DialogRoot  Everifies it never returns null.
 *
 * DialogRoot currently returns null (stub). These tests document the contract
 * that DialogRoot must fulfill: it should return a visible fallback rather
 * than null, so the CEP host has something to render.
 *
 * Once DialogRoot is fully implemented (Tasks 28-35), these tests should
 * verify the rendered output is non-null and visible.
 */
describe("DialogRoot smoke tests", () => {
	describe("stub contract: never return null", () => {
		it.each(REGISTERED_SURFACE_IDS)(
			"DialogRoot(%s) must not return null  found null (stub)",
			(surfaceId) => {
				const props: DialogRootProps = { surfaceId };
				if (surfaceId === "debug-console") {
					const html = renderToStaticMarkup(createElement(DialogRoot, props));
					expect(html).not.toBe("");
					return;
				}
				const result = DialogRoot(props);
				expect(result).not.toBeNull();
			},
		);
	});
});

/**
 * Integration smoke test  Everifies debug-console surface entry exists.
 * The debug console entry point (debug/dialog.tsx) boots DebugDialogRoot
 * for the debug-console surface.
 */
describe("debug console entry", () => {
	it("DebugDialogRoot is exported from debug module", async () => {
		const { DebugDialogRoot } = await import("../debug");
		expect(typeof DebugDialogRoot).toBe("function");
	});
});

describe("workspace shell tool dialog open plan", () => {
	it("maps tool kinds to CEP extension ids and surface ids", async () => {
		const { planWorkspaceShellToolDialogOpen } = await import(
			"./workspace-shell-tool-open"
		);
		const cep = planWorkspaceShellToolDialogOpen("presets", true);
		expect(cep).toEqual({
			extensionId: "app.ty-plus.dialog-presets",
			surfaceId: "dialog-presets",
		});
		expect(planWorkspaceShellToolDialogOpen("settings", false)).toBeNull();
	});
});
