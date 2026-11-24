/**
 * Debug/diagnostics suite (Issue #108; matrix UC-G02, UC-G03).
 *
 * UC-G02: the debug console is a modeless CEP surface. Messages logged on
 * panel-1 are replayed into a freshly opened console via the replay-request
 * protocol (`dialog-root.tsx`), so close → reopen must show history.
 *
 * UC-G03: dev builds install `__TY_PLUS_OPERATION_WORKER_VERIFY__` on the
 * panel (operation-worker-dev-panel.ts, development-unsigned trust mode
 * only). The case calls that probe — the same entry point
 * `scripts/verify/operation-worker/operation-worker-cep.ts` drives — and asserts the
 * spawn → accept → result → exit evidence shape.
 */

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { type LiveSurface, listLiveSurfaces } from "../surfaces";
import { closeSurfaceSettled, sleep, waitForDom } from "./shared";

const MARKER = "e2e-g02-replay-marker";

const findConsole = async (ctx: E2EContext): Promise<LiveSurface | null> => {
	const live = await listLiveSurfaces(await ctx.surfaces());
	return (
		live.find(
			(s) => s.kind === "debug-console" || s.surfaceId.includes("debug"),
		) ?? null
	);
};

const closeSurface = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<boolean> => {
	// CEP surfaces do not all honour the same close path: `Page.close`
	// works on macOS CEF but leaves the Windows target alive, `window.close()`
	// is ignored for host-opened windows, and `closeExtension()` is the
	// CEP-native shutdown the host itself uses. Try each in turn and verify
	// the target actually disappears before moving on.
	const attempts: Array<() => Promise<unknown>> = [
		async () => {
			const conn = await ctx.cdp(surface);
			await conn.send("Page.close", {}, 5_000);
		},
		async () => {
			await ctx.evalJs(surface, "window.close()");
		},
		async () => {
			await ctx.evalJs(
				surface,
				`(() => {
					try {
						if (typeof CSInterface === "function") {
							new CSInterface().closeExtension();
							return "csinterface";
						}
					} catch (e) { /* fall through */ }
					try {
						window.__adobe_cep__?.closeExtension?.();
						return "adobe_cep";
					} catch (e) { return "failed"; }
				})()`,
			);
		},
	];
	for (const attempt of attempts) {
		try {
			await attempt();
		} catch {
			// try the next close path
		}
		const deadline = Date.now() + 4_000;
		while (Date.now() < deadline) {
			await sleep(400);
			if ((await findConsole(ctx)) === null) return true;
		}
	}
	return false;
};

const openConsole = async (ctx: E2EContext): Promise<LiveSurface | null> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	await ctx.evalJs(
		panel,
		`(() => {
			const btn = document.querySelector('[data-ws-action="toggle-console"]');
			if (!btn) return "no-toggle";
			btn.click();
			return "clicked";
		})()`,
	);
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		await sleep(700);
		const consoleSurface = await findConsole(ctx);
		if (consoleSurface) {
			const mounted = await waitForDom(
				ctx,
				consoleSurface,
				`document.querySelectorAll("[data-debug-msg-id]").length > 0 ||
				 (document.body ? document.body.innerHTML.length > 500 : false)`,
				10_000,
			);
			if (mounted) return consoleSurface;
		}
	}
	return null;
};

const consoleState = `(() => ({
	msgCount: document.querySelectorAll("[data-debug-msg-id]").length,
	hasMarker: (document.body ? document.body.innerText : "").includes(${JSON.stringify(MARKER)}),
}))()`;

