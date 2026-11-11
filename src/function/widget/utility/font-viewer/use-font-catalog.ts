import { useCallback, useEffect, useReducer } from "react";
import { loadAeHostFontCatalog } from "./host-catalog";
import { type LocalFontFaceRow, loadSystemFontCatalog } from "./local-fonts";

export type FontLoadVia = "after-effects" | "queryLocalFonts" | "documentFonts";

type FontLoadPhase = "ae-host" | "browser";

type FontLoadState = {
	rows: readonly LocalFontFaceRow[];
	via: FontLoadVia | null;
	loadPhase: FontLoadPhase | null;
	aeHostError: string | null;
	loading: boolean;
	error: string | null;
	localAccessError: string | null;
};

type FontLoadAction =
	| { type: "load-start" }
	| { type: "ae-host-start" }
	| {
			type: "ae-host-success";
			rows: readonly LocalFontFaceRow[];
	  }
	| { type: "ae-host-empty"; error: string | null }
	| { type: "browser-start" }
	| {
			type: "browser-success";
			rows: readonly LocalFontFaceRow[];
			via: FontLoadVia;
			localAccessError: string | null;
	  }
	| { type: "error"; message: string };

const INITIAL_FONT_LOAD_STATE: FontLoadState = {
	rows: [],
	via: null,
	loadPhase: null,
	aeHostError: null,
	loading: false,
	error: null,
	localAccessError: null,
};

function fontLoadReducer(
	state: FontLoadState,
	action: FontLoadAction,
): FontLoadState {
	switch (action.type) {
		case "load-start":
			return {
				...state,
				loading: true,
				error: null,
				localAccessError: null,
				aeHostError: null,
			};
		case "ae-host-start":
			return { ...state, loadPhase: "ae-host" };
		case "ae-host-success":
			return {
				...state,
				rows: action.rows,
				via: "after-effects",
				loadPhase: null,
				aeHostError: null,
				loading: false,
			};
		case "ae-host-empty":
			return { ...state, aeHostError: action.error };
		case "browser-start":
			return { ...state, loadPhase: "browser" };
		case "browser-success":
			return {
				...state,
				loadPhase: null,
				rows: action.rows,
				via: action.via,
				localAccessError: action.localAccessError,
				aeHostError: action.rows.length > 0 ? null : state.aeHostError,
				loading: false,
			};
		case "error":
			return {
				...state,
				error: action.message,
				rows: [],
				via: null,
				loadPhase: null,
				loading: false,
			};
	}
}

type FontCatalogHook = {
	state: FontLoadState;
	reload: (opts?: { tryLocalAccess?: boolean }) => Promise<void>;
};

/**
 * Loads the font catalog for the viewer: AE host first, then browser fallback
 * (document.fonts, then optional `queryLocalFonts`). Owns the load lifecycle,
 * mount log, and the initial reload effect.
 */
function useFontCatalog(): FontCatalogHook {
	const [state, dispatch] = useReducer(
		fontLoadReducer,
		INITIAL_FONT_LOAD_STATE,
	);

	const reload = useCallback(async (opts?: { tryLocalAccess?: boolean }) => {
		dispatch({ type: "load-start" });
		try {
			dispatch({ type: "ae-host-start" });
			const ae = await loadAeHostFontCatalog(window);
			if (ae.rows.length > 0) {
				dispatch({ type: "ae-host-success", rows: ae.rows });
				return;
			}
			dispatch({ type: "ae-host-empty", error: ae.error ?? null });

			dispatch({ type: "browser-start" });
			const result = await loadSystemFontCatalog({
				tryLocalAccess: opts?.tryLocalAccess,
			});
			dispatch({
				type: "browser-success",
				rows: result.rows,
				via: result.via,
				localAccessError: result.localAccessError ?? null,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			dispatch({ type: "error", message: msg });
		}
	}, []);

	useEffect(() => {
		console.info("[ty-plus:font-viewer] widget mounted");
	}, []);

	useEffect(() => {
		void reload({ tryLocalAccess: false });
	}, [reload]);

	return { state, reload };
}
