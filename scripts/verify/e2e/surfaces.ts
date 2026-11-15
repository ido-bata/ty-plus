/**
 * Surface discovery for ty-plus E2E runs (Issue #108).
 *
 * The installed bundle's `.debug` file maps every extension id to its CEP
 * debug port. This module parses it (dev flavor ports start at 9170,
 * release at 8970) and resolves live CDP targets per port.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { listTargets, type CdpTarget } from "./cdp";

export type SurfaceKind = "panel" | "dialog" | "debug-console" | "unknown";

export type SurfaceRef = {
	extensionId: string;
	port: number;
	surfaceId: string;
	kind: SurfaceKind;
};

export type LiveSurface = SurfaceRef & {
	target: CdpTarget;
};

const EXTENSION_ID = /<Extension\s+Id="([^"]+)"/g;
const PORT = /<Host\s+Name="[^"]+"\s+Port="(\d+)"/;

export const parseDebugFile = async (
	debugPath: string,
): Promise<SurfaceRef[]> => {
	const xml = await readFile(debugPath, "utf8");
	const surfaces: SurfaceRef[] = [];
	for (const match of xml.matchAll(EXTENSION_ID)) {
		const extensionId = match[1];
		if (!extensionId) continue;
		const rest = xml.slice(match.index ?? 0);
		const portMatch = rest.match(PORT);
		if (!portMatch?.[1]) continue;
		const port = Number(portMatch[1]);
		const kind: SurfaceKind = extensionId.includes("panel")
			? "panel"
			: extensionId.includes("debug-console")
				? "debug-console"
				: extensionId.includes("dialog") || extensionId.endsWith(".dialog")
					? "dialog"
					: "unknown";
		const surfaceId = extensionId.replace(/^app\.ty-plus(\.dev)?\./, "");
		surfaces.push({ extensionId, port, surfaceId, kind });
	}
	return surfaces;
};

/**
 * Returns the `.debug` file for an installed bundle directory. Dev bundles
 * ship `dist/<flavor>/.debug`; the CEP install dir may be a symlink to it.
 */
export const findDebugFile = async (
	extensionDir: string,
): Promise<string> => {
	for (const candidate of [".debug", ".debugPanel"]) {
		const p = path.join(extensionDir, candidate);
		try {
			await readFile(p, "utf8");
			return p;
		} catch {
			// try next
		}
	}
	throw new Error(`no .debug file under ${extensionDir}`);
};

/** All live page targets across the given ports. */
export const listLiveSurfaces = async (
	surfaces: SurfaceRef[],
): Promise<LiveSurface[]> => {
	const live: LiveSurface[] = [];
	for (const surface of surfaces) {
		let targets: CdpTarget[];
		try {
			targets = await listTargets(surface.port);
		} catch {
			continue; // surface not open — expected for pooled dialogs
		}
		const target = targets.find(
			(t) => t.type === "page" && Boolean(t.webSocketDebuggerUrl),
		);
		if (target) {
			live.push({ ...surface, target });
		}
	}
	return live;
};
