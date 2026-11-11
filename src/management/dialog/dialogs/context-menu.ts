type CSInterfaceInstance = {
	setContextMenuByJSON?: (
		menu: string,
		callback: (menuId: string | null) => void,
	) => void;
	addEventListener?: (type: string, listener: (event: unknown) => void) => void;
	removeEventListener?: (
		type: string,
		listener: (event: unknown) => void,
	) => void;
};

type CSInterfaceConstructor = new () => CSInterfaceInstance;

type CepMenuItem = {
	id?: string;
	label: string;
	enabled?: boolean;
	/** CEP `setContextMenuByJSON`: mutual exclusivity is often shown with `checkable` + `checked`. */
	checkable?: boolean;
	checked?: boolean;
	menu?: CepMenuItem[];
};

export type CepMenuPayload = {
	menu: CepMenuItem[];
};

export type OnCepMenuSelect = (menuId: string) => void;

/** Per-surface dynamic CEP context menu (right-click → `setContextMenuByJSON`). */
export type CepJsonContextMenuSurfaceRegistration = {
	/**
	 * Return a menu for this pointer event, or `null` to use the `customMenu` /
	 * default header row from `installCepJsonContextMenuRewrite`.
	 */
	buildPayload: (event: MouseEvent) => CepMenuPayload | null;
	/** Invoked when the user picks any item while this registration is active. */
	onMenuSelect?: (menuId: string) => void;
};

const surfaceContextMenuRegs = new Map<
	string,
	CepJsonContextMenuSurfaceRegistration
>();

/**
 * Register JSON context menu behavior for a modeless `surfaceId` (must match
 * `installCepJsonContextMenuRewrite(window, surfaceId, …)`).
 */
export function registerCepJsonContextMenuSurface(
	surfaceId: string,
	registration: CepJsonContextMenuSurfaceRegistration,
): () => void {
	surfaceContextMenuRegs.set(surfaceId, registration);
	return () => {
		surfaceContextMenuRegs.delete(surfaceId);
	};
}

const getCsInterface = (win: Window): CSInterfaceInstance | null => {
	const Ctor = (win as { CSInterface?: CSInterfaceConstructor }).CSInterface;
	if (!Ctor) return null;
	try {
		return new Ctor();
	} catch {
		return null;
	}
};

/**
 * Register CEP standard menus via JSON to replace defaults.
 *
 * **Default is empty**: when no surface registration produces a payload and
 * no `customMenu` is provided, the right-click is cleared (no non-functional
 * "Ty Plus" header leaks into the menu). The override path — a surface
 * registration returning a payload — remains the only place that surfaces
 * items, so consumers always see actionable entries when a menu appears.
 */
export const installCepJsonContextMenuRewrite = (
	win: Window,
	surfaceId: string,
	customMenu?: CepMenuPayload,
	onSelect?: OnCepMenuSelect,
): (() => void) => {
	const CEP_CONTEXTMENU_CLICKED = "com.adobe.cep.contextmenu.clicked";
	const CEP_CONTEXTMENU_CLICKED_CSXS =
		"com.adobe.csxs.events.contextMenuClicked";

	let cs: CSInterfaceInstance | null = null;
	try {
		cs = getCsInterface(win);
	} catch {
		cs = null;
	}

	/** No-override / no-customMenu fallback: clear the right-click entirely. */
	const fallbackPayload: CepMenuPayload =
		customMenu ?? ({ menu: [] } as CepMenuPayload);

	/** Registration whose `buildPayload` produced the last opened menu (for pick routing). */
	let lastPickRegistration: CepJsonContextMenuSurfaceRegistration | null = null;

	const dispatchMenuPick = (menuId: string | null): void => {
		if (typeof menuId !== "string" || !menuId.trim()) {
			return;
		}
		const reg = lastPickRegistration;
		lastPickRegistration = null;
		reg?.onMenuSelect?.(menuId);
		onSelect?.(menuId);
	};

	const handleMenuClicked = (event: unknown) => {
		const e = event as {
			data?: unknown;
			menuId?: unknown;
			dataObj?: { menuItemId?: unknown };
		};
		let menuId: string | null = null;
		if (typeof e?.data === "string") menuId = e.data;
		else if (typeof e?.menuId === "string") menuId = e.menuId;
		else if (typeof e?.dataObj?.menuItemId === "string")
			menuId = e.dataObj.menuItemId;
		dispatchMenuPick(menuId);
	};

	if (cs && typeof cs.addEventListener === "function") {
		cs.addEventListener(CEP_CONTEXTMENU_CLICKED, handleMenuClicked);
		cs.addEventListener(CEP_CONTEXTMENU_CLICKED_CSXS, handleMenuClicked);
	}

	const onContextMenu = (event: Event) => {
		if (!cs || typeof cs.setContextMenuByJSON !== "function") return;
		const reg = surfaceContextMenuRegs.get(surfaceId);
		const built = reg?.buildPayload(event as MouseEvent) ?? null;
		// `null` from a registration is an explicit "not my surface" signal —
		// skip `setContextMenuByJSON` so a sibling listener (e.g. the
		// workspace) keeps the menu it set. The empty `fallbackPayload` still
		// applies when no registration is registered at all.
		if (built === null) {
			lastPickRegistration = null;
			return;
		}
		lastPickRegistration = reg ?? null;
		const payload = built ?? fallbackPayload;
		try {
			cs.setContextMenuByJSON(JSON.stringify(payload), (menuId) => {
				dispatchMenuPick(menuId);
			});
		} catch {
			/* menu API not ready, will retry on next right-click */
		}
	};
	win.addEventListener("contextmenu", onContextMenu, false);

	return () => {
		win.removeEventListener("contextmenu", onContextMenu, false);
		if (cs && typeof cs.removeEventListener === "function") {
			cs.removeEventListener(CEP_CONTEXTMENU_CLICKED, handleMenuClicked);
			cs.removeEventListener(CEP_CONTEXTMENU_CLICKED_CSXS, handleMenuClicked);
		}
	};
};
