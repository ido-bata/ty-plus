/**
 * Preset management module — registry loading, preset tool surfaces.
 *
 * Extracted from hook.ts (openPresetToolSurface, openPresetEditSurface,
 * external dialog request setup).
 */

import { allocatePresetAddToolExtensionId } from "@/management/preset/add-dialog-pool";
import { writePresetToolHandoff } from "@/management/preset/tool-handoff-file";
import { openCepDialogSurface } from "@/management/ae/cep/transport";
import { publishShellMessage } from "@/management/workspace/messaging/publish-shell-message";
import type { SurfaceTransport } from "@/management/workspace/surface/contract";

import type { PresetDialogRequest } from "@/management/preset/dialog-request";

/**
 * Lazily loads the preset registry module.
 */
const _loadPresetRegistry = () => import("@/management/preset/registry");

// ── Preset tool surface open ────────────────────────────────────────────────

export type OpenPresetToolSurfaceOptions = {
	win: Window;
	panelId: string;
	surfaceId: string;
	params?: Record<string, unknown>;
	cepSurfaceTransport: SurfaceTransport | null;
	presetToolOpenBusChannel: string;
};

/**
 * Opens a preset tool dialog surface (CEP only).
 */
export const openPresetToolSurface = async ({
	win,
	panelId,
	surfaceId,
	params,
	cepSurfaceTransport,
	presetToolOpenBusChannel,
}: OpenPresetToolSurfaceOptions): Promise<void> => {
	const { getPresetToolDialogEntry } = await _loadPresetRegistry();
	const entry = getPresetToolDialogEntry(surfaceId);
	if (!entry) return;
	const extensionId = allocatePresetAddToolExtensionId();
	const payload: Record<string, unknown> = {
		openerSurfaceId: panelId,
		...(params ?? {}),
		presetToolSurfaceId: surfaceId,
	};
	try {
		await writePresetToolHandoff(win, extensionId, payload);
	} catch {
		/* CEP Node / fs unavailable: skip handoff */
	}
	openCepDialogSurface(win, {
		extensionId,
		params: payload,
	});
	const publishHint = (): void => {
		if (cepSurfaceTransport) {
			void publishShellMessage(cepSurfaceTransport, {
				channel: presetToolOpenBusChannel,
				kind: "publish",
				sourceSurfaceId: panelId,
				targetSurfaceId: extensionId,
				payload,
			});
		}
	};
	publishHint();
	if (typeof globalThis.setTimeout === "function") {
		for (const ms of [
			16, 48, 112, 220, 400, 700, 1100, 1800, 2600, 3500, 5000,
		] as const) {
			globalThis.setTimeout(publishHint, ms);
		}
	}
};

/**
 * Opens the preset edit dialog surface (CEP only).
 */
export const openPresetEditSurface = async (
	win: Window,
	panelId: string,
	presetId: string,
): Promise<void> => {
	const extensionId = "app.ty-plus.dialog-preset-edit";
	const payload = { openerSurfaceId: panelId, presetId: presetId.trim() };
	try {
		await writePresetToolHandoff(win, extensionId, payload);
	} catch {
		/* keep getArguments as fallback */
	}
	openCepDialogSurface(win, { extensionId, params: payload });
};

/**
 * Parses a raw dialog request from an external source (bus event, getArguments).
 */
const parsePresetDialogRequest = (
	raw: unknown,
): PresetDialogRequest | null => {
	const source =
		typeof raw === "string"
			? (() => {
					try {
						return JSON.parse(raw) as unknown;
					} catch {
						return null;
					}
				})()
			: raw;
	if (!source || typeof source !== "object") return null;
	const o = source as Record<string, unknown>;
	if (o.action === "open-create" && typeof o.surfaceId === "string") {
		const rawParams =
			o.params && typeof o.params === "object"
				? (o.params as Record<string, unknown>)
				: undefined;
		// Only primitive scalar values are accepted. The handoff payload is
		// written to disk and later read by the modeless dialog, so allowing
		// nested objects/functions would expose the entry-point to a sibling
		// CEP extension that could inject arbitrary keys.
		const params: Record<string, unknown> = {};
		if (rawParams) {
			for (const [key, value] of Object.entries(rawParams)) {
				if (
					typeof value === "string" ||
					typeof value === "number" ||
					typeof value === "boolean"
				) {
					params[key] = value;
				}
			}
		}
		const surfaceId = o.surfaceId.trim();
		if (!surfaceId) return null;
		return {
			action: "open-create",
			surfaceId,
			params: Object.keys(params).length > 0 ? params : undefined,
		};
	}
	if (o.action === "open-edit" && typeof o.presetId === "string") {
		return { action: "open-edit", presetId: o.presetId };
	}
	return null;
};

// ── External dialog request listener ───────────────────────────────────────

export type ExternalDialogListener = {
	remove: () => void;
};

/**
 * Sets up the external preset dialog request listener on the CSInterface.
 * Returns a cleanup function.
 */
export const setupExternalPresetDialogListener = (
	onRequest: (request: PresetDialogRequest | null) => void,
): ExternalDialogListener | null => {
	const Ctor = (
		window as unknown as {
			CSInterface?: new () => {
				addEventListener?: (
					type: string,
					listener: (event: unknown) => void,
				) => void;
				removeEventListener?: (
					type: string,
					listener: (event: unknown) => void,
				) => void;
			};
		}
	).CSInterface;
	if (!Ctor) return null;
	let removeListener: (() => void) | null = null;
	const cs = new Ctor();
	const handler = (event: unknown): void => {
		const data = (event as { data?: unknown }).data;
		const request = parsePresetDialogRequest(data);
		onRequest(request);
	};
	cs.addEventListener?.("com.adobe.typlus.preset.dialog.request", handler);
	removeListener = () => {
		cs.removeEventListener?.("com.adobe.typlus.preset.dialog.request", handler);
	};
	return { remove: removeListener ?? (() => {}) };
};