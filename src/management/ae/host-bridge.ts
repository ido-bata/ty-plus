import type {
	AexEffectScanRow,
	AfterEffectsHostApi,
	HostAdapter,
	HostContext,
	HostFunctionCaller,
	PrepareAnimationPresetTargetInput,
	PrepareCodePresetScriptInput,
	PrepareEasingPresetScriptInput,
	PrepareLayerCompPresetScriptInput,
} from "@/management/ae/host/contract";

const fallbackResult = async (): Promise<unknown> => undefined;

export const createAdapter = (
	options: { caller?: HostFunctionCaller } = {},
): HostAdapter => {
	const call = async <K extends keyof AfterEffectsHostApi>(
		method: K,
		args: Parameters<AfterEffectsHostApi[K]>,
	): Promise<unknown> => {
		if (!options.caller) {
			return fallbackResult();
		}
		const result = await options.caller(method, args);
		return result.value;
	};

	return {
		code: "AEFT",
		id: "after-effects",
		getHostContext: async () => {
			const v = await call("getHostContext", []);
			if (v && typeof v === "object") {
				return v as HostContext;
			}
			throw new Error("Host context unavailable");
		},
		ping: () => call("ping", []),
		runScriptFile: (filePath: string) => call("runScriptFile", [filePath]),
		applyPreset: (filePath: string) => call("applyPreset", [filePath]),
		addFootage: (input: { filePath: string; toComp?: boolean }) =>
			call("addFootage", [input]),
		verifyPresetAsset: async (filePath: string) => {
			const v = await call("verifyPresetAsset", [filePath]);
			if (
				v &&
				typeof v === "object" &&
				typeof (v as { path?: unknown }).path === "string"
			) {
				const exists = Boolean((v as { exists?: unknown }).exists);
				return {
					exists,
					path: String((v as { path: string }).path),
				};
			}
			return { exists: false, path: String(filePath ?? "") };
		},
		scanPluginEffectRoots: async (roots: string[]) => {
			const v = await call("scanPluginEffectRoots", [roots]);
			if (
				v &&
				typeof v === "object" &&
				Array.isArray((v as { rows?: unknown }).rows)
			) {
				return v as { rows: AexEffectScanRow[] };
			}
			return { rows: [] as AexEffectScanRow[] };
		},
		applyEffectByMatchName: (matchName: string) =>
			call("applyEffectByMatchName", [matchName]),
		applyEasing: (payload: Record<string, unknown>) =>
			call("applyEasing", [payload]),
		applyLoopEasing: (payload: Record<string, unknown>) =>
			call("applyLoopEasing", [payload]),
		setAnchorPoint: (input: { position: string }) =>
			call("setAnchorPoint", [input]),
		captureEasingCurve: () => call("captureEasingCurve", []),
		captureKeyframeValues: () => call("captureKeyframeValues", []),
		getEasingClipboardPath: async () => {
			const v = await call("getEasingClipboardPath", []);
			if (v && typeof v === "object") {
				return v as { path: string };
			}
			return { path: "" };
		},
		pasteKeyframeValues: (input: { values: number[][] }) =>
			call("pasteKeyframeValues", [input]),
		getLabelColorNames: async () => {
			const v = await call("getLabelColorNames", []);
			if (
				v &&
				typeof v === "object" &&
				(v as { names?: unknown }).names &&
				typeof (v as { names?: unknown }).names === "object"
			) {
				return v as { names: Record<string, string> };
			}
			return { names: {} };
		},
		getFontBrowserEntries: () => call("getFontBrowserEntries", []),
		writeSelectedTextLayers: (input: { font: string }) =>
			call("writeSelectedTextLayers", [input]),
		readSelectedTextLayers: () => call("readSelectedTextLayers", []),
		prepareAnimationPresetTarget: (input: PrepareAnimationPresetTargetInput) =>
			call("prepareAnimationPresetTarget", [input]),
		openAnimationPresetSaveDialog: (input: PrepareAnimationPresetTargetInput) =>
			call("openAnimationPresetSaveDialog", [input]),
		prepareLayerCompPresetScript: (input: PrepareLayerCompPresetScriptInput) =>
			call("prepareLayerCompPresetScript", [input]),
		prepareCodePresetScript: (input: PrepareCodePresetScriptInput) =>
			call("prepareCodePresetScript", [input]),
		prepareEasingPresetScript: (input: PrepareEasingPresetScriptInput) =>
			call("prepareEasingPresetScript", [input]),
		getSelectionCount: async () => {
			const v = await call("getSelectionCount", []);
			if (v !== undefined && typeof v === "object") {
				return v as { count: number };
			}
			return { count: 0 };
		},
		getEasingSelectionCount: async () => {
			const v = await call("getEasingSelectionCount", []);
			if (v !== undefined && typeof v === "object") {
				return v as { pairs: number };
			}
			return { pairs: 0 };
		},
		alignLayers: (input: { action: string; target: string }) =>
			call("alignLayers", [input]),
	};
};
