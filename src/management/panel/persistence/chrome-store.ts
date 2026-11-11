/**
 * Per-panel chrome on disk: `panels/panel-N.json` under the managed ty-plus root.
 * Holds control panel float state; other keys can be added later without breaking reads.
 */

import type {
	CpOrientation,
	CpPersistedState,
	CpPosition,
} from "@/management/panel/control/types";
import { resolveTyPlusManagedRootForPersistence } from "@/management/setting/persistence/ty-plus-managed-root";
import { readJson, writeJson } from "@/management/storage/persistence";
import { readSettings } from "@/management/storage/workspace/store";

const PANEL_CHROME_FILE_VERSION = 1 as const;

type PanelChromeFileV1 = {
	version: typeof PANEL_CHROME_FILE_VERSION;
	controlPanel: CpPersistedState;
};

const VALID_POSITIONS: CpPosition[] = [
	"top-left",
	"top-center",
	"top-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
	"left-top",
	"left-center",
	"left-bottom",
	"right-top",
	"right-center",
	"right-bottom",
];

const VALID_ORIENTATIONS: CpOrientation[] = ["horizontal", "vertical"];

const parseCpFromFlatRecord = (
	cp: Record<string, unknown>,
): CpPersistedState | null => {
	const position = VALID_POSITIONS.includes(cp.position as CpPosition)
		? (cp.position as CpPosition)
		: null;
	const orientation = VALID_ORIENTATIONS.includes(
		cp.orientation as CpOrientation,
	)
		? (cp.orientation as CpOrientation)
		: null;
	const collapsed = typeof cp.collapsed === "boolean" ? cp.collapsed : null;
	if (position === null && orientation === null && collapsed === null) {
		return null;
	}
	return {
		position: position ?? "bottom-right",
		orientation: orientation ?? "horizontal",
		collapsed: collapsed ?? false,
	};
};

const coerceCp = (
	raw: Record<string, unknown> | null,
): CpPersistedState | null => {
	if (!raw) return null;
	return parseCpFromFlatRecord(raw);
};

const panelIdToIndex = (panelId: string): 1 | 2 | 3 | 4 | 5 | null => {
	const m = /^panel-(\d+)$/.exec(panelId.trim());
	if (!m) return null;
	const n = Number(m[1]);
	if (n < 1 || n > 5 || !Number.isFinite(n)) return null;
	return n as 1 | 2 | 3 | 4 | 5;
};

const unwrapChromeDoc = (
	doc: Record<string, unknown>,
): Record<string, unknown> | null => {
	if (
		doc.version === PANEL_CHROME_FILE_VERSION &&
		doc.controlPanel &&
		typeof doc.controlPanel === "object" &&
		!Array.isArray(doc.controlPanel)
	) {
		return doc.controlPanel as Record<string, unknown>;
	}
	if ("position" in doc || "orientation" in doc || "collapsed" in doc) {
		return doc;
	}
	return null;
};

const parseControlPanelFromSettingsJson = (
	settingsJson: string | null | undefined,
): CpPersistedState | null => {
	if (!settingsJson?.trim()) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(settingsJson);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return null;
	}
	const cp = (parsed as Record<string, unknown>).controlPanel;
	if (!cp || typeof cp !== "object" || Array.isArray(cp)) return null;
	return parseCpFromFlatRecord(cp as Record<string, unknown>);
};

const readLegacyDedicatedControlPanelFile = async (
	win: Window,
	managedRoot: string,
): Promise<CpPersistedState | null> => {
	const doc = await readJson(win, "controlPanel");
	if (!doc) return null;
	return coerceCp(doc);
};

/**
 * Load control panel state for this surface: `panels/panel-N.json`, then legacy fallbacks
 * for panel-1 only (`settings/control-panel.json`, then `settings.json`).
 */
const loadChromeControlPanel = async (
	win: Window,
	panelId: string,
): Promise<CpPersistedState | null> => {
	const managed = await resolveTyPlusManagedRootForPersistence(win);
	const index = panelIdToIndex(panelId);
	if (!managed || !index) return null;

	const primaryDoc = await readJson(win, "panelChrome", index);
	if (primaryDoc) {
		const inner = unwrapChromeDoc(primaryDoc);
		const cp = coerceCp(inner);
		if (cp) return cp;
	}

	if (panelId !== "panel-1") {
		return null;
	}

	const legacyDedicated = await readLegacyDedicatedControlPanelFile(
		win,
		managed,
	);
	if (legacyDedicated) return legacyDedicated;

	const settingsJson = await readSettings(win);
	return parseControlPanelFromSettingsJson(settingsJson);
};

/**
 * Merge-write `controlPanel` into `panels/panel-N.json`, preserving unknown top-level keys.
 */
const saveChromeControlPanel = async (
	win: Window,
	panelId: string,
	cp: CpPersistedState,
): Promise<void> => {
	const managed = await resolveTyPlusManagedRootForPersistence(win);
	const index = panelIdToIndex(panelId);
	if (!managed || !index) return;

	const existing = await readJson(win, "panelChrome", index);
	const next: Record<string, unknown> = {
		...(existing ?? {}),
		version: PANEL_CHROME_FILE_VERSION,
		controlPanel: {
			position: cp.position,
			orientation: cp.orientation,
			collapsed: cp.collapsed,
		},
	};
	await writeJson(win, "panelChrome", next, index);
};

export { loadChromeControlPanel as loadPanelChromeControlPanel };
