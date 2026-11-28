/**
 * Smoke suite: proves every reachable surface is alive and the persisted
 * state + host bridge are intact. Maps to UC-A02/A03/A04, UC-G01, UC-H01.
 */

import { DEFAULT_SETTINGS } from "../../../../src/management/setting/models/settings";
import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { type LiveSurface, listLiveSurfaces } from "../surfaces";
import { resolveLocaleKey, surfaceLang } from "./i18n";
import {
	clickDebugConsoleToggle,
	closeLiveSurface,
	closeSurfaceSettled,
	sleep,
	waitForDom,
} from "./shared";

const bootExpression = `(() => {
	const root = document.querySelector("#root, [data-ty-shell], body");
	return {
		readyState: document.readyState,
		hasRoot: Boolean(root),
		bodyLength: document.body ? document.body.innerHTML.length : 0,
		url: location.href,
		hasCsInterface: typeof window.__adobe_cep__ !== "undefined",
	};
})()`;

export const smokeCases: E2ECase[] = [
	{
		uc: "UC-A03",
		title: "live surfaces boot with CEP bridge and extension origin",
		async run(ctx: E2EContext) {
			const live = await ctx.liveSurfaces();
			const checks = [];
			checks.push(
				check(
					"at least one surface is live",
					live.length > 0,
					`${live.length} live surfaces`,
				),
			);
			const panels = live.filter((s) => s.kind === "panel");
			checks.push(
				check(
					"panel-1 is live",
					panels.some((s) => s.surfaceId === "panel-1"),
					panels.map((s) => s.surfaceId).join(","),
				),
			);
			for (const surface of live) {
				const boot = (await ctx.evalJs(surface, bootExpression)) as {
					readyState?: string;
					hasRoot?: boolean;
					bodyLength?: number;
					url?: string;
					hasCsInterface?: boolean;
				};
				checks.push(
					check(
						`${surface.surfaceId} boots`,
						Boolean(boot.hasRoot) &&
							(boot.bodyLength ?? 0) > 100 &&
							Boolean(boot.hasCsInterface),
						`readyState=${boot.readyState} body=${boot.bodyLength} cs=${boot.hasCsInterface}`,
					),
				);
				checks.push(
					check(
						`${surface.surfaceId} loads from CEP extensions`,
						(boot.url ?? "").includes("CEP/extensions") ||
							(boot.url ?? "").includes("cep-dev") ||
							(boot.url ?? "").startsWith("file:"),
						boot.url ?? "",
					),
				);
			}
			const evidence: string[] = [];
			for (const surface of live.slice(0, 4)) {
				evidence.push(
					await ctx.screenshot(surface, `smoke-${surface.surfaceId}`),
				);
			}
			return {
				detail: `${live.length} live surfaces checked`,
				checks,
				evidence,
			};
		},
	},
	{
		uc: "UC-H01",
		title: "ExtendScript host responds and host bundle contract is callable",
		async run(ctx: E2EContext) {
			const checks = [];
			const appVersion = await ctx.evalScriptOnPanel1("app.version");
			checks.push(
				check(
					"app.version responds",
					appVersion.length > 0 && !appVersion.startsWith("e2e-error"),
					appVersion,
				),
			);
			// The host bundle is installed lazily on first host call, so a
			// fresh AE has no resident contract. Load it explicitly (same as
			// scripts/verify/device-smoke.ts) before probing the contract.
			const hostPath = `${ctx.options.extensionDir}/jsx/ty-plus-host.jsx`;
			const contract = await ctx.evalScriptOnPanel1(
				`(function(){
					try { $.evalFile(${JSON.stringify(hostPath)}); }
					catch (e) { return "evalfile-error:" + e.toString(); }
					var h = $.global && $.global.__TY_PLUS_HOST__;
					return h && typeof h.getHostContext === "function"
						? "contract-ok"
						: "contract-missing:" + typeof h;
				})()`,
			);
			checks.push(
				check(
					"host bundle exposes callable contract",
					contract === "contract-ok",
					contract,
				),
			);
			return { detail: `AE ${appVersion}`, checks };
		},
	},
	{
		uc: "UC-A02",
		title: "persisted settings/layout/theme files exist and parse",
		async run(ctx: E2EContext) {
			const checks = [];
			const appJson = await ctx.readManagedJson<{
				core?: { paths?: { supportRoot?: string } };
			}>("settings", "app.json");
			checks.push(
				check(
					"settings/app.json parses",
					appJson !== null && typeof appJson === "object",
					appJson ? "ok" : "missing/unparseable",
				),
			);
			for (const rel of [
				["workspaces", "workspace-1.json"],
				["presets", "presets.json"],
			] as const) {
				const doc = await ctx.readManagedJson(rel[0], rel[1]);
				checks.push(
					check(
						`${rel.join("/")} parses`,
						doc !== null && typeof doc === "object",
						doc ? "ok" : "missing/unparseable",
					),
				);
			}
			const themeCss = await ctx.readManagedText("styles", "theme.css");
			// theme.css is written lazily: it only exists once a non-default
			// theme/ui override has been persisted. Absence is valid while
			// settings/ui.* still equals the shipped defaults.
			const appSettings = (
				await ctx.readManagedJson<{
					ui?: {
						accentColor?: string;
						textColor?: string;
						widget?: { backgroundColor?: string; opacity?: number };
						panel?: { backgroundColor?: string; opacity?: number };
					};
				}>("settings", "app.json")
			)?.ui;
			const defaults = {
				accentColor: "#5886ff",
				textColor: "#f0f0f0",
				widgetBg: "#1a1a1a",
				widgetOpacity: 80,
				panelBg: "#0f0f0f",
				panelOpacity: 95,
			};
			const hasOverrides = Boolean(
				appSettings &&
					((appSettings.accentColor !== undefined &&
						appSettings.accentColor !== defaults.accentColor) ||
						(appSettings.textColor !== undefined &&
							appSettings.textColor !== defaults.textColor) ||
						(appSettings.widget?.backgroundColor !== undefined &&
							appSettings.widget.backgroundColor !== defaults.widgetBg) ||
						(appSettings.widget?.opacity !== undefined &&
							appSettings.widget.opacity !== defaults.widgetOpacity) ||
						(appSettings.panel?.backgroundColor !== undefined &&
							appSettings.panel.backgroundColor !== defaults.panelBg) ||
						(appSettings.panel?.opacity !== undefined &&
							appSettings.panel.opacity !== defaults.panelOpacity)),
			);
			checks.push(
				check(
					"styles/theme.css state consistent with overrides",
					themeCss !== null || !hasOverrides,
					themeCss !== null
						? `${themeCss.length} bytes`
						: hasOverrides
							? "missing despite non-default ui.* settings"
							: "absent (defaults only — written on first override)",
				),
			);
			return { detail: "managed root files", checks };
		},
	},
	{
		uc: "UC-B04",
		title: "grid settings persisted value reaches panel CSS variables",
		async run(ctx: E2EContext) {
			const checks = [];
			const appJson = await ctx.readManagedJson<{
				workspace?: { grid?: { cellSize?: number } };
			}>("settings", "app.json");
			const persistedCellSize = appJson?.workspace?.grid?.cellSize;
			// `workspace.grid` is only written once the user changes grid
			// settings; an absent key means the model default applies
			// (`coerceSettings` merges DEFAULT_SETTINGS).
			const cellSize =
				typeof persistedCellSize === "number"
					? persistedCellSize
					: (DEFAULT_SETTINGS.workspace.grid?.cellSize ?? 48);
			checks.push(
				check(
					"settings.workspace.grid.cellSize resolves (persisted or default)",
					typeof cellSize === "number",
					`cellSize=${cellSize} persisted=${persistedCellSize}`,
				),
			);
			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			const computed = (await ctx.evalJs(
				panel,
				`(() => {
					const cs = getComputedStyle(document.documentElement);
					return {
						cell: cs.getPropertyValue("--ty-ws-cell").trim(),
						gap: cs.getPropertyValue("--ty-ws-grid-gap").trim(),
					};
				})()`,
			)) as { cell?: string; gap?: string };
			checks.push(
				check(
					"--ty-ws-cell reflects persisted grid",
					typeof cellSize === "number" && computed.cell === `${cellSize}px`,
					`computed=${computed.cell} expected=${cellSize}px`,
				),
			);
			return { detail: "grid token convergence", checks };
		},
	},
	{
		uc: "UC-E02",
		title: "ui accent color persisted in app.json reaches theme.css tokens",
		async run(ctx: E2EContext) {
			const checks = [];
			const appJson = await ctx.readManagedJson<{
				ui?: { accentColor?: string };
			}>("settings", "app.json");
			const accent = appJson?.ui?.accentColor;
			checks.push(
				check(
					"ui.accentColor present in app.json",
					typeof accent === "string" && accent.startsWith("#"),
					`accent=${accent}`,
				),
			);
			// ui.* values equal to DEFAULT_SETTINGS.ui emit no override, so
			// theme.css only carries the accent token when it differs.
			const expectsOverride = accent !== "#5886ff";
			const themeCss = await ctx.readManagedText("styles", "theme.css");
			const hasAccentToken =
				typeof accent === "string" &&
				themeCss !== null &&
				themeCss.includes(`--color-ty-accent: ${accent}`);
			checks.push(
				check(
					"theme.css accent token matches ui.* projection",
					expectsOverride ? hasAccentToken : true,
					accent && themeCss
						? (themeCss.match(/--color-ty-accent:[^;]+/)?.[0] ?? "no token") +
								(expectsOverride ? "" : " (default — no override expected)")
						: "theme.css missing",
				),
			);
			return { detail: "ui.* → theme pipeline", checks };
		},
	},
	{
		uc: "UC-G01",
		title: "debug console surface aggregates logs and evaluates JS",
		async run(ctx: E2EContext) {
			const checks = [];
			// The console is a Modeless surface opened from the StatusBar
			// toggle (or Ctrl+`). The toggle can exist before React attaches
			// its handler, so retry the click until the surface mounts.
			const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
			const findConsole = async (): Promise<LiveSurface | null> => {
				const live = await listLiveSurfaces(await ctx.surfaces());
				return (
					live.find(
						(s) => s.kind === "debug-console" || s.surfaceId.includes("debug"),
					) ?? null
				);
			};
			try {
				await clickDebugConsoleToggle(ctx, panel);
				// requestOpenExtension re-issues on a multi-second retry
				// schedule while CEF spawns the window — a single sample after
				// a fixed sleep flakes whenever boot is slower than the sleep.
				let consoleSurface: LiveSurface | null = null;
				const deadline = Date.now() + 20_000;
				while (Date.now() < deadline) {
					await sleep(700);
					consoleSurface = await findConsole();
					if (consoleSurface) break;
				}
				if (!consoleSurface) {
					checks.push(
						check("debug console surface open", false, "not live after toggle"),
					);
					return {
						detail:
							"debug-console surface did not open — open it from StatusBar",
						checks,
					};
				}
				const mounted = await waitForDom(
					ctx,
					consoleSurface,
					`document.body ? document.body.innerHTML.length > 100 : false`,
					10_000,
				);
				const state = mounted
					? ((await ctx.evalJs(
							consoleSurface,
							`(() => ({
								url: location.href,
								bodyLength: document.body ? document.body.innerHTML.length : 0,
								msgCount: document.querySelectorAll("[data-debug-msg-id]").length,
							}))()`,
						)) as {
							url?: string;
							bodyLength?: number;
							msgCount?: number;
						})
					: null;
				checks.push(
					check(
						"debug console DOM mounted",
						(state?.bodyLength ?? 0) > 100,
						`body=${state?.bodyLength} msgs=${state?.msgCount}`,
					),
				);
				if (!mounted || !state) {
					return { detail: "debug console", checks };
				}

				// ── UC-G01 real coverage (Issue #786) ──────────────────────────
				// 1. REPL evaluate: type an expression into the console input
				//    and press Enter. `executeCommand` evals it and pipes the
				//    result back through console.log → a new message row.
				const lang = await surfaceLang(ctx, consoleSurface);
				const evalAria =
					(await resolveLocaleKey(lang, "common:debugConsole.evaluateAria")) ??
					"Evaluate JavaScript";
				const evalExpr = `"e2e-g01-" + (6 * 7)`;
				const evalSent = await ctx.evalJs(
					consoleSurface,
					`(() => {
						const label = ${JSON.stringify(evalAria)};
						const inputs = [...document.querySelectorAll("input")];
						const input = inputs.find((i) =>
							(i.getAttribute("aria-label") || "") === label) ??
							inputs[inputs.length - 1];
						if (!input) return "no-input";
						const setter = Object.getOwnPropertyDescriptor(
							window.HTMLInputElement.prototype, "value").set;
						setter.call(input, ${JSON.stringify(evalExpr)});
						input.dispatchEvent(new KeyboardEvent("keydown", {
							key: "Enter", bubbles: true, cancelable: true }));
						return "sent:" + input.value;
					})()`,
				);
				checks.push(
					check(
						"console REPL input accepted expression",
						String(evalSent).startsWith("sent:"),
						String(evalSent),
					),
				);
				const resultSeen = await waitForDom(
					ctx,
					consoleSurface,
					`(() => [...document.querySelectorAll("[data-debug-msg-id]")]
						.some((r) => (r.textContent || "").includes("e2e-g01-42")))()`,
					20_000,
				);
				checks.push(
					check(
						"evaluated result logged as console message",
						Boolean(resultSeen),
						`rowWithResult=${String(resultSeen).slice(0, 80)}`,
					),
				);

				// 2. Error path: an expression that throws must surface as an
				//    error-level row (executeCommand → console.error).
				await ctx.evalJs(
					consoleSurface,
					`(() => {
						const inputs = [...document.querySelectorAll("input")];
						const input = inputs[inputs.length - 1];
						if (!input) return "no-input";
						const setter = Object.getOwnPropertyDescriptor(
							window.HTMLInputElement.prototype, "value").set;
						setter.call(input, 'throw new Error("e2e-g01-err")');
						input.dispatchEvent(new KeyboardEvent("keydown", {
							key: "Enter", bubbles: true, cancelable: true }));
						return "sent";
					})()`,
				);
				const errSeen = await waitForDom(
					ctx,
					consoleSurface,
					`(() => [...document.querySelectorAll("[data-debug-msg-id]")]
						.some((r) => (r.textContent || "").includes("e2e-g01-err")))()`,
					20_000,
				);
				checks.push(
					check(
						"throwing expression logged as error row",
						Boolean(errSeen),
						`rowWithError=${String(errSeen).slice(0, 80)}`,
					),
				);

				// 3. Level filter: pick the level SegmentedControl (the toolbar
				//    with exactly 5 options: all/log/info/warn/error) and
				//    activate "error". Every rendered row must then be
				//    error-level — the level chip is the row's 2nd child.
				const filterProbe = `(() => {
					const toolbars = [...document.querySelectorAll('[role="toolbar"]')];
					const levelBar = toolbars.find((tb) =>
						tb.querySelectorAll('button[aria-pressed]').length === 5);
					if (!levelBar) return { ok: false, reason: "no-level-toolbar" };
					const buttons = [...levelBar.querySelectorAll('button[aria-pressed]')];
					const errorBtn = buttons[4]; // FILTERS order: all,log,info,warn,error
					if (!errorBtn) return { ok: false, reason: "no-error-option" };
					errorBtn.click();
					return { ok: true, pressed: errorBtn.getAttribute("aria-pressed") };
				})()`;
				const filterClicked = await ctx.evalJs(consoleSurface, filterProbe);
				await sleep(800);
				const filteredState = (await ctx.evalJs(
					consoleSurface,
					`(() => {
						const rows = [...document.querySelectorAll("[data-debug-msg-id]")];
						const nonError = rows.filter((r) =>
							((r.children[1] && r.children[1].textContent) || "")
								.trim().toLowerCase() !== "error");
						return {
							rows: rows.length,
							nonError: nonError.length,
							hasErrMarker: rows.some((r) =>
								(r.textContent || "").includes("e2e-g01-err")),
							empty: Boolean(document.querySelector("[data-debug-empty]")),
						};
					})()`,
				)) as {
					rows?: number;
					nonError?: number;
					hasErrMarker?: boolean;
					empty?: boolean;
				};
				checks.push(
					check(
						"level filter isolates error rows",
						(filterClicked as { ok?: boolean })?.ok === true &&
							(filteredState.rows ?? 0) > 0 &&
							(filteredState.nonError ?? 1) === 0 &&
							filteredState.hasErrMarker === true,
						`click=${JSON.stringify(filterClicked)} rows=${filteredState.rows} nonError=${filteredState.nonError} marker=${filteredState.hasErrMarker}`,
					),
				);

				// 4. Clear: the header Clear button wipes the buffer; poll
				//    until the row count reaches zero (or the empty marker
				//    renders) — the wipe is async across the log bus.
				const clearLabel =
					(await resolveLocaleKey(lang, "common:debugConsole.clear")) ??
					"Clear";
				const clearClicked = await ctx.evalJs(
					consoleSurface,
					`(() => {
						const label = ${JSON.stringify(clearLabel)};
						const btn = [...document.querySelectorAll("button")].find((b) =>
							(b.textContent || "").trim() === label);
						if (!btn) return "no-clear";
						btn.click();
						return "clicked";
					})()`,
				);
				let cleared = false;
				let lastCount = -1;
				const clearDeadline = Date.now() + 12_000;
				while (Date.now() < clearDeadline && !cleared) {
					await sleep(600);
					const probe = (await ctx.evalJs(
						consoleSurface,
						`(() => ({
							rows: document.querySelectorAll("[data-debug-msg-id]").length,
							empty: Boolean(document.querySelector("[data-debug-empty]")),
						}))()`,
					)) as { rows?: number; empty?: boolean };
					lastCount = probe.rows ?? -1;
					cleared = lastCount === 0 || probe.empty === true;
				}
				checks.push(
					check(
						"clear empties the console buffer",
						clearClicked === "clicked" && cleared,
						`click=${String(clearClicked)} lastRows=${lastCount}`,
					),
				);
				return { detail: "debug console eval/filter/clear", checks };
			} finally {
				// Never leak an open console into later suites — a leftover
				// surface becomes the next run's `preExisting` and skews open
				// timing (same discipline as cases/debug.ts).
				await closeSurfaceSettled(findConsole, (s) => closeLiveSurface(ctx, s));
			}
		},
	},
];
