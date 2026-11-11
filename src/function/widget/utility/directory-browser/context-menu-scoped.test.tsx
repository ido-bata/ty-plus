/**
 * @vitest-environment jsdom
 *
 * Scoped right-click menu for the directory browser widget.
 *
 * Project rule:
 *   "右クリックメニューはCEPのコンテキストメニューを書き換える形で実装する。
 *    独自では作成しない。また、先にかかっている項目は置き換えて消さずに上書きして継承する"
 *
 * Concretely:
 *   - Right-click **inside** `data-directory-browser-body`: the directory
 *     browser surface emits a hardcoded English menu (Refresh / Go up /
 *     Browse drives plus a per-row Open / Select / Deselect). The menu is
 *     pushed through `setContextMenuByJSON` so the user sees actionable
 *     English items — never the workspace's menu leaking through, never a
 *     Japanese `widgets.json` translation key.
 *   - Right-click **outside** the widget: the surface's `buildPayload`
 *     returns `null`, so the rewrite skips `setContextMenuByJSON` and a
 *     sibling listener (e.g. the workspace) keeps the menu it set.
 *   - All labels are hardcoded English in `useContextMenu.ts`. The
 *     `useTranslation` import is statically forbidden to prevent a future
 *     patch from re-introducing the Japanese translation-key path that
 *     previously leaked into the right-click menu.
 */

import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const setContextMenuByJSON = vi.fn();
	const addEventListener = vi.fn();
	const removeEventListener = vi.fn();
	// biome-ignore lint/complexity/useArrowFunction: vi.fn() must use `function` so vitest can intercept `new CSInterface()`
	const ctor = vi.fn(function () {
		return {
			setContextMenuByJSON,
			addEventListener,
			removeEventListener,
		};
	});
	return {
		ctor,
		setContextMenuByJSON,
		addEventListener,
		removeEventListener,
	};
});

// Force CSInterface to be present so the real `installCepJsonContextMenuRewrite`
// path actually wires up the contextmenu listener that calls setContextMenuByJSON.
(window as unknown as { CSInterface: unknown }).CSInterface = mocks.ctor;

vi.mock("@/management/ae/cep/contexts/Context", () => ({
	useCep: () => ({ panelSurfaceId: "test-panel" }),
}));

import type { JSX } from "react";
import { useDirectoryBrowserContextMenu } from "./useContextMenu";

function dispatchContextMenu(host: HTMLElement, target: Element): void {
	const event = new MouseEvent("contextmenu", { bubbles: true });
	Object.defineProperty(event, "target", { value: target });
	fireEvent(host, event);
}

