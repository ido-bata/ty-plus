/**
 * @vitest-environment jsdom
 *
 * The directory browser widget owns its own right-click menu. The hook
 * registers a CEP surface whose `buildPayload` returns the English-labeled
 * menu (Refresh / Go up / Browse drives plus per-row Open / Select / Deselect)
 * whenever the pointer event lands inside the widget body. It does **not**
 * use `useTranslation`; the right-click menu must stay English regardless of
 * the user's UI locale.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { registerCepJsonContextMenuSurface } from "@/management/dialog/dialogs/context-menu";
import { useDirectoryBrowserContextMenu } from "./useContextMenu";

const mocks = vi.hoisted(() => ({
	register: vi.fn(() => vi.fn()),
	install: vi.fn(() => vi.fn()),
}));

vi.mock("@/management/ae/cep/contexts/Context", () => ({
	useCep: () => ({ panelSurfaceId: "panel-1" }),
}));

vi.mock("@/management/dialog/dialogs/context-menu", () => ({
	registerCepJsonContextMenuSurface: mocks.register,
	installCepJsonContextMenuRewrite: mocks.install,
}));

const createOptions = () => ({
	onRefresh: vi.fn(),
	onGoUp: vi.fn(),
	onBrowseDrives: vi.fn(),
	onOpenEntry: vi.fn(),
	onSelectFile: vi.fn(),
	onDeselectFile: vi.fn(),
	fileSelectedPath: "",
	canGoUp: true,
});

describe("useDirectoryBrowserContextMenu", () => {
	it("registers a CEP context menu surface on mount", () => {
		mocks.register.mockClear();
		mocks.install.mockClear();
		renderHook(() => useDirectoryBrowserContextMenu(createOptions()));
		expect(mocks.register).toHaveBeenCalledTimes(1);
		expect(mocks.install).toHaveBeenCalledTimes(1);
	});

	it("buildPayload emits an English-labeled menu for an inside-widget pointer event", () => {
		mocks.register.mockClear();
		renderHook(() => useDirectoryBrowserContextMenu(createOptions()));
		const registration = vi.mocked(registerCepJsonContextMenuSurface).mock
			.calls[0]?.[1];
		expect(registration).toBeDefined();
		if (!registration) throw new Error("context menu was not registered");
		const host = document.createElement("div");
		host.setAttribute("data-directory-browser-body", "");
		const target = document.createElement("div");
		host.appendChild(target);
		const event = new MouseEvent("contextmenu", { bubbles: true });
		Object.defineProperty(event, "target", { value: target });
		const built = registration.buildPayload(event);
		expect(built).not.toBeNull();
		const labels = built!.menu.map((m) => m.label);
		expect(labels).toEqual(["Refresh", "Go up", "Browse drives"]);
	});

	it("does not import or call useTranslation (right-click menu labels must stay English)", async () => {
		// Static guard: prevent a future patch from re-introducing the
		// translation-key path that previously leaked the Japanese
		// `widgets.json` into the right-click menu.
		const fs = await import("node:fs");
		const path = await import("node:path");
		const url = await import("node:url");
		const here = path.dirname(url.fileURLToPath(import.meta.url));
		const source = fs.readFileSync(
			path.resolve(here, "useContextMenu.ts"),
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
