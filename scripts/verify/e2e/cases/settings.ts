/**
 * Settings suite (Issue #108; matrix UC-E01).
 *
 * Locale switch is driven at the file the app actually reads:
 * `settings/app.json` → `ui.language` is the primary key
 * (`loadPreferenceFromFile` in `management/i18n/preference/storage.ts`;
 * `settings/ui.json` `locale` is only the legacy fallback). The settings
 * dialog writes `ui.language` through `updateSettings`, so the file-level
 * round-trip exercises the same boot path a real locale change takes.
 */

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { type LiveSurface, listLiveSurfaces } from "../surfaces";
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
	ui?: { language?: string };
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

const openSettingsDialog = async (
	ctx: E2EContext,
): Promise<LiveSurface | null> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
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
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
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
						const expected = expectedTablistAriaLabel(target);
						const aria = (await waitForDom(
							ctx,
							dialogSurface,
							`(() => {
								const el = document.querySelector('[role="tablist"]');
								return el ? el.getAttribute("aria-label") : null;
							})()`,
							15_000,
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
];
