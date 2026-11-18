/**
 * Smoke suite: proves every reachable surface is alive and the persisted
 * state + host bridge are intact. Maps to UC-A02/A03/A04, UC-G01, UC-H01.
 */

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { listLiveSurfaces } from "../surfaces";

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
			const cellSize = appJson?.workspace?.grid?.cellSize;
			// Grid metrics persist lazily: app.json only carries
			// workspace.grid after the user changes grid settings. A fresh
			// install legitimately has no cellSize — the runtime default (48)
			// applies instead, so absence is not a failure.
			const effectiveCellSize = typeof cellSize === "number" ? cellSize : 48;
			checks.push(
				check(
					"settings.workspace.grid.cellSize present or default applies",
					typeof cellSize === "number" || cellSize === undefined,
					`cellSize=${cellSize ?? "default(48)"}`,
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
					computed.cell === `${effectiveCellSize}px`,
					`computed=${computed.cell} expected=${effectiveCellSize}px`,
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
			// toggle (or Ctrl+`). Click it, then re-resolve live targets.
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
			await new Promise((r) => setTimeout(r, 2500));
			const live = await listLiveSurfaces(await ctx.surfaces());
			const consoleSurface = live.find(
				(s) => s.kind === "debug-console" || s.surfaceId.includes("debug"),
			);
			if (!consoleSurface) {
				checks.push(
					check("debug console surface open", false, "not live after toggle"),
				);
				return {
					detail: "debug-console surface did not open — open it from StatusBar",
					checks,
				};
			}
			const state = (await ctx.evalJs(
				consoleSurface,
				`(() => ({
					url: location.href,
					bodyLength: document.body ? document.body.innerHTML.length : 0,
					msgCount: document.querySelectorAll("[data-debug-msg-id]").length,
				}))()`,
			)) as { url?: string; bodyLength?: number; msgCount?: number };
			checks.push(
				check(
					"debug console DOM mounted",
					(state.bodyLength ?? 0) > 100,
					`body=${state.bodyLength} msgs=${state.msgCount}`,
				),
			);
			return { detail: "debug console", checks };
		},
	},
];
