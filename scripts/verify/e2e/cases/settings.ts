/**
 * Settings suite (Issue #108; matrix UC-E01, UC-E02, UC-E10; Issue #783).
 *
 * Locale switch is driven at the file the app actually reads:
 * `settings/app.json` → `ui.language` is the primary key
 * (`loadPreferenceFromFile` in `management/i18n/preference/storage.ts`;
 * `settings/ui.json` `locale` is only the legacy fallback). The settings
 * dialog writes `ui.language` through `updateSettings`, so the file-level
 * round-trip exercises the same boot path a real locale change takes.
 *
 * Issue #783 adds the missing UI-driven half: cases that open the Settings
 * dialog, operate real form sections (ListSelect / ColorField / RangeField),
 * and assert the same persistence → reload → re-display round-trip, plus
 * the save-failure alert contract (UC-E10).
 */

import { mkdir, readdir, rm } from "node:fs/promises";

import { SUPPORTED_LOCALES } from "../../../../src/management/i18n/config";
import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { type LiveSurface, listLiveSurfaces } from "../surfaces";
import { resolveLocaleKey, surfaceLang } from "./i18n";
import {
	closeSurfaceSettled,
	managedFilePath,
	readManagedFileBytes,
	reloadPanel1,
	reloadSurface,
	sleep,
	waitForDom,
	withManagedRootSnapshot,
	writeManagedFile,
} from "./shared";

type AppJson = {
	ui?: {
		language?: string;
		accentColor?: string;
		textColor?: string;
		widget?: { backgroundColor?: string; opacity?: number };
		panel?: { backgroundColor?: string; opacity?: number };
	};
	[key: string]: unknown;
};

const readAppJson = async (ctx: E2EContext): Promise<AppJson | null> => {
	const text = await ctx.readManagedText("settings", "app.json");
	if (text === null) return null;
	try {
		return JSON.parse(text) as AppJson;
	} catch {
		return null;
	}
};

/**
 * The settings sidebar tablist carries `aria-label={t("tabs.ariaLabel")}`
 * ("Settings sections" / "設定セクション") — a translated string that is
 * always rendered, unlike the ListSelect options which only mount their
 * labels while the dropdown is open.
 */
const expectedTablistAriaLabel = (locale: string): string =>
	locale === "ja" ? "設定セクション" : "Settings sections";

export const openSettingsDialog = async (
	ctx: E2EContext,
): Promise<LiveSurface | null> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	// The status-bar button can exist before React attaches its handler
	// (post-reload hydration), so a single click may be a no-op. Retry the
	// toggle until the pooled dialog surface actually mounts.
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		await ctx.evalJs(
			panel,
			`(() => {
				const btn = document.querySelector(
					'[data-ws-action="open-dialog"][data-dialog-kind="settings"]'
				);
				if (!btn) return "no-button";
				btn.click();
				return "clicked";
			})()`,
		);
		const innerDeadline = Date.now() + 6_000;
		while (Date.now() < innerDeadline && Date.now() < deadline) {
			await sleep(700);
			const live = await listLiveSurfaces(await ctx.surfaces());
			const dialog = live.find((s) => s.surfaceId === "dialog-settings");
			if (dialog) {
				const mounted = await waitForDom(
					ctx,
					dialog,
					`document.body ? document.body.innerHTML.length > 500 : false`,
					10_000,
				);
				if (mounted) return dialog;
			}
		}
	}
	return null;
};

const closeSurfaceBestEffort = async (
	ctx: E2EContext,
	surface: LiveSurface,
): Promise<void> => {
	try {
		const conn = await ctx.cdp(surface);
		await conn.send("Page.close", {}, 5_000);
	} catch {
		try {
			await ctx.evalJs(
				surface,
				`(() => { try { window.close(); return "window.close"; } catch (e) { return String(e); } })()`,
			);
		} catch {
			// best-effort only
		}
	}
};

// ---------------------------------------------------------------------------
// UI-driven settings helpers (Issue #783)
// ---------------------------------------------------------------------------

