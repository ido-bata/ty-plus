import {
	SHELL_CHANNELS,
	type SurfaceMessageEnvelope,
	type SurfaceTransport,
} from "@/management/workspace/surface/contract";

/**
 * APPLICATION-scoped CEP event type. Avoid ":" in the type string  Esome hosts
 * mishandle it; use reverse-DNS dots only (Adobe cookbook pattern).
 */
const SURFACE_MESSAGE_EVENT = "com.typlus.surfaceMessage";

type CepDispatchEvent = {
	type: string;
	scope?: string;
	appId?: string | null;
	extensionId?: string | null;
	data: string;
};

type CepAdobeInterface = {
	addEventListener?: (
		type: string,
		handler: (event: { data: string }) => void,
		obj?: unknown,
	) => void;
	removeEventListener?: (
		type: string,
		handler: (event: { data: string }) => void,
		obj?: unknown,
	) => void;
	dispatchEvent?: (event: CepDispatchEvent) => void;
	getArguments?: () => string;
	requestOpenExtension?: (extensionId: string, params: string) => void;
};

type CepCsInstance = {
	addEventListener?: (
		type: string,
		handler: (event: { data: string }) => void,
		obj?: unknown,
	) => void;
	removeEventListener?: (
		type: string,
		handler: (event: { data: string }) => void,
		obj?: unknown,
	) => void;
	dispatchEvent?: (event: CepDispatchEvent) => void;
	getArguments?: () => string | null;
	requestOpenExtension?: (extensionId: string, params: string) => void;
	/** CSInterface: returns parsed host environment (includes appId). */
	getHostEnvironment?: () => unknown;
	getApplicationID?: () => string;
	getExtensionID?: () => string;
};

type CepCsFactory = new () => CepCsInstance;
type CepEventFactory = new (
	type: string,
	scope: string,
	appId?: string | null,
	extensionId?: string | null,
) => CepDispatchEvent;

const getAdobeHost = (win: Window): CepAdobeInterface | undefined =>
	(win as unknown as { __adobe_cep__?: CepAdobeInterface }).__adobe_cep__;

const getCsFactory = (win: Window): CepCsFactory | undefined =>
	(win as unknown as { CSInterface?: CepCsFactory }).CSInterface;

const getCsEventFactory = (win: Window): CepEventFactory | undefined =>
	(win as unknown as { CSEvent?: CepEventFactory }).CSEvent;

const extractEventDataString = (ev: unknown): string | null => {
	if (!ev || typeof ev !== "object") return null;
	const raw = (ev as { data?: unknown }).data;
	if (typeof raw === "string") return raw;
	if (raw && typeof raw === "object") {
		try {
			return JSON.stringify(raw);
		} catch {
			return null;
		}
	}
	return null;
};

const SURFACE_MESSAGE_KINDS = new Set(["request", "response", "publish"]);
const SHELL_CHANNEL_SET = new Set<string>(Object.values(SHELL_CHANNELS));
const SURFACE_ID_PATTERN =
	/^(?:panel-[1-5]|dialog-[a-z0-9-]+|debug-console|onboarding)$/;

/**
 * Strict envelope validator used by both `publish` (no-op here) and
 * `subscribe` (drops invalid payloads). Exported so tests can verify
 * that `SHELL_CHANNELS.debug` is in the accepted channel set (Issue
 * #129 regression).
 */
export const isSurfaceMessageEnvelope = (
	value: unknown,
): value is SurfaceMessageEnvelope => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const envelope = value as Record<string, unknown>;
	return (
		typeof envelope.messageId === "string" &&
		envelope.messageId.length > 0 &&
		typeof envelope.channel === "string" &&
		SHELL_CHANNEL_SET.has(envelope.channel) &&
		typeof envelope.kind === "string" &&
		SURFACE_MESSAGE_KINDS.has(envelope.kind) &&
		typeof envelope.sourceSurfaceId === "string" &&
		SURFACE_ID_PATTERN.test(envelope.sourceSurfaceId) &&
		typeof envelope.createdAt === "number" &&
		Number.isFinite(envelope.createdAt) &&
		envelope.createdAt > 0
	);
};

