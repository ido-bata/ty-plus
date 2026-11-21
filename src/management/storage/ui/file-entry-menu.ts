import type { CepMenuPayload } from "@/management/dialog/dialogs/context-menu";
import type {
	FileEntry,
	FileEntryKind,
	FileEntrySelectionMode,
	FileEntryViewMode,
} from "@/management/storage/ui/FileEntryList";

type FileEntryMenuSurface =
	| "onboarding"
	| "settings-preview"
	| "tool-shell"
	| "widget";

export type FileEntryMenuHit =
	| { target: "body" }
	| { target: "entry"; kind: "dir" | "file"; path: string };

type DirectoryBrowserMenuContribution = {
	id: string;
	label: string;
	enabled?: boolean;
};

export type FileEntryMenuContext = {
	surface: FileEntryMenuSurface;
	/** Reserved for icons-only items (e.g. aspect). Defaults to `"list"`. */
	viewMode?: FileEntryViewMode;
	selectionMode: FileEntrySelectionMode;
	isSelected: (path: string, kind: FileEntryKind) => boolean;
	canGoUp: boolean;
	canRefresh: boolean;
	contributions?: readonly DirectoryBrowserMenuContribution[];
};

export type FileEntryMenuActions = {
	onRefresh: () => void;
	onGoUp: () => void;
	onOpenEntry: (path: string) => void;
	onToggleSelected: (path: string, kind: FileEntryKind) => void;
	onCustomAction?: (id: string) => void;
};

const MENU_ID_PREFIX = "ty.dir-browser.";

/**
 * `selectionMode` is the single gate for which selection kinds a surface may
 * toggle. The regular UI hides the checkbox for disallowed kinds; the context
 * menu must apply the same rule so it cannot select what the surface forbids.
 */
const isSelectionKindAllowed = (
	selectionMode: FileEntrySelectionMode,
	kind: FileEntryKind,
): boolean => {
	if (selectionMode === "both") {
		return true;
	}
	return selectionMode === (kind === "file" ? "files" : "folders");
};

/**
 * `data-entry-file-type` value for the unified workspace context menu.
 * Only the media kinds the menu understands (image / video / audio) are
 * emitted; directories and every other file type leave the attribute off.
 */
export function fileEntryMenuFileType(
	entry: FileEntry,
): "image" | "video" | "audio" | undefined {
	if (entry.isDirectory) return undefined;
	const ft = entry.fileType;
	return ft === "image" || ft === "video" || ft === "audio" ? ft : undefined;
}

const encodePath = (path: string): string => encodeURIComponent(path);

const decodePath = (rest: string): string => {
	try {
		return decodeURIComponent(rest);
	} catch {
		return rest;
	}
};

export function parseFileEntryMenuHit(
	el: Element | null,
): FileEntryMenuHit | null {
	const body = el?.closest?.("[data-directory-browser-body]");
	if (!body) {
		return null;
	}
	const row = el?.closest?.("[data-directory-browser-entry]");
	const kind = row?.getAttribute("data-entry-kind")?.trim();
	const path = row?.getAttribute("data-entry-path")?.trim() ?? "";
	if (!kind || !path) {
		return { target: "body" };
	}
	if (kind !== "dir" && kind !== "file") {
		return { target: "body" };
	}
	return { target: "entry", kind, path };
}

export function buildFileEntryMenu(
	ctx: FileEntryMenuContext,
	hit: FileEntryMenuHit,
): CepMenuPayload {
	const menu: CepMenuPayload["menu"] = [];
	const pushRefresh = (): void => {
		if (ctx.canRefresh) {
			menu.push({ id: `${MENU_ID_PREFIX}refresh`, label: "Refresh" });
		}
	};
	const pushGoUp = (): void => {
		menu.push({
			id: `${MENU_ID_PREFIX}go-up`,
			label: "Go Up",
			enabled: ctx.canGoUp,
		});
	};
	const pushToggle = (path: string, kind: FileEntryKind): void => {
		if (!isSelectionKindAllowed(ctx.selectionMode, kind)) {
			return;
		}
		const selected = ctx.isSelected(path, kind);
		const action = selected ? "deselect" : "select";
		menu.push({
			id: `${MENU_ID_PREFIX}${action}:${kind}:${encodePath(path)}`,
			label: selected ? "Deselect" : "Select",
		});
	};
	if (hit.target === "body") {
		pushRefresh();
		pushGoUp();
	} else if (hit.kind === "dir") {
		menu.push({
			id: `${MENU_ID_PREFIX}open:${encodePath(hit.path)}`,
			label: "Open",
		});
		pushToggle(hit.path, "folder");
		pushRefresh();
		pushGoUp();
	} else {
		pushToggle(hit.path, "file");
		pushRefresh();
		pushGoUp();
	}
	for (const contribution of ctx.contributions ?? []) {
		menu.push({ ...contribution });
	}
	return { menu };
}

export function handleFileEntryMenuSelect(
	menuId: string,
	ctx: FileEntryMenuContext,
	actions: FileEntryMenuActions,
): boolean {
	if (menuId === `${MENU_ID_PREFIX}refresh`) {
		actions.onRefresh();
		return true;
	}
	if (menuId === `${MENU_ID_PREFIX}go-up`) {
		actions.onGoUp();
		return true;
	}
	const openPrefix = `${MENU_ID_PREFIX}open:`;
	if (menuId.startsWith(openPrefix)) {
		actions.onOpenEntry(decodePath(menuId.slice(openPrefix.length)));
		return true;
	}
	for (const action of ["select", "deselect"] as const) {
		for (const kind of ["file", "folder"] as const) {
			const prefix = `${MENU_ID_PREFIX}${action}:${kind}:`;
			if (menuId.startsWith(prefix)) {
				if (!isSelectionKindAllowed(ctx.selectionMode, kind)) {
					return false;
				}
				actions.onToggleSelected(decodePath(menuId.slice(prefix.length)), kind);
				return true;
			}
		}
	}
	if (
		(ctx.contributions ?? []).some((contribution) => contribution.id === menuId)
	) {
		actions.onCustomAction?.(menuId);
		return true;
	}
	return false;
}