/**
 * Click a sidebar section tab (`data-settings-sidebar-item`) and wait for
 * its tabpanel (`data-settings-sidebar-section`) to become active. The
 * tablist only mounts after the settings store finishes loading, which can
 * take ~12s on a cold boot, so the tab wait gets the full budget.
 */
const openSettingsSection = async (
	ctx: E2EContext,
	dialog: LiveSurface,
	sectionId: string,
): Promise<boolean> => {
	const tabSeen = await waitForDom(
		ctx,
		dialog,
		`Boolean(document.querySelector('[data-settings-sidebar-item="${sectionId}"]'))`,
		30_000,
	);
	if (!tabSeen) return false;
	await ctx.evalJs(
		dialog,
		`(() => {
			const btn = document.querySelector(
				'[data-settings-sidebar-item="${sectionId}"]');
			if (!btn) return "missing";
			btn.click();
			return "clicked";
		})()`,
	);
	return Boolean(
		await waitForDom(
			ctx,
			dialog,
			`document.querySelector('[data-settings-sidebar-section="${sectionId}"]') !== null`,
			15_000,
		),
	);
};

/**
 * Set a React-controlled input's value the way a user keystroke lands:
 * native setter + `input`/`change` events. Returns the element's value
 * afterwards (`"missing"` when the selector matched nothing).
 */