function flush(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

const baseHookArgs = {
	onRefresh: () => {},
	onGoUp: () => {},
	onBrowseDrives: () => {},
	onOpenEntry: () => {},
	onSelectFile: () => {},
	onDeselectFile: () => {},
	fileSelectedPath: "",
	canGoUp: true,
} as const;

type CepMenuPayload = {
	menu: { id: string; label: string; enabled?: boolean }[];
};

function lastPayload(): CepMenuPayload {
	const jsonArg = mocks.setContextMenuByJSON.mock.calls.at(-1)?.[0] as
		| string
		| undefined;
	expect(jsonArg).toBeDefined();
	return JSON.parse(jsonArg as string) as CepMenuPayload;
}

function labels(payload: CepMenuPayload): string[] {
	return payload.menu.map((m) => m.label);
}

describe("useDirectoryBrowserContextMenu (scoped, English-only)", () => {
	beforeEach(() => {
		mocks.setContextMenuByJSON.mockClear();
		mocks.ctor.mockClear();
	});

	afterEach(() => {
		cleanup();
		document.body.innerHTML = "";
	});

	it("emits an English header menu when right-clicking an empty area inside the widget", async () => {
		const host = document.createElement("div");
		host.setAttribute("data-directory-browser-body", "");
		document.body.appendChild(host);
		const target = document.createElement("div");
		target.textContent = "empty area";
		host.appendChild(target);

		renderHook(() => useDirectoryBrowserContextMenu(baseHookArgs));
		await flush();
		mocks.setContextMenuByJSON.mockClear();

		dispatchContextMenu(host, target);

		expect(mocks.setContextMenuByJSON).toHaveBeenCalledTimes(1);
		expect(labels(lastPayload())).toEqual([
			"Refresh",
			"Go up",
			"Browse drives",
		]);
	});

	it("emits an Open entry when right-clicking a directory row", async () => {
		const host = document.createElement("div");
		host.setAttribute("data-directory-browser-body", "");
		document.body.appendChild(host);
		const row = document.createElement("div");
		row.setAttribute("data-directory-browser-entry", "");
		row.setAttribute("data-entry-kind", "dir");
		row.setAttribute("data-entry-path", "C:/demo/folder");
		host.appendChild(row);

		renderHook(() => useDirectoryBrowserContextMenu(baseHookArgs));
		await flush();
		mocks.setContextMenuByJSON.mockClear();

		dispatchContextMenu(host, row);

		expect(mocks.setContextMenuByJSON).toHaveBeenCalledTimes(1);
		const payload = lastPayload();
		expect(labels(payload)).toContain("Open");
		// No Japanese / i18n key leak: every label is one of the hardcoded
		// English strings, never a translation key like "contextMenu.open".
		for (const item of payload.menu) {
			expect(item.label).not.toMatch(/\./);
		}
	});

	it("emits a Select entry when right-clicking an unselected file row", async () => {
		const host = document.createElement("div");
		host.setAttribute("data-directory-browser-body", "");
		document.body.appendChild(host);
		const row = document.createElement("div");
		row.setAttribute("data-directory-browser-entry", "");
		row.setAttribute("data-entry-kind", "file");
		row.setAttribute("data-entry-path", "C:/demo/preset.ffx");
		host.appendChild(row);

		renderHook(() => useDirectoryBrowserContextMenu(baseHookArgs));
		await flush();
		mocks.setContextMenuByJSON.mockClear();

		dispatchContextMenu(host, row);

		expect(mocks.setContextMenuByJSON).toHaveBeenCalledTimes(1);
		expect(labels(lastPayload())).toContain("Select");
	});

	it("emits a Deselect entry when right-clicking the currently selected file row", async () => {
		const host = document.createElement("div");
		host.setAttribute("data-directory-browser-body", "");
		document.body.appendChild(host);
		const row = document.createElement("div");
		row.setAttribute("data-directory-browser-entry", "");
		row.setAttribute("data-entry-kind", "file");
		row.setAttribute("data-entry-path", "C:/demo/preset.ffx");
		host.appendChild(row);

		renderHook(() =>
			useDirectoryBrowserContextMenu({
				...baseHookArgs,
				fileSelectedPath: "C:/demo/preset.ffx",
			}),
		);
		await flush();
		mocks.setContextMenuByJSON.mockClear();

		dispatchContextMenu(host, row);

		expect(mocks.setContextMenuByJSON).toHaveBeenCalledTimes(1);
		expect(labels(lastPayload())).toContain("Deselect");
	});

	it("disables Go up when canGoUp is false", async () => {
		const host = document.createElement("div");
		host.setAttribute("data-directory-browser-body", "");
		document.body.appendChild(host);
		const target = document.createElement("div");
		host.appendChild(target);

		renderHook(() =>
			useDirectoryBrowserContextMenu({ ...baseHookArgs, canGoUp: false }),
		);
		await flush();
		mocks.setContextMenuByJSON.mockClear();

		dispatchContextMenu(host, target);

		expect(mocks.setContextMenuByJSON).toHaveBeenCalledTimes(1);
		const goUp = lastPayload().menu.find(
			(m) => m.id === "ty.ctx.dir-browser.go-up",
		);
		expect(goUp?.enabled).toBe(false);
	});

	it("does not call setContextMenuByJSON when right-clicking outside the widget (workspace menu takes over)", async () => {
		const insideHost = document.createElement("div");
		insideHost.setAttribute("data-directory-browser-body", "");
		document.body.appendChild(insideHost);

		const outsideHost = document.createElement("div");
		// No `data-directory-browser-body` attribute.
		document.body.appendChild(outsideHost);
		const outsideTarget = document.createElement("span");
		outsideTarget.textContent = "workspace widget";
		outsideHost.appendChild(outsideTarget);

		renderHook(() => useDirectoryBrowserContextMenu(baseHookArgs));
		await flush();
		mocks.setContextMenuByJSON.mockClear();

		dispatchContextMenu(document.body, outsideTarget);
		expect(mocks.setContextMenuByJSON).not.toHaveBeenCalled();
	});

	it("does not re-register when the parent re-renders with fresh callback identities", async () => {
		const first = render(<Probe {...baseHookArgs} />);
		await flush();
		const ctorCallsAfterFirstMount = mocks.ctor.mock.calls.length;

		first.rerender(<Probe {...baseHookArgs} />);
		await flush();

		expect(mocks.ctor.mock.calls.length).toBe(ctorCallsAfterFirstMount);
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

function Probe(
	props: Parameters<typeof useDirectoryBrowserContextMenu>[0],
): JSX.Element {
	useDirectoryBrowserContextMenu(props);
	return <div data-directory-browser-body="" />;
}
