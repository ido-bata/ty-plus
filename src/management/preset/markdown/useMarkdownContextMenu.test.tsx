/**
 * @vitest-environment jsdom
 *
 * The MarkdownLiveEditor owns its own right-click menu. The hook registers a
 * CEP surface whose `buildPayload` returns the English-labeled menu (Bold /
 * Italic / Inline Code / Link / Heading 1-3 / Bullet List / Ordered List)
 * whenever the pointer event lands inside the editor wrapper. It does **not**
 * use `useTranslation`; the right-click menu must stay English regardless of
 * the user's UI locale.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMarkdownContextMenu } from "./useMarkdownContextMenu";

type Registration = {
	buildPayload: (event: MouseEvent) => {
		menu: { id: string; label: string }[];
	} | null;
	onMenuSelect?: (id: string) => void;
};

const mocks = vi.hoisted(() => ({
	register: vi.fn((_surfaceId: string, _registration: Registration) => vi.fn()),
	install: vi.fn(() => vi.fn()),
}));

vi.mock("@/management/ae/cep/contexts/Context", () => ({
	useCep: () => ({ panelSurfaceId: "panel-1" }),
}));

vi.mock("@/management/dialog/dialogs/context-menu", () => ({
	registerCepJsonContextMenuSurface: mocks.register,
	installCepJsonContextMenuRewrite: mocks.install,
}));

describe("useMarkdownContextMenu", () => {
	it("registers a CEP context menu surface on mount", () => {
		mocks.register.mockClear();
		mocks.install.mockClear();
		renderHook(() =>
			useMarkdownContextMenu({
				getEditorState: () => ({
					value: "hello",
					selection: { start: 5, end: 5 },
				}),
				onApply: vi.fn(),
			}),
		);
		expect(mocks.register).toHaveBeenCalledTimes(1);
		expect(mocks.install).toHaveBeenCalledTimes(1);
	});

	it("buildPayload emits an English-labeled menu for an inside-editor pointer event", () => {
		mocks.register.mockClear();
		renderHook(() =>
			useMarkdownContextMenu({
				getEditorState: () => ({
					value: "hello",
					selection: { start: 5, end: 5 },
				}),
				onApply: vi.fn(),
			}),
		);
		const registration = mocks.register.mock.calls[0][1];
		const host = document.createElement("div");
		host.setAttribute("data-markdown-editor", "");
		const target = document.createElement("div");
		host.appendChild(target);
		const event = { target } as unknown as MouseEvent;
		const built = registration.buildPayload(event);
		expect(built).not.toBeNull();
		const labels = built!.menu.map((m) => m.label);
		expect(labels).toEqual([
			"Bold",
			"Italic",
			"Inline Code",
			"Link",
			"Heading 1",
			"Heading 2",
			"Heading 3",
			"Bullet List",
			"Ordered List",
		]);
	});

	it("buildPayload returns null when right-click is outside data-markdown-editor", () => {
		mocks.register.mockClear();
		renderHook(() =>
			useMarkdownContextMenu({
				getEditorState: () => ({
					value: "hello",
					selection: { start: 0, end: 0 },
				}),
				onApply: vi.fn(),
			}),
		);
		const registration = mocks.register.mock.calls[0][1];
		const host = document.createElement("div");
		const target = document.createElement("div");
		host.appendChild(target);
		const event = { target } as unknown as MouseEvent;
		expect(registration.buildPayload(event)).toBeNull();
	});

	it("menu Bold pick applies toggleBold to the current state", () => {
		const onApply = vi.fn();
		mocks.register.mockClear();
		renderHook(() =>
			useMarkdownContextMenu({
				getEditorState: () => ({
					value: "hello",
					selection: { start: 5, end: 5 },
				}),
				onApply,
			}),
		);
		const registration = mocks.register.mock.calls[0][1];
		registration.onMenuSelect?.("ty.ctx.markdown.bold");
		expect(onApply).toHaveBeenCalledWith({
			value: "hello****",
			selection: { start: 7, end: 7 },
		});
	});

	it("does not import or call useTranslation (right-click menu labels must stay English)", async () => {
		// Static guard: prevent a future patch from re-introducing the
		// translation-key path that previously bled the localized `presets.json`
		// into the right-click menu.
		const fs = await import("node:fs");
		const path = await import("node:path");
		const url = await import("node:url");
		const here = path.dirname(url.fileURLToPath(import.meta.url));
		const source = fs.readFileSync(
			path.resolve(here, "useMarkdownContextMenu.ts"),
			"utf8",
		);
		// Strip JSDoc / line comments so the JSDoc explanation of why we
		// avoid i18n here does not itself trip the guard.
		const code = source
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/(^|[^:])\/\/.*$/gm, "$1");
		expect(code).not.toMatch(/useTranslation\s*\(/);
		expect(code).not.toMatch(/from\s+["']react-i18next["']/);
	});
});
