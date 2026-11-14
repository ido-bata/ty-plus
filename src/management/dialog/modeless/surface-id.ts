import { tyPlusExtensionBundleId } from "@/management/ae/cep/extension-id";
import { readCepOpenParams } from "@/management/ae/cep/transport";
import { isPresetAddPoolExtensionId } from "@/management/preset/add-dialog-pool";
import { isPresetToolDialogSurfaceId } from "@/management/preset/registry";

declare global {
	interface Window {
		__TY_PLUS_DIALOG_SURFACE_ID__?: string;
	}
}

type CepCsCtor = new () => { getExtensionID?: () => string };

/**
 * Manifest surface name (the part after `${bundleId}.`) -> surface id.
 * The physical Extension Id carries the build's bundle id prefix
 * (`app.ty-plus` for release, `app.ty-plus.dev` for dev), so keys are stored
 * without the prefix and looked up after stripping it.
 */
const DIALOG_EXTENSION_SUFFIX_TO_SURFACE_ID: Record<string, string> = {
	dialog: "dialog",
	"dialog-preset-add": "dialog-preset-add",
	"dialog-preset-edit": "dialog-preset-edit",
	"debug-console": "debug-console",
	"dialog-presets": "dialog-presets",
	"dialog-preset-library": "dialog-preset-library",
	"dialog-messages": "dialog-messages",
	"dialog-settings": "dialog-settings",
	"dialog-probe": "dialog-probe",
	"dialog-widget-selector": "dialog-widget-selector",
	"dialog-preset-add-folder": "dialog-preset-add-folder",
	"dialog-code-preset": "dialog-code-preset",
	"dialog-footage-preset": "dialog-footage-preset",
	"dialog-animation-preset": "dialog-animation-preset",
	"dialog-layer-comp-preset": "dialog-layer-comp-preset",
	"dialog-import-preset": "dialog-import-preset",
	"dialog-background-panel": "dialog-background-panel",
};

const DIALOG_SURFACE_IDS = new Set(
	Object.values(DIALOG_EXTENSION_SUFFIX_TO_SURFACE_ID),
);

export function readPhysicalExtensionId(): string {
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
}

function tryPresetToolSurfaceIdFromOpenArgs(
	physicalExtensionId: string,
): string | null {
	if (!isPresetAddPoolExtensionId(physicalExtensionId)) {
		return null;
	}
	const args = readCepOpenParams<{ presetToolSurfaceId?: unknown }>(window);
	const raw = args?.presetToolSurfaceId;
	if (typeof raw !== "string") {
		return null;
	}
	const trimmed = raw.trim();
	if (!trimmed || !isPresetToolDialogSurfaceId(trimmed)) {
		return null;
	}
	return trimmed;
}

function tryDialogSurfaceIdFromOpenArgs(): string | null {
	const args = readCepOpenParams<{ surfaceId?: unknown }>(window);
	const raw = args?.surfaceId;
	if (typeof raw !== "string") {
		return null;
	}
	const trimmed = raw.trim();
	if (!DIALOG_SURFACE_IDS.has(trimmed)) {
		return null;
	}
	return trimmed;
}

export function resolveDialogSurfaceId(): string {
	const fromWin = window.__TY_PLUS_DIALOG_SURFACE_ID__;
	if (typeof fromWin === "string" && fromWin.trim().length > 0) {
		return fromWin.trim();
	}
	const fromOpenArgs = tryDialogSurfaceIdFromOpenArgs();
	if (fromOpenArgs) {
		return fromOpenArgs;
	}
	const physicalExtensionId = readPhysicalExtensionId();
	const fromArgs = tryPresetToolSurfaceIdFromOpenArgs(physicalExtensionId);
	if (fromArgs) {
		return fromArgs;
	}
	if (physicalExtensionId) {
		const prefix = `${tyPlusExtensionBundleId}.`;
		const suffix = physicalExtensionId.startsWith(prefix)
			? physicalExtensionId.slice(prefix.length)
			: physicalExtensionId;
		return DIALOG_EXTENSION_SUFFIX_TO_SURFACE_ID[suffix] ?? "";
	}
	return "";
}

/**
 * `getExtensionID` / `__adobe_cep__` can be empty for the first few ticks after
 * a Modeless document loads. Pool extensions also need `getArguments()` to land.
 */
export async function resolveDialogSurfaceIdForBoot(): Promise<string> {
	let surfaceId = resolveDialogSurfaceId();
	if (surfaceId.trim().length > 0) {
		return surfaceId;
	}
	for (let i = 0; i < 80; i += 1) {
		await new Promise((r) => setTimeout(r, 32));
		surfaceId = resolveDialogSurfaceId();
		if (surfaceId.trim().length > 0) {
			return surfaceId;
		}
	}
	return surfaceId;
}
