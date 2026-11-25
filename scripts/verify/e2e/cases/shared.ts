/**
 * Shared helpers for E2E cases that mutate the managed root or reload
 * surfaces (Issue #108 follow-up).
 *
 * Two disciplines live here so every destructive case gets them for free:
 *
 * - `withManagedRootSnapshot` — snapshot the whole managed root before a
 *   mutation and restore it in `finally`, even when assertions fail.
 * - `reloadSurface` / `waitForDom` — CEP panels re-run their whole boot on
 *   navigation, which is the only honest way to exercise "app reads the
 *   file at startup" behaviour.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { E2EContext } from "../ctx";
import type { LiveSurface } from "../surfaces";

export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const bootProbe = `(() => {
	const root = document.querySelector("#root, [data-ty-shell], body");
	return {
		readyState: document.readyState,
		hasRoot: Boolean(root),
		bodyLength: document.body ? document.body.innerHTML.length : 0,
		hasCsInterface: typeof window.__adobe_cep__ !== "undefined",
	};
})()`;

/**
 * Reload a CEP surface and wait until its DOM booted again. Prefers the
 * CDP `Page.reload` command; falls back to `location.reload()` when the
 * target rejects the command (older CEF builds).
 */
export const reloadSurface = async (
	ctx: E2EContext,
	surface: LiveSurface,
	timeoutMs = 45_000,
): Promise<void> => {
	const conn = await ctx.cdp(surface);
	try {
		await conn.send("Page.reload", { ignoreCache: false }, 15_000);
	} catch {
		await ctx.evalJs(surface, "location.reload()");
	}
	const deadline = Date.now() + timeoutMs;
	let last: unknown = null;
	while (Date.now() < deadline) {
		await sleep(700);
		try {
			last = await ctx.evalJs(surface, bootProbe, 10_000);
		} catch {
			continue; // mid-navigation — the context is briefly gone
		}
		const boot = last as {
			readyState?: string;
			bodyLength?: number;
			hasCsInterface?: boolean;
		};
		if (
			boot.readyState === "complete" &&
			(boot.bodyLength ?? 0) > 100 &&
			boot.hasCsInterface
		) {
			return;
		}
	}
	throw new Error(
		`surface ${surface.surfaceId} did not finish booting after reload (last=${JSON.stringify(last)})`,
	);
};

export const reloadPanel1 = async (
	ctx: E2EContext,
	timeoutMs?: number,
): Promise<LiveSurface> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	await reloadSurface(ctx, panel, timeoutMs);
	return panel;
};

/** Poll `expression` (must evaluate truthy) until it passes or times out. */
export const waitForDom = async <T = unknown>(
	ctx: E2EContext,
	surface: LiveSurface,
	expression: string,
	timeoutMs = 30_000,
	intervalMs = 500,
): Promise<T> => {
	const deadline = Date.now() + timeoutMs;
	let last: unknown = null;
	while (Date.now() < deadline) {
		try {
			last = await ctx.evalJs(surface, expression, 10_000);
		} catch {
			last = null;
		}
		if (last) return last as T;
		await sleep(intervalMs);
	}
	return last as T;
};

/**
 * Close a surface and keep it closed. `openCepDialogSurface` re-issues
 * `requestOpenExtension` on a ~6s retry schedule for slow CEF boots, so a
 * surface closed inside that window can be resurrected by a pending retry.
 * Close once, wait for the target to disappear, then re-check after the
 * retry window and close again if it came back.
 */
export const closeSurfaceSettled = async (
	findSurface: () => Promise<LiveSurface | null>,
	close: (surface: LiveSurface) => Promise<unknown>,
	retryWindowMs = 7_000,
): Promise<void> => {
	const first = await findSurface();
	if (first) await close(first);
	await sleep(retryWindowMs);
	const second = await findSurface();
	if (second) await close(second);
};

/** Snapshot → run → restore (always). Returns the callback's value. */
export const withManagedRootSnapshot = async <T>(
	ctx: E2EContext,
	name: string,
	fn: () => Promise<T>,
): Promise<T> => {
	// Snapshots contain a full copy of the managed root (user data) — keep
	// them out of the evidence dir so run artifacts stay committable.
	const snapshotDir = path.join(
		os.tmpdir(),
		"ty-plus-e2e-snapshots",
		String(process.pid),
		name,
	);
	await ctx.snapshotManagedRoot(snapshotDir);
	try {
		return await fn();
	} finally {
		await ctx.restoreManagedRoot(snapshotDir);
		// The live panel still holds the mutated in-memory layout and will
		// re-persist it over the restored files. Reload so it resyncs from
		// disk; best-effort — suites without a live panel skip this.
		try {
			await reloadPanel1(ctx, 30_000);
		} catch {
			// no panel-1 surface or still booting
		}
	}
};

/** Selector for the StatusBar debug-console toggle (panel boot dependent). */
export const DEBUG_CONSOLE_TOGGLE_SELECTOR =
	'[data-ws-action="toggle-console"]';

/**
 * Click the StatusBar debug-console toggle. Waits for the button to mount
 * first: right after a surface reload the status bar is not in the DOM yet,
 * and a blind `btn.click()` silently returns "no-toggle" — the caller then
 * polls for a console surface that was never asked to open (observed as
 * UC-G01/UC-G02 "not live" flakes right after sandbox prepare reloads).
 */
export const clickDebugConsoleToggle = async (
	ctx: E2EContext,
	panel: LiveSurface,
): Promise<boolean> => {
	const mounted = await waitForDom(
		ctx,
		panel,
		`Boolean(document.querySelector(${JSON.stringify(DEBUG_CONSOLE_TOGGLE_SELECTOR)}))`,
		20_000,
	);
	if (!mounted) return false;
	const result = await ctx.evalJs(
		panel,
		`(() => {
			const btn = document.querySelector(${JSON.stringify(DEBUG_CONSOLE_TOGGLE_SELECTOR)});
			if (!btn) return "no-toggle";
			btn.click();
			return "clicked";
		})()`,
	);
	return result === "clicked";
};

/** Best-effort close for a live surface (Page.close → window.close). */
export const closeLiveSurface = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<void> => {
	try {
		const conn = await ctx.cdp(surface);
		await conn.send("Page.close", {}, 5_000);
		return;
	} catch {
		// fall through to window.close
	}
	try {
		await ctx.evalJs(
			surface,
			`(() => { try { window.close(); return "ok"; } catch (e) { return String(e); } })()`,
		);
	} catch {
		// best-effort only
	}
};

export const managedFilePath = (
	ctx: E2EContext,
	...segments: string[]
): string => ctx.managedPath(...segments);

export const readManagedFileBytes = async (
	ctx: E2EContext,
	...segments: string[]
): Promise<Buffer | null> => {
	try {
		return await readFile(ctx.managedPath(...segments));
	} catch {
		return null;
	}
};

export const writeManagedFile = async (
	ctx: E2EContext,
	segments: string[],
	data: string | Buffer,
): Promise<void> => {
	const file = ctx.managedPath(...segments);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, data);
};

/** Truncated-JSON corruption: parses as "file exists, not valid" everywhere. */
export const corruptJsonBytes = (prefix: string): Buffer =>
	Buffer.from(`${prefix}{"e2e-corrupt":`, "utf8");

export const tileCountExpression = `document.querySelectorAll(
	"[data-workspace-preset-tile], [data-workspace-widget-tile], [data-workspace-group-tile]"
).length`;
