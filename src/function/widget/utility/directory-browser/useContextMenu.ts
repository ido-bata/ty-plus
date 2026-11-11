import { useEffect, useRef } from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
import {
	installCepJsonContextMenuRewrite,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";

/**
 * Right-click menu for the directory browser widget.
 *
 * Project rule:
 *   "右クリックメニューはCEPのコンテキストメニューを書き換える形で実装する。
 *    独自では作成しない。また、先にかかっている項目は置き換えて消さずに上書きして継承する"
 *   (implement by overwriting CEP's context menu — never stand up a custom one,
 *    and keep the items an earlier listener installed, inheriting them).
 *
 * Inheriting in practice:
 *   - Right-click **inside** `data-directory-browser-body`: `buildPayload`
 *     returns a menu (Refresh / Go up / Browse drives plus a per-row
 *     Open / Select / Deselect for directory and file rows). The labels are
 *     hardcoded English — never translated, never pulled from
 *     `useTranslation` — so the right-click menu is always English regardless
 *     of locale, and a Japanese-`widgets.json` can never bleed in.
 *   - Right-click **outside** the widget body: `buildPayload` returns `null`,
 *     so `installCepJsonContextMenuRewrite` skips `setContextMenuByJSON` and
 *     the menu a sibling listener (workspace, etc.) set is kept.
 */
export function useDirectoryBrowserContextMenu({
	onRefresh,
	onGoUp,
	onBrowseDrives,
	onOpenEntry,
	onSelectFile,
	onDeselectFile,
	fileSelectedPath,
	canGoUp,
}: {
	onRefresh: () => void | Promise<void>;
	onGoUp: () => void;
	onBrowseDrives: () => void;
	onOpenEntry: (path: string) => void;
	onSelectFile: (path: string) => void;
	onDeselectFile: () => void;
	fileSelectedPath: string;
	canGoUp: boolean;
}): void {
	const { panelSurfaceId } = useCep();

	const onRefreshRef = useRef(onRefresh);
	const onGoUpRef = useRef(onGoUp);
	const onBrowseDrivesRef = useRef(onBrowseDrives);
	const onOpenEntryRef = useRef(onOpenEntry);
	const onSelectFileRef = useRef(onSelectFile);
	const onDeselectFileRef = useRef(onDeselectFile);
	const fileSelectedPathRef = useRef(fileSelectedPath);
	const canGoUpRef = useRef(canGoUp);

	useEffect(() => {
		onRefreshRef.current = onRefresh;
		onGoUpRef.current = onGoUp;
		onBrowseDrivesRef.current = onBrowseDrives;
		onOpenEntryRef.current = onOpenEntry;
		onSelectFileRef.current = onSelectFile;
		onDeselectFileRef.current = onDeselectFile;
		fileSelectedPathRef.current = fileSelectedPath;
		canGoUpRef.current = canGoUp;
	}, [
		onRefresh,
		onGoUp,
		onBrowseDrives,
		onOpenEntry,
		onSelectFile,
		onDeselectFile,
		fileSelectedPath,
		canGoUp,
	]);

	useEffect(() => {
		const surfaceId = panelSurfaceId || "directory-browser";
		const unregisterSurface = registerCepJsonContextMenuSurface(surfaceId, {
			buildPayload: (event) => {
				const target = event.target;
				const el = target instanceof Element ? target : null;
				// Scope: only right-clicks inside the directory browser widget
				// surface get a custom menu. Outside, return `null` so a
				// sibling listener (e.g. the workspace) keeps the menu it set.
				const browserBody = el?.closest("[data-directory-browser-body]");
				if (!browserBody) {
					return null;
				}

				const staticMenu = {
					menu: [
						{
							id: "ty.ctx.dir-browser.refresh",
							label: "Refresh",
						},
						{
							id: "ty.ctx.dir-browser.go-up",
							label: "Go up",
							enabled: canGoUpRef.current,
						},
						{
							id: "ty.ctx.dir-browser.browse-drives",
							label: "Browse drives",
						},
					],
				};

				const row = el?.closest("[data-directory-browser-entry]");
				if (!row) {
					return staticMenu;
				}
				const kind = row.getAttribute("data-entry-kind")?.trim();
				const path = row.getAttribute("data-entry-path")?.trim() ?? "";
				if (!kind || !path) {
					return staticMenu;
				}

				if (kind === "dir") {
					return {
						menu: [
							{
								id: `ty.ctx.dir-browser.open:${encodeURIComponent(path)}`,
								label: "Open",
							},
							{
								id: "ty.ctx.dir-browser.refresh",
								label: "Refresh",
							},
							{
								id: "ty.ctx.dir-browser.go-up",
								label: "Go up",
								enabled: canGoUpRef.current,
							},
						],
					};
				}

				if (kind === "file") {
					const isSelected = fileSelectedPathRef.current === path;
					return {
						menu: [
							{
								id: isSelected
									? "ty.ctx.dir-browser.deselect-file"
									: `ty.ctx.dir-browser.select-file:${encodeURIComponent(path)}`,
								label: isSelected ? "Deselect" : "Select",
							},
							{
								id: "ty.ctx.dir-browser.refresh",
								label: "Refresh",
							},
							{
								id: "ty.ctx.dir-browser.go-up",
								label: "Go up",
								enabled: canGoUpRef.current,
							},
						],
					};
				}

				return staticMenu;
			},
			onMenuSelect: (menuId) => {
				if (menuId === "ty.ctx.dir-browser.refresh") {
					void onRefreshRef.current();
					return;
				}
				if (menuId === "ty.ctx.dir-browser.go-up") {
					onGoUpRef.current();
					return;
				}
				if (menuId === "ty.ctx.dir-browser.browse-drives") {
					onBrowseDrivesRef.current();
					return;
				}
				if (menuId === "ty.ctx.dir-browser.deselect-file") {
					onDeselectFileRef.current();
					return;
				}
				const openPrefix = "ty.ctx.dir-browser.open:";
				if (menuId.startsWith(openPrefix)) {
					const path = decodeURIComponent(menuId.slice(openPrefix.length));
					onOpenEntryRef.current(path);
					return;
				}
				const selectPrefix = "ty.ctx.dir-browser.select-file:";
				if (menuId.startsWith(selectPrefix)) {
					const path = decodeURIComponent(menuId.slice(selectPrefix.length));
					onSelectFileRef.current(path);
				}
			},
		});
		const uninstall = installCepJsonContextMenuRewrite(window, surfaceId);
		return () => {
			unregisterSurface();
			uninstall();
		};
	}, [panelSurfaceId]);
}