export const debugCases: E2ECase[] = [
	{
		uc: "UC-G02",
		title: "debug console reopen replays previously logged messages",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			try {
				// Guarantee at least one replayable message exists.
				const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
				await ctx.evalJs(panel, `console.log(${JSON.stringify(MARKER)})`);
				await sleep(500);

				// Start from a closed console so open/close/reopen is exercised.
				const preExisting = await findConsole(ctx);
				if (preExisting) {
					await closeSurface(ctx, preExisting);
				}

				const first = await openConsole(ctx);
				checks.push(
					check(
						"debug console opens",
						first !== null,
						first ? "live" : "not live",
					),
				);
				if (!first) {
					return { detail: "console did not open", checks };
				}
				const firstState = (await waitForDom(
					ctx,
					first,
					`(() => { const s = ${consoleState}; return s.hasMarker ? s : null; })()`,
					15_000,
				)) as { msgCount?: number; hasMarker?: boolean } | null;
				checks.push(
					check(
						"marker message visible in first open",
						Boolean(firstState?.hasMarker),
						`msgs=${firstState?.msgCount} marker=${firstState?.hasMarker}`,
					),
				);
				const firstCount = firstState?.msgCount ?? 0;

				const closed = await closeSurface(ctx, first);
				checks.push(
					check(
						"debug console closes",
						closed,
						closed ? "closed" : "still live",
					),
				);
				if (!closed) {
					return { detail: "console did not close", checks };
				}

				const second = await openConsole(ctx);
				checks.push(
					check(
						"debug console reopens",
						second !== null,
						second ? "live" : "not live",
					),
				);
				if (!second) {
					return { detail: "console did not reopen", checks };
				}
				// Replay is asynchronous: the console paints open-params first,
				// then merges the replay-response bus snapshot. Wait for the
				// marker specifically — msgCount>0 alone can match the single
				// initial row before history arrives.
				const secondState = (await waitForDom(
					ctx,
					second,
					`(() => { const s = ${consoleState}; return s.hasMarker ? s : null; })()`,
					30_000,
				)) as { msgCount?: number; hasMarker?: boolean } | null;
				checks.push(
					check(
						"reopened console replays history (msg count > 0)",
						(secondState?.msgCount ?? 0) > 0,
						`msgs=${secondState?.msgCount} (first open had ${firstCount})`,
					),
				);
				checks.push(
					check(
						"replayed history includes pre-close marker",
						secondState?.hasMarker === true,
						`hasMarker=${secondState?.hasMarker}`,
					),
				);
				return { detail: "close → reopen replay", checks };
			} finally {
				// Never leak an open console — a leftover surface would be picked
				// up as `preExisting` by the next run and skew open timing.
				// `closeSurfaceSettled` also waits out the open-retry window so
				// a pending requestOpenExtension cannot resurrect it.
				await closeSurfaceSettled(
					() => findConsole(ctx),
					(s) => closeSurface(ctx, s),
				);
			}
		},
	},
	{
		uc: "UC-G03",
		title: "operation worker verify: spawn → accept → result → exit",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const panel = await typed.requireSurface({ surfaceId: "panel-1" });
				const present = await typed.evalJs(
					panel,
					`typeof globalThis.__TY_PLUS_OPERATION_WORKER_VERIFY__`,
				);
				return present === "function"
					? null
					: "dev-only probe absent (requires development-unsigned build)";
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			const result = (await ctx.evalJs(
				panel,
				`(async () => {
					const fn = globalThis.__TY_PLUS_OPERATION_WORKER_VERIFY__;
					if (typeof fn !== "function") return { missing: true };
					return await fn();
				})()`,
				130_000,
			)) as {
				ok?: boolean;
				error?: string;
				rowCount?: number;
				warningCount?: number;
				progressStages?: string[];
				worker?: {
					accepted?: boolean;
					finalResponse?: boolean;
					stdoutEof?: boolean;
					closeExitCode?: number | null;
					pid?: number;
					artifactSha256?: string;
				};
			};
			await ctx.writeEvidence("uc-g03-operation-worker.json", result);
			if (result?.ok !== true) {
				checks.push(
					check(
						"operation worker verify returned ok",
						false,
						`error=${result?.error ?? "none"}`,
					),
				);
				return { detail: "worker verify failed", checks };
			}
			const worker = result.worker ?? {};
			checks.push(
				check(
					"rowCount > 0",
					(result.rowCount ?? 0) > 0,
					`rows=${result.rowCount}`,
				),
				check(
					"progress stages reach finished",
					result.progressStages?.at(-1) === "finished",
					(result.progressStages ?? []).join(">"),
				),
				check(
					"worker accepted + final response + stdout EOF + exit 0",
					worker.accepted === true &&
						worker.finalResponse === true &&
						worker.stdoutEof === true &&
						worker.closeExitCode === 0,
					`accepted=${worker.accepted} final=${worker.finalResponse} eof=${worker.stdoutEof} exit=${worker.closeExitCode}`,
				),
			);
			return {
				detail: `worker pid=${worker.pid} sha=${String(worker.artifactSha256 ?? "").slice(0, 12)}`,
				checks,
				evidence: ["uc-g03-operation-worker.json"],
			};
		},
	},
];
