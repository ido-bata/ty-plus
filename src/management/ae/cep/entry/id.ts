type CepCsCtor = new () => { getExtensionID?: () => string };

declare global {
	interface Window {
		__TY_PLUS_PANEL_SURFACE_ID__?: string;
		__TY_PLUS_LIVE_SERVER_ORIGIN__?: string;
		__TY_PLUS_WORKSPACE_GRID__?: {
			cellSize?: number;
			gap?: number;
			radius?: number;
		};
	}
}

const panelIndexFromTyPlusExtensionId = (
	extensionId: string,
): number | null => {
	const trimmed = extensionId.trim();
	const dotted = /^app\.ty-plus\.panel\.(\d+)$/i.exec(trimmed);
	if (dotted) {
		const n = Number.parseInt(dotted[1], 10);
		if (n >= 1 && n <= 5) return n;
	}
	const compact = /^app\.ty-plus\.panel(\d+)$/i.exec(trimmed);
	if (compact) {
		const n = Number.parseInt(compact[1], 10);
		if (n >= 1 && n <= 5) return n;
	}
	return null;
};

const readPhysicalExtensionId = (): string => {
	try {
		const Ctor = (window as unknown as { CSInterface?: CepCsCtor }).CSInterface;
		if (Ctor) {
			const id = new Ctor().getExtensionID?.() ?? "";
			if (typeof id === "string" && id.trim().length > 0) {
				return id.trim();
			}
		}
	} catch {
		/* noop */
	}
	try {
		const cep = (
			window as unknown as {
				__adobe_cep__?: { getExtensionId?: () => string };
			}
		).__adobe_cep__;
		const id = cep?.getExtensionId?.() ?? "";
		return typeof id === "string" ? id.trim() : "";
	} catch {
		return "";
	}
};

export const resolvePanelSurfaceId = (): string => {
	const fromWin = window.__TY_PLUS_PANEL_SURFACE_ID__;
	if (typeof fromWin === "string" && fromWin.trim().length > 0) {
		return fromWin.trim();
	}
	const ext = readPhysicalExtensionId();
	const n = panelIndexFromTyPlusExtensionId(ext);
	if (n != null) {
		return `panel-${n}`;
	}
	return "panel-1";
};

/**
 * `CSInterface.getExtensionID()` / `__adobe_cep__.getExtensionId()` can return
 * an empty string for the first few ticks after a Panel document loads. Poll
 * briefly so auxiliary panels do not collapse onto `panel-1` and start
 * reading/writing the main panel's `workspace-1.json`.
 */
export async function resolvePanelSurfaceIdForBoot(): Promise<string> {
	const resolveOnce = (): string => {
		const fromWin = window.__TY_PLUS_PANEL_SURFACE_ID__;
		if (typeof fromWin === "string" && fromWin.trim().length > 0) {
			return fromWin.trim();
		}
		const ext = readPhysicalExtensionId();
		const n = panelIndexFromTyPlusExtensionId(ext);
		if (n != null) {
			return `panel-${n}`;
		}
		return "";
	};
	const immediate = resolveOnce();
	if (immediate.length > 0) {
		return immediate;
	}
	for (let i = 0; i < 80; i += 1) {
		await new Promise((r) => setTimeout(r, 32));
		const next = resolveOnce();
		if (next.length > 0) {
			return next;
		}
	}
	return "panel-1";
}
