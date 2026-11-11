import { createContext, useContext } from "react";

import type { HostFunctionCaller } from "@/management/ae/host/contract";

export type WidgetRuntime = {
	host: HostFunctionCaller;
	activeWidgetInstanceId: string | null;
	setActiveWidgetInstanceId: (id: string | null) => void;
};

const RuntimeContext = createContext<WidgetRuntime | null>(null);

export const RuntimeProvider = RuntimeContext.Provider;

const noopCaller: HostFunctionCaller = (async () =>
	({
		hostId: "after-effects",
		method: "ping",
		value: undefined,
	}) as unknown) as HostFunctionCaller;

export const useWidgetRuntime = (): WidgetRuntime => {
	const ctx = useContext(RuntimeContext);
	if (!ctx) {
		return {
			host: noopCaller,
			activeWidgetInstanceId: null,
			setActiveWidgetInstanceId: () => {},
		};
	}
	return ctx;
};
