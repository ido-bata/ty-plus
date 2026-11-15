/**
 * E2E run context (Issue #108).
 *
 * Ties surface discovery, CDP connections, ExtendScript evaluation, and
 * managed-root file access into the helpers scenario cases use. Everything
 * a case needs to prove "the feature actually did the thing" is reachable
 * from here: DOM state, persisted files, and AE-side state via evalScript.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { type Cdp, connect } from "./cdp";
import {
	findDebugFile,
	type LiveSurface,
	listLiveSurfaces,
	parseDebugFile,
	type SurfaceRef,
} from "./surfaces";

export type E2EOptions = {
	extensionDir: string;
	managedRoot?: string;
	evidenceDir: string;
};

export class E2EContext {
	readonly options: E2EOptions;
	private surfaceCache: SurfaceRef[] | null = null;
	private liveCache: LiveSurface[] | null = null;
	private connections = new Map<string, Cdp>();

	constructor(options: E2EOptions) {
		this.options = options;
	}

	async surfaces(): Promise<SurfaceRef[]> {
		if (!this.surfaceCache) {
			const debugPath = await findDebugFile(this.options.extensionDir);
			this.surfaceCache = await parseDebugFile(debugPath);
		}
		return this.surfaceCache;
	}

	async liveSurfaces(): Promise<LiveSurface[]> {
		if (!this.liveCache) {
			this.liveCache = await listLiveSurfaces(await this.surfaces());
		}
		return this.liveCache;
	}

	async requireSurface(match: {
		surfaceId?: string;
		extensionId?: string;
		port?: number;
		kind?: string;
	}): Promise<LiveSurface> {
		const live = await this.liveSurfaces();
		const found = live.find(
			(s) =>
				(match.surfaceId === undefined || s.surfaceId === match.surfaceId) &&
				(match.extensionId === undefined ||
					s.extensionId === match.extensionId) &&
				(match.port === undefined || s.port === match.port) &&
				(match.kind === undefined || s.kind === match.kind),
		);
		if (!found) {
			const known = live.map((s) => `${s.surfaceId}@${s.port}`).join(", ");
			throw new Error(
				`surface not live: ${JSON.stringify(match)} (live: ${known || "none"})`,
			);
		}
		return found;
	}

	async cdp(surface: LiveSurface): Promise<Cdp> {
		// Cache per CDP target, not per extension: closing a modeless surface
		// (Page.close / window.close) destroys the target, and reopening spawns
		// a fresh one with a new webSocketDebuggerUrl. Keying by extensionId
		// would hand back a dead socket after any close → reopen cycle.
		const key =
			surface.target.id ??
			surface.target.webSocketDebuggerUrl ??
			surface.extensionId;
		const cached = this.connections.get(key);
		if (cached) return cached;
		const wsUrl = surface.target.webSocketDebuggerUrl;
		if (!wsUrl) throw new Error(`no websocket for ${surface.extensionId}`);
		const conn = await connect(wsUrl);
		this.connections.set(key, conn);
		return conn;
	}

	/** Evaluate JS inside a surface's DOM context. */
	async evalJs(surface: LiveSurface, expression: string, timeoutMs?: number) {
		const conn = await this.cdp(surface);
		return conn.evaluate(expression, timeoutMs);
	}

	/** Evaluate ExtendScript inside After Effects via the surface's CSInterface. */
	async evalScript(
		surface: LiveSurface,
		script: string,
		timeoutMs = 60_000,
	): Promise<string> {
		const out = await this.evalJs(
			surface,
			`(async () => {
				try {
					const cs = new CSInterface();
					return await new Promise((res) =>
						cs.evalScript(${JSON.stringify(script)}, (v) => res(String(v))));
				} catch (e) {
					return "e2e-error:" + String(e);
				}
			})()`,
			timeoutMs,
		);
		return String(out ?? "");
	}

	/** Convenience: evalScript on the primary panel. */
	async evalScriptOnPanel1(script: string, timeoutMs?: number) {
		const panel = await this.requireSurface({ surfaceId: "panel-1" });
		return this.evalScript(panel, script, timeoutMs);
	}

	managedRoot(): string {
		if (this.options.managedRoot) return this.options.managedRoot;
		throw new Error("managedRoot not configured — pass --managed-root");
	}

	managedPath(...segments: string[]): string {
		return path.join(this.managedRoot(), ...segments);
	}

	async readManagedText(...segments: string[]): Promise<string | null> {
		try {
			return await readFile(this.managedPath(...segments), "utf8");
		} catch {
			return null;
		}
	}

	async readManagedJson<T = unknown>(...segments: string[]): Promise<T | null> {
		const text = await this.readManagedText(...segments);
		if (text === null) return null;
		try {
			return JSON.parse(text) as T;
		} catch {
			return null;
		}
	}

	async writeEvidence(name: string, data: unknown): Promise<string> {
		const file = path.join(this.options.evidenceDir, name);
		await mkdir(path.dirname(file), { recursive: true });
		await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
		return file;
	}

	async screenshot(surface: LiveSurface, name: string): Promise<string> {
		const file = path.join(this.options.evidenceDir, `${name}.png`);
		const conn = await this.cdp(surface);
		await conn.screenshot(file);
		return file;
	}

	/** Snapshot the managed root so destructive cases can restore it. */
	async snapshotManagedRoot(snapshotDir: string): Promise<void> {
		await rm(snapshotDir, { recursive: true, force: true });
		await mkdir(snapshotDir, { recursive: true });
		await cp(this.managedRoot(), snapshotDir, { recursive: true });
	}

	async restoreManagedRoot(snapshotDir: string): Promise<void> {
		await rm(this.managedRoot(), { recursive: true, force: true });
		await cp(snapshotDir, this.managedRoot(), { recursive: true });
	}

	async close(): Promise<void> {
		for (const conn of this.connections.values()) {
			conn.close();
		}
		this.connections.clear();
	}
}