const createSurfaceLink = (win: Window): SurfaceTransport => {
	const addListener = (handler: (event: { data: string }) => void) => {
		const wrapped = (ev: unknown) => {
			const data = extractEventDataString(ev);
			if (data === null || data.length === 0) return;
			handler({ data });
		};

		const csFactory = getCsFactory(win);
		if (csFactory) {
			const cs = new csFactory();
			cs.addEventListener?.(SURFACE_MESSAGE_EVENT, wrapped, null);
			return () =>
				cs.removeEventListener?.(SURFACE_MESSAGE_EVENT, wrapped, null);
		}

		getAdobeHost(win)?.addEventListener?.(SURFACE_MESSAGE_EVENT, wrapped, null);
		return () =>
			getAdobeHost(win)?.removeEventListener?.(
				SURFACE_MESSAGE_EVENT,
				wrapped,
				null,
			);
	};

	return {
		async publish(message: SurfaceMessageEnvelope) {
			const payload = JSON.stringify(message);
			const csFactory = getCsFactory(win);
			const eventFactory = getCsEventFactory(win);
			const scopes = ["APPLICATION", "GLOBAL"] as const;
			if (csFactory) {
				const cs = new csFactory();
				const appId = cs.getApplicationID?.() ?? null;
				for (const scope of scopes) {
					const event: CepDispatchEvent = eventFactory
						? new eventFactory(SURFACE_MESSAGE_EVENT, scope, appId, "")
						: {
								type: SURFACE_MESSAGE_EVENT,
								scope,
								appId,
								extensionId: "",
								data: "",
							};
					event.data = payload;
					cs.dispatchEvent?.(event);
				}
				return;
			}

			for (const scope of scopes) {
				getAdobeHost(win)?.dispatchEvent?.({
					type: SURFACE_MESSAGE_EVENT,
					scope,
					data: payload,
				});
			}
		},
		subscribe(handler: (message: SurfaceMessageEnvelope) => void) {
			return addListener((event) => {
				try {
					const parsed: unknown = JSON.parse(event.data);
					if (isSurfaceMessageEnvelope(parsed)) handler(parsed);
				} catch {
					/* invalid payload */
				}
			});
		},
	};
};

export { createSurfaceLink as createCepSurfaceTransport };

const openDialogSurface = (
	win: Window,
	input: {
		extensionId: string;
		params: Record<string, unknown>;
	},
) => {
	const keys = Object.keys(input.params);
	const payload = keys.length === 0 ? "" : JSON.stringify(input.params);
	const csFactory = getCsFactory(win);

	const callOpen = (): void => {
		if (csFactory) {
			const cs = new csFactory();
			cs.requestOpenExtension?.(input.extensionId, payload);
			return;
		}
		getAdobeHost(win)?.requestOpenExtension?.(input.extensionId, payload);
	};

	// CEF / AE: First call may only initialize the subprocess with no UI.
	// Resend same payload incrementally to cover until host brings Modeless to front.
	callOpen();
	if (typeof queueMicrotask === "function") {
		queueMicrotask(callOpen);
	}
	if (typeof globalThis.setTimeout === "function") {
		const followMs = [16, 48, 112, 220, 400, 700, 1100, 1800, 2600] as const;
		for (const ms of followMs) {
			globalThis.setTimeout(callOpen, ms);
		}
	}
};

export { openDialogSurface as openCepDialogSurface };

const readOpenParams = <T extends Record<string, unknown>>(
	win: Window,
): T | null => {
	const adobe = getAdobeHost(win);
	const fromAdobe = (() => {
		try {
			return adobe?.getArguments?.() ?? null;
		} catch {
			return null;
		}
	})();

	const csFactory = getCsFactory(win);
	const fromCs = (() => {
		if (!csFactory) {
			return null;
		}
		try {
			const cs = new csFactory();
			return cs.getArguments?.() ?? null;
		} catch {
			return null;
		}
	})();

	const raw = fromAdobe ?? fromCs ?? null;
	if (raw == null) {
		return null;
	}
	if (typeof raw === "object" && !Array.isArray(raw)) {
		return raw as T;
	}
	if (typeof raw !== "string" || raw.length === 0) {
		return null;
	}

	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
};

export { readOpenParams as readCepOpenParams };

/** CEP extension id for ty-plus workspace surfaces (panel-1 is the docked primary). */
export const tyPlusWorkspaceExtensionId = (panelIndex: number): string =>
	`app.ty-plus.panel${panelIndex}`;