const setControlValue = async (
	ctx: E2EContext,
	surface: LiveSurface,
	selector: string,
	value: string,
): Promise<unknown> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = document.querySelector(${JSON.stringify(selector)});
			if (!el) return "missing";
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype, "value").set;
			setter.call(el, ${JSON.stringify(value)});
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return el.value;
		})()`,
	);

/** Read a control's current value (`null` when absent). */
const readControlValue = async (
	ctx: E2EContext,
	surface: LiveSurface,
	selector: string,
): Promise<string | null> =>
	ctx.evalJs(
		surface,
		`(() => {
			const el = document.querySelector(${JSON.stringify(selector)});
			return el ? String(el.value) : null;
		})()`,
	) as Promise<string | null>;

/** Poll `settings/app.json` until `predicate` holds or the budget ends. */
const waitForAppJson = async (
	ctx: E2EContext,
	predicate: (app: AppJson) => boolean,
	timeoutMs = 20_000,
): Promise<AppJson | null> => {
	const deadline = Date.now() + timeoutMs;
	let last: AppJson | null = null;
	while (Date.now() < deadline) {
		last = await readAppJson(ctx);
		if (last && predicate(last)) return last;
		await sleep(700);
	}
	return last;
};

/**
 * Reload the pooled settings dialog surface so its SettingsProvider
 * re-reads `settings/app.json` from disk, then re-resolve the live target
 * (Page.reload can replace the CDP target — see UC-E01).
 */
const reloadSettingsDialog = async (
	ctx: E2EContext,
	dialog: LiveSurface,
): Promise<LiveSurface> => {
	await reloadSurface(ctx, dialog, 30_000);
	const live = await listLiveSurfaces(await ctx.surfaces());
	return live.find((s) => s.surfaceId === "dialog-settings") ?? dialog;
};

/** Close every live `dialog-settings` surface, surviving open retries. */
const closeSettingsDialog = async (ctx: E2EContext): Promise<void> => {
	await closeSurfaceSettled(
		async () =>
			(await listLiveSurfaces(await ctx.surfaces())).find(
				(s) => s.surfaceId === "dialog-settings",
			) ?? null,
		(s) => closeSurfaceBestEffort(ctx, s),
	);
};

export const settingsCases: E2ECase[] = [
	{
		uc: "UC-E01",
		title: "ui.language in app.json drives panel locale across reload",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const appJsonPath = managedFilePath(ctx, "settings", "app.json");
			const before = await readAppJson(ctx);
			const current = before?.ui?.language ?? "en";
			const target = current === "ja" ? "en" : "ja";

			let dialogSurface: LiveSurface | null = null;
			try {
				await withManagedRootSnapshot(ctx, "uc-e01-locale", async () => {
					const doc: AppJson = before ?? { version: 2 };
					doc.ui = { ...(doc.ui ?? {}), language: target };
					await writeManagedFile(
						ctx,
						["settings", "app.json"],
						`${JSON.stringify(doc, null, 2)}\n`,
					);
					const written = await readAppJson(ctx);
					checks.push(
						check(
							`settings/app.json ui.language set to ${target}`,
							written?.ui?.language === target,
							`language=${written?.ui?.language}`,
						),
					);

					const panel = await reloadPanel1(ctx);
					await waitForDom(
						ctx,
						panel,
						`document.documentElement.lang === ${JSON.stringify(target)}`,
						20_000,
					);
					const lang = (await ctx.evalJs(
						panel,
						`document.documentElement.lang`,
					)) as string;
					checks.push(
						check(
							"document.documentElement.lang reflects locale",
							lang === target,
							`lang=${lang} expected=${target}`,
						),
					);

					// UI-string evidence: the settings dialog's sidebar is
					// translated; open it and check the tablist aria-label.
					dialogSurface = await openSettingsDialog(ctx);
					if (!dialogSurface) {
						checks.push(
							check("settings dialog surface opened", false, "not live"),
						);
					} else {
						// The dialog is a pooled modeless surface:
						// requestOpenExtension may just refocus an instance booted
						// before the locale change. Reload it so i18n re-reads the
						// preference, then assert the translated tablist label.
						await reloadSurface(ctx, dialogSurface, 30_000);
						// Re-resolve the live target: Page.reload can replace the
						// CDP target on some CEF builds, and polling a dead
						// websocket yields null forever (observed as
						// `aria-label=null` flakes).
						const freshLive = await listLiveSurfaces(await ctx.surfaces());
						const settledDialog =
							freshLive.find((s) => s.surfaceId === "dialog-settings") ??
							dialogSurface;
						const expected = expectedTablistAriaLabel(target);
						// Boot is bounded but slow: surface-id resolution retries
						// for ~2.5s and the settings store load has a 12s timeout
						// fallback, so the tablist can legitimately appear ~15s
						// after reload. Poll long enough to cover that budget.
						const aria = (await waitForDom(
							ctx,
							settledDialog,
							`(() => {
								const el = document.querySelector('[role="tablist"]');
								return el ? el.getAttribute("aria-label") : null;
							})()`,
							30_000,
						)) as string | null;
						checks.push(
							check(
								`settings dialog renders ${target} strings`,
								aria === expected,
								`tablist aria-label=${JSON.stringify(aria)} expected=${JSON.stringify(expected)}`,
							),
						);
					}
				});
			} finally {
				// Close by surfaceId (not the possibly-stale handle) and wait
				// out the open-retry window so the dialog cannot resurrect.
				await closeSurfaceSettled(
					async () => {
						const live = await listLiveSurfaces(await ctx.surfaces());
						return live.find((s) => s.surfaceId === "dialog-settings") ?? null;
					},
					(s) => closeSurfaceBestEffort(ctx, s),
				);
				try {
					await reloadPanel1(ctx, 30_000);
				} catch {
					// restore already ran; reload is best-effort
				}
			}
			const restoredBytes = await readManagedFileBytes(
				ctx,
				"settings",
				"app.json",
			);
			checks.push(
				check(
					"settings/app.json restored after case",
					restoredBytes !== null,
					`${appJsonPath} ${restoredBytes?.length ?? 0} bytes`,
				),
			);
			return {
				detail: `locale ${current} → ${target} → restored`,
				checks,
			};
		},
	},
	{
		uc: "UC-E01",
		title:
			"settings UI round-trip: Language ListSelect → app.json ui.language → reload documentElement.lang",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const before = await readAppJson(ctx);
			const current = before?.ui?.language ?? "en";
			const target = current === "ja" ? "en" : "ja";

			await withManagedRootSnapshot(ctx, "uc-e01-language-ui", async () => {
				const targetIndex = SUPPORTED_LOCALES.indexOf(
					target as (typeof SUPPORTED_LOCALES)[number],
				);

				const opened = await openSettingsDialog(ctx);
				if (!opened) {
					checks.push(
						check("settings dialog opened", false, "surface not live"),
					);
					return;
				}
				// Pooled surface may be refocused from an earlier boot — reload
				// so the settings store (and i18n) re-reads the sandboxed files.
				const dialog = await reloadSettingsDialog(ctx, opened);
				try {
					const sectionOk = await openSettingsSection(ctx, dialog, "language");
					checks.push(check("language section opened", sectionOk, ""));
					if (!sectionOk || targetIndex === -1) return;

					// ListSelect: open the popover, then click the option at the
					// target locale's index. Options carry no value attribute —
					// only their native-name label — so order is the contract
					// (`SUPPORTED_LOCALES.map` in LanguageSection).
					const triggerClicked = await ctx.evalJs(
						dialog,
						`(() => {
							const btn = document.querySelector(
								'[data-settings-sidebar-section="language"] button[aria-haspopup="listbox"]');
							if (!btn) return "missing-trigger";
							btn.click();
							return "clicked";
						})()`,
					);
					checks.push(
						check(
							"language ListSelect trigger opened",
							triggerClicked === "clicked",
							String(triggerClicked),
						),
					);
					const listSeen = await waitForDom(
						ctx,
						dialog,
						`document.querySelectorAll('[role="listbox"] [role="option"]').length >= 2`,
						15_000,
					);
					const optionCount = Number(
						(await ctx.evalJs(
							dialog,
							`document.querySelectorAll('[role="listbox"] [role="option"]').length`,
						)) ?? 0,
					);
					checks.push(
						check(
							"language listbox rendered all locale options",
							Boolean(listSeen) && optionCount === SUPPORTED_LOCALES.length,
							`options=${optionCount} expected=${SUPPORTED_LOCALES.length}`,
						),
					);
					if (!listSeen || optionCount !== SUPPORTED_LOCALES.length) return;

					const picked = await ctx.evalJs(
						dialog,
						`(() => {
							const opts = [...document.querySelectorAll(
								'[role="listbox"] [role="option"]')];
							const el = opts[${targetIndex}];
							if (!el) return "missing-option";
							el.click();
							return el.textContent;
						})()`,
					);
					checks.push(
						check(
							`language option ${target} clicked`,
							typeof picked === "string" && picked.length > 0,
							`label=${JSON.stringify(picked)}`,
						),
					);

					// updateSettings persists ui.language asynchronously.
					const persisted = await waitForAppJson(
						ctx,
						(app) => app.ui?.language === target,
					);
					checks.push(
						check(
							"app.json ui.language persisted via UI",
							persisted?.ui?.language === target,
							`language=${persisted?.ui?.language}`,
						),
					);

					// Live check: the open dialog re-renders in the new locale.
					const expected = expectedTablistAriaLabel(target);
					const aria = (await waitForDom(
						ctx,
						dialog,
						`(() => {
							const el = document.querySelector('[role="tablist"]');
							return el ? el.getAttribute("aria-label") : null;
						})()`,
						15_000,
					)) as string | null;
					checks.push(
						check(
							"open dialog re-rendered in new locale",
							aria === expected,
							`tablist aria-label=${JSON.stringify(aria)} expected=${JSON.stringify(expected)}`,
						),
					);

					// Reload → panel boots in the new locale.
					const panel = await reloadPanel1(ctx, 45_000);
					await waitForDom(
						ctx,
						panel,
						`document.documentElement.lang === ${JSON.stringify(target)}`,
						20_000,
					);
					const lang = (await ctx.evalJs(
						panel,
						`document.documentElement.lang`,
					)) as string;
					checks.push(
						check(
							"document.documentElement.lang reflects UI-chosen locale",
							lang === target,
							`lang=${lang} expected=${target}`,
						),
					);

					// Re-display: reopen + reload the pooled dialog and confirm it
					// renders the target locale's strings from the persisted value.
					const reopened = await openSettingsDialog(ctx);
					if (!reopened) {
						checks.push(
							check(
								"settings dialog reopened after reload",
								false,
								"surface not live",
							),
						);
					} else {
						const dialog2 = await reloadSettingsDialog(ctx, reopened);
						const aria2 = (await waitForDom(
							ctx,
							dialog2,
							`(() => {
								const el = document.querySelector('[role="tablist"]');
								return el ? el.getAttribute("aria-label") : null;
							})()`,
							30_000,
						)) as string | null;
						checks.push(
							check(
								"reopened dialog renders persisted locale",
								aria2 === expected,
								`tablist aria-label=${JSON.stringify(aria2)} expected=${JSON.stringify(expected)}`,
							),
						);
					}
				} finally {
					await closeSettingsDialog(ctx);
				}
			});
			// Snapshot restore + panel reload (wrapper finally) bring the
			// locale back to the pre-case value.
			const restored = await readAppJson(ctx);
			checks.push(
				check(
					"settings/app.json restored after case",
					restored !== null,
					`language=${restored?.ui?.language}`,
				),
			);
			return {
				detail: `language ${current} → ${target} via ListSelect → restored`,
				checks,
				evidence: [managedFilePath(ctx, "settings", "app.json")],
			};
		},
	},
	{
		uc: "UC-E02",
		title:
			"settings UI round-trip: appearance ColorField + RangeField → app.json/theme.css → reload re-display",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const ACCENT = "#3355cc";
			const WIDGET_OPACITY = 63;

			await withManagedRootSnapshot(ctx, "uc-e02-appearance-ui", async () => {
				const opened = await openSettingsDialog(ctx);
				if (!opened) {
					checks.push(
						check("settings dialog opened", false, "surface not live"),
					);
					return;
				}
				const dialog = await reloadSettingsDialog(ctx, opened);
				try {
					const sectionOk = await openSettingsSection(
						ctx,
						dialog,
						"appearance",
					);
					checks.push(check("appearance section opened", sectionOk, ""));
					if (!sectionOk) return;

					// ColorField hex input: aria-label = `${label} value` where
					// label is the localized `settings:colorAccent` string.
					const lang = await surfaceLang(ctx, dialog);
					const accentLabel = await resolveLocaleKey(
						lang,
						"settings:colorAccent",
					);
					const accentSelector = `input[aria-label=${JSON.stringify(`${accentLabel ?? "Accent"} value`)}]`;

					const accentSet = await setControlValue(
						ctx,
						dialog,
						accentSelector,
						ACCENT,
					);
					checks.push(
						check(
							"accent ColorField accepted value",
							accentSet === ACCENT,
							`value=${String(accentSet)}`,
						),
					);

					const accentApp = await waitForAppJson(
						ctx,
						(app) => (app.ui?.accentColor ?? "").toLowerCase() === ACCENT,
					);
					checks.push(
						check(
							"app.json ui.accentColor persisted",
							(accentApp?.ui?.accentColor ?? "").toLowerCase() === ACCENT,
							`accent=${accentApp?.ui?.accentColor}`,
						),
					);

					// Live projection: applyUiSettingsTheme writes theme.css and
					// broadcasts themeLive, so the panel token converges without
					// a reload (UC-E02's "live" leg).
					const panel = await ctx.requireSurface({
						surfaceId: "panel-1",
					});
					const liveAccent = await waitForDom(
						ctx,
						panel,
						`(() => {
							const v = getComputedStyle(document.documentElement)
								.getPropertyValue("--color-ty-accent") || "";
							return v.toLowerCase().includes("3355cc") ? v.trim() : null;
						})()`,
						30_000,
					);
					checks.push(
						check(
							"accent reached live panel theme token",
							String(liveAccent ?? "")
								.toLowerCase()
								.includes("3355cc"),
							`accent=${String(liveAccent).trim()}`,
						),
					);

					// RangeField: the first range input in the section is the
					// widget-opacity slider (widget row precedes panel row).
					const rangeSelector = `[data-settings-sidebar-section="appearance"] input[type="range"]`;
					const opacitySet = await setControlValue(
						ctx,
						dialog,
						rangeSelector,
						String(WIDGET_OPACITY),
					);
					checks.push(
						check(
							"widget opacity RangeField accepted value",
							opacitySet === String(WIDGET_OPACITY),
							`value=${String(opacitySet)}`,
						),
					);

					const opacityApp = await waitForAppJson(
						ctx,
						(app) => app.ui?.widget?.opacity === WIDGET_OPACITY,
					);
					checks.push(
						check(
							"app.json ui.widget.opacity persisted",
							opacityApp?.ui?.widget?.opacity === WIDGET_OPACITY,
							`opacity=${opacityApp?.ui?.widget?.opacity}`,
						),
					);

					const themeCss = await ctx.readManagedText("styles", "theme.css");
					checks.push(
						check(
							"theme.css carries accent token",
							(themeCss ?? "").toLowerCase().includes("3355cc"),
							"",
						),
					);

					// Reload → reopen → the fields re-display the persisted
					// values (the pooled surface is reloaded so its store
					// re-reads app.json, same contract as UC-E01).
					await reloadPanel1(ctx, 45_000);
					const reopened = await openSettingsDialog(ctx);
					if (!reopened) {
						checks.push(
							check(
								"settings dialog reopened after reload",
								false,
								"surface not live",
							),
						);
					} else {
						const dialog2 = await reloadSettingsDialog(ctx, reopened);
						const section2 = await openSettingsSection(
							ctx,
							dialog2,
							"appearance",
						);
						checks.push(
							check("appearance section reopened after reload", section2, ""),
						);
						if (section2) {
							const accentAgain = await readControlValue(
								ctx,
								dialog2,
								accentSelector,
							);
							checks.push(
								check(
									"accent ColorField re-displays persisted value",
									accentAgain === ACCENT,
									`value=${accentAgain}`,
								),
							);
							const opacityAgain = await readControlValue(
								ctx,
								dialog2,
								rangeSelector,
							);
							checks.push(
								check(
									"opacity RangeField re-displays persisted value",
									Number(opacityAgain) === WIDGET_OPACITY,
									`value=${opacityAgain}`,
								),
							);
						}
					}
				} finally {
					await closeSettingsDialog(ctx);
				}
			});
			const restored = await readAppJson(ctx);
			checks.push(
				check(
					"settings/app.json restored after case",
					restored !== null,
					`accent=${restored?.ui?.accentColor}`,
				),
			);
			return {
				detail: `accent=${ACCENT} widgetOpacity=${WIDGET_OPACITY} via settings UI`,
				checks,
				evidence: [
					managedFilePath(ctx, "settings", "app.json"),
					managedFilePath(ctx, "styles", "theme.css"),
				],
			};
		},
	},
	{
		uc: "UC-E10",
		title:
			"settings save failure: role=alert shown, dialog stays open, app.json untouched",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const appJsonPath = managedFilePath(ctx, "settings", "app.json");
			const originalBytes = await readManagedFileBytes(
				ctx,
				"settings",
				"app.json",
			);
			const originalText = originalBytes
				? originalBytes.toString("utf8")
				: null;

			await withManagedRootSnapshot(ctx, "uc-e10-save-failure", async () => {
				const opened = await openSettingsDialog(ctx);
				if (!opened) {
					checks.push(
						check("settings dialog opened", false, "surface not live"),
					);
					return;
				}
				const dialog = await reloadSettingsDialog(ctx, opened);
				let faultInstalled = false;
				try {
					const sectionOk = await openSettingsSection(
						ctx,
						dialog,
						"appearance",
					);
					checks.push(check("appearance section opened", sectionOk, ""));
					if (!sectionOk) return;

					// Fault injection: replace settings/app.json with a
					// directory. The settings write path is read-modify-write
					// (`saveSettingsToStorage` → `readSettings` strict read →
					// tmp+rename publish), so an EISDIR path fails the save
					// before any byte lands. Portable on purpose: chmod is
					// bypassed by privileged runners and ignored for directory
					// write-blocking on Windows — the same reasoning as
					// boot-restore-fault-injection.test.ts.
					await rm(appJsonPath, { recursive: true, force: true });
					await mkdir(appJsonPath, { recursive: true });
					faultInstalled = true;

					// A real field edit triggers updateSettings → the queued
					// save fails → saveError banner (role="alert").
					const lang = await surfaceLang(ctx, dialog);
					const accentLabel = await resolveLocaleKey(
						lang,
						"settings:colorAccent",
					);
					const accentSelector = `input[aria-label=${JSON.stringify(`${accentLabel ?? "Accent"} value`)}]`;
					const setResult = await setControlValue(
						ctx,
						dialog,
						accentSelector,
						"#aa3355",
					);
					checks.push(
						check(
							"accent edit dispatched while save target broken",
							setResult === "#aa3355",
							`value=${String(setResult)}`,
						),
					);

					const alertSeen = await waitForDom(
						ctx,
						dialog,
						`Boolean(document.querySelector('[role="alert"]'))`,
						30_000,
					);
					checks.push(
						check(
							"role=alert banner rendered on save failure",
							Boolean(alertSeen),
							"",
						),
					);

					const expected = await resolveLocaleKey(lang, "settings:saveFailed");
					const alertText = (await ctx.evalJs(
						dialog,
						`(() => {
							const el = document.querySelector('[role="alert"]');
							return el ? (el.textContent || "").trim() : null;
						})()`,
					)) as string | null;
					checks.push(
						check(
							"alert shows localized save-failure message",
							expected !== null && alertText === expected,
							`alert=${JSON.stringify(alertText)} expected=${JSON.stringify(expected)}`,
						),
					);

					// The failed write must not have produced residue inside the
					// fault directory (tmp+rename publishes atomically or not at
					// all — ADR-0006 §6).
					const residue = await readdir(appJsonPath).catch(() => null);
					checks.push(
						check(
							"failed save left no partial-write residue",
							Array.isArray(residue) && residue.length === 0,
							`entries=${JSON.stringify(residue)}`,
						),
					);

					// Explicit Save goes through the same persist path: it must
					// fail too and keep the dialog open (#96 contract).
					await ctx.evalJs(
						dialog,
						`(() => {
							const b = document.querySelector(
								'[data-settings-footer-action="save"]');
							if (b) b.click();
							return Boolean(b);
						})()`,
					);
					await sleep(2_000);
					const stillOpen = await ctx.evalJs(
						dialog,
						`Boolean(document.querySelector('[data-settings-footer-action="save"]'))`,
					);
					checks.push(
						check(
							"dialog stayed open after failed Save",
							stillOpen === true,
							`saveButton=${String(stillOpen)}`,
						),
					);
				} finally {
					// Restore app.json BEFORE the snapshot restore runs: the
					// wrapper's rm -rf cannot delete files inside a directory
					// it may still need to traverse, and the byte check below
					// compares against the pre-fault content.
					if (faultInstalled) {
						await rm(appJsonPath, { recursive: true, force: true }).catch(
							() => {},
						);
						if (originalText !== null) {
							await writeManagedFile(
								ctx,
								["settings", "app.json"],
								originalText,
							);
						}
					}
					await closeSettingsDialog(ctx);
				}
			});
			const afterBytes = await readManagedFileBytes(
				ctx,
				"settings",
				"app.json",
			);
			const afterText = afterBytes ? afterBytes.toString("utf8") : null;
			checks.push(
				check(
					"settings/app.json byte-identical after failed save",
					afterText === originalText,
					`before=${originalText === null ? "absent" : `${originalText.length}B`} after=${afterText === null ? "absent" : `${afterText.length}B`}`,
				),
			);
			return {
				detail: "save failure surfaced role=alert; app.json preserved",
				checks,
				evidence: [managedFilePath(ctx, "settings", "app.json")],
			};
		},
	},
];
