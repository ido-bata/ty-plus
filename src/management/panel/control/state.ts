/**
 * CEP reproduction of archive `ui/components/control-panel.tsx` + `control-panel.scss`.
 * Preset creation / widget add via this (fixed float) is canonical. Different from quick widgets.
 *
 * On-disk persistence for float state lives in `panel/persistence/panel-chrome-store.ts`
 * (`panels/panel-N.json`). This module keeps synchronous cache + PandaCSS positioning
 * recipes only. Tailwind utility literals are forbidden here — every position resolves
 * to a Panda-generated class via `css()` so production bundles (Panda-only) actually
 * render the floating toolbar.
 */

import type {
	CpOrientation,
	CpPersistedState,
	CpPosition,
} from "@/management/panel/control/types";
import { css } from "@/styled-system/css";

export type { CpOrientation, CpPersistedState, CpPosition };

const defaultState = (panelId = "panel-1"): CpPersistedState => ({
	position: "bottom-right",
	orientation: "horizontal",
	collapsed: panelId !== "panel-1",
});

// Module-level cache for synchronous reads (keyed by panelId)
const _cpStateCache: Map<string, CpPersistedState> = new Map();

export function readCpState(panelId = "panel-1"): CpPersistedState {
	const cached = _cpStateCache.get(panelId);
	if (cached) {
		return { ...cached };
	}
	return defaultState(panelId);
}

export function writeCpState(
	next: CpPersistedState,
	panelId = "panel-1",
): void {
	_cpStateCache.set(panelId, { ...next });
}

/**
 * Initialize the cache with a known state (e.g., after loading from file).
 */
export const initCpStateCache = (
	state: CpPersistedState,
	panelId = "panel-1",
): void => {
	_cpStateCache.set(panelId, { ...state });
};

/**
 * Floating positioning base applied to every Control Panel anchor.
 *
 * `z-index: 150` sits above the workspace surface (z=0) but below the debug console
 * overlay (z=9999) and modeless dialogs (z=1000).
 */
const floatingBase = css({
	position: "fixed",
	zIndex: 150,
});

/**
 * Status-bar inset variants. Only `panel-1` reserves the status-bar row; sibling
 * panels sit one notch above the bottom edge.
 */
const statusBarInset = css({ bottom: "11" });
const plainBottomInset = css({ bottom: "4" });

/**
 * One PandaCSS recipe per `CpPosition`. The class string is generated once at
 * module load; runtime calls just resolve the cached class.
 */
const POSITION_CLASS_BY_KEY: Record<CpPosition, string> = {
	"top-left": css({
		position: "fixed",
		zIndex: 150,
		top: "4",
		left: "4",
		right: "auto",
		bottom: "auto",
	}),
	"top-center": css({
		position: "fixed",
		zIndex: 150,
		top: "4",
		left: "0",
		right: "0",
		bottom: "auto",
		marginInline: "auto",
		width: "max-content",
	}),
	"top-right": css({
		position: "fixed",
		zIndex: 150,
		top: "4",
		right: "4",
		left: "auto",
		bottom: "auto",
	}),
	"bottom-left": css({
		position: "fixed",
		zIndex: 150,
		left: "4",
		right: "auto",
		top: "auto",
	}),
	"bottom-center": css({
		position: "fixed",
		zIndex: 150,
		left: "0",
		right: "0",
		top: "auto",
		marginInline: "auto",
		width: "max-content",
	}),
	"bottom-right": css({
		position: "fixed",
		zIndex: 150,
		right: "4",
		left: "auto",
		top: "auto",
	}),
	"left-top": css({
		position: "fixed",
		zIndex: 150,
		top: "4",
		left: "4",
		right: "auto",
		bottom: "auto",
	}),
	"left-center": css({
		position: "fixed",
		zIndex: 150,
		top: "0",
		bottom: "0",
		left: "4",
		right: "auto",
		marginBlock: "auto",
		height: "max-content",
	}),
	"left-bottom": css({
		position: "fixed",
		zIndex: 150,
		left: "4",
		right: "auto",
		top: "auto",
	}),
	"right-top": css({
		position: "fixed",
		zIndex: 150,
		top: "4",
		right: "4",
		left: "auto",
		bottom: "auto",
	}),
	"right-center": css({
		position: "fixed",
		zIndex: 150,
		top: "0",
		bottom: "0",
		right: "4",
		left: "auto",
		marginBlock: "auto",
		height: "max-content",
	}),
	"right-bottom": css({
		position: "fixed",
		zIndex: 150,
		right: "4",
		left: "auto",
		top: "auto",
	}),
};

/**
 * PandaCSS-generated class names applied by `cpPositionToClasses`. Used by
 * consumers that need to strip a stale anchor before re-applying (e.g. live
 * repositioning tests). Pure data, no Tailwind utility strings.
 */
export const CP_POSITION_LAYOUT_CLASS_NAMES = [
	floatingBase,
	statusBarInset,
	plainBottomInset,
	...Object.values(POSITION_CLASS_BY_KEY),
] as const;

/**
 * Returns PandaCSS positioning classes for the ControlPanel anchor.
 *
 * Only `panel-1` reserves space for the primary status bar (`bottom: 11` on
 * the Panda scale); sibling surfaces use `bottom: 4`. The status-bar inset is
 * applied alongside the position recipe so we never emit Tailwind utility
 * literals into the production bundle.
 */
export function cpPositionToClasses(
	position: CpPosition,
	_orientation: CpOrientation,
	panelId = "panel-1",
): string {
	const hasStatusBar = panelId === "panel-1";
	const positionClass = POSITION_CLASS_BY_KEY[position];
	const insetClass = hasStatusBar ? statusBarInset : plainBottomInset;
	// Both classes are Panda-generated — concatenate via cx is unnecessary, but
	// we still split on space so consumers that introspect the string see the
	// individual atomic recipes.
	return `${positionClass} ${insetClass}`;
}
