import { createContext, type JSX, type ReactNode, useContext } from "react";

import type { SurfaceState } from "@/management/workspace/state";

/**
 * Full panel state. Selection lives in `SelectionContext` so that
 * selection-only changes don't churn every consumer of `usePanelState`.
 */
const PanelStateContext = createContext<SurfaceState | null>(null);

const SelectionContext = createContext<readonly number[]>([]);

export function PanelStateProvider({
	state,
	children,
}: {
	state: SurfaceState;
	children: ReactNode;
}): JSX.Element {
	return (
		<PanelStateContext.Provider value={state}>
			{children}
		</PanelStateContext.Provider>
	);
}

export function SelectionProvider({
	selectedSurfaceIndices,
	children,
}: {
	selectedSurfaceIndices: readonly number[];
	children: ReactNode;
}): JSX.Element {
	return (
		<SelectionContext.Provider value={selectedSurfaceIndices}>
			{children}
		</SelectionContext.Provider>
	);
}

export function usePanelState(): SurfaceState {
	const v = useContext(PanelStateContext);
	if (!v) {
		throw new Error("usePanelState requires PanelStateProvider");
	}
	return v;
}

export function useSelectedSurfaceIndices(): readonly number[] {
	return useContext(SelectionContext);
}
