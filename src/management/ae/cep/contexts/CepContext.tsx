import { createContext, useContext } from "react";

export type CepContextValue = {
	isCep: boolean;
	hostCode: string;
	panelSurfaceId: string;
	extensionId: string;
	/** Workspace panel (`panel-1` … `panel-5`) that opened this UI (dialogs, tools). */
	openerWorkspacePanelId: string;
};

const CepContext = createContext<CepContextValue>({
	isCep: false,
	hostCode: "",
	panelSurfaceId: "",
	extensionId: "",
	openerWorkspacePanelId: "panel-1",
});

export const CepProvider = CepContext.Provider;

export const useCep = (): CepContextValue => useContext(CepContext);
