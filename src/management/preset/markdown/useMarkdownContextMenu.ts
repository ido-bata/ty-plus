import { useEffect, useRef } from "react";
import { useCep } from "@/management/ae/cep/contexts/Context";
import {
	installCepJsonContextMenuRewrite,
	registerCepJsonContextMenuSurface,
} from "@/management/dialog/dialogs/context-menu";
import {
	type EditorState,
	toggleBold,
	toggleBulletList,
	toggleCode,
	toggleHeading,
	toggleItalic,
	toggleLink,
	toggleOrderedList,
} from "./commands";

/**
 * Right-click menu for the MarkdownLiveEditor.
 *
 * Project rule (mirrored from `useDirectoryBrowserContextMenu`):
 *   "右クリックメニューはCEPのコンテキストメニューを書き換える形で実装する。
 *    独自では作成しない。また、先にかかっている項目は置き換えて消さずに上書きして継承する"
 *
 * Implements the rule by:
 *   - Registering a per-panel CEP context-menu surface whose `buildPayload`
 *     emits an English-labeled menu (Bold / Italic / Inline Code / Link /
 *     Heading 1-3 / Bullet List / Ordered List) when the right-click lands
 *     inside `data-markdown-editor`.
 *   - Installing the global `installCepJsonContextMenuRewrite(window, surfaceId)`
 *     interceptor so the host's right-click uses our menu instead of the
 *     browser/CEP default. No React DOM menu is rendered, and no
 *     `preventDefault()` is called on the editor wrapper.
 *   - Labels are hardcoded English — the right-click menu must stay English
 *     regardless of UI locale (matches `useDirectoryBrowserContextMenu`'s
 *     contract). No `useTranslation` here.
 *
 * Note on separators: the JSON path (`context-menu.ts`) does NOT serialize
 * `{ label: "---" }` — that escape hatch lives only in the XML path of
 * `unified-context-menu.ts`. Items below are flat 9-item list with no
 * separator.
 */
export function useMarkdownContextMenu(opts: {
	getEditorState: () => EditorState;
	onApply: (next: EditorState) => void;
	disabled?: boolean;
}): void {
	const { panelSurfaceId } = useCep();

	const getEditorStateRef = useRef(opts.getEditorState);
	const onApplyRef = useRef(opts.onApply);
	const disabledRef = useRef(opts.disabled ?? false);

	useEffect(() => {
		getEditorStateRef.current = opts.getEditorState;
		onApplyRef.current = opts.onApply;
		disabledRef.current = opts.disabled ?? false;
	}, [opts.getEditorState, opts.onApply, opts.disabled]);

	useEffect(() => {
		const surfaceId = panelSurfaceId || "markdown-editor";
		const unregisterSurface = registerCepJsonContextMenuSurface(surfaceId, {
			buildPayload: (event) => {
				if (disabledRef.current) return null;
				const target = event.target;
				const el = target instanceof Element ? target : null;
				const surface = el?.closest("[data-markdown-editor]");
				if (!surface) return null;

				return {
					menu: [
						{ id: "ty.ctx.markdown.bold", label: "Bold" },
						{ id: "ty.ctx.markdown.italic", label: "Italic" },
						{ id: "ty.ctx.markdown.code", label: "Inline Code" },
						{ id: "ty.ctx.markdown.link", label: "Link" },
						{ id: "ty.ctx.markdown.h1", label: "Heading 1" },
						{ id: "ty.ctx.markdown.h2", label: "Heading 2" },
						{ id: "ty.ctx.markdown.h3", label: "Heading 3" },
						{ id: "ty.ctx.markdown.bullet-list", label: "Bullet List" },
						{ id: "ty.ctx.markdown.ordered-list", label: "Ordered List" },
					],
				};
			},
			onMenuSelect: (menuId) => {
				const state = getEditorStateRef.current();
				let next: EditorState | null = null;
				if (menuId === "ty.ctx.markdown.bold") next = toggleBold(state);
				else if (menuId === "ty.ctx.markdown.italic")
					next = toggleItalic(state);
				else if (menuId === "ty.ctx.markdown.code") next = toggleCode(state);
				else if (menuId === "ty.ctx.markdown.link") next = toggleLink(state);
				else if (menuId === "ty.ctx.markdown.h1")
					next = toggleHeading(state, 1);
				else if (menuId === "ty.ctx.markdown.h2")
					next = toggleHeading(state, 2);
				else if (menuId === "ty.ctx.markdown.h3")
					next = toggleHeading(state, 3);
				else if (menuId === "ty.ctx.markdown.bullet-list")
					next = toggleBulletList(state);
				else if (menuId === "ty.ctx.markdown.ordered-list")
					next = toggleOrderedList(state);
				if (next) onApplyRef.current(next);
			},
		});

		const uninstall = installCepJsonContextMenuRewrite(window, surfaceId);
		return () => {
			unregisterSurface();
			uninstall();
		};
	}, [panelSurfaceId]);
}
