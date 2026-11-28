/**
 * Onboarding suite (Issue #784; matrix UC-A01).
 *
 * First-run detection is locator-driven: `bootPanel` shows the onboarding
 * overlay on panel-1 only while `ty-plus-init.json` (in the AE install
 * folder, NOT the managed root) is missing or invalid
 * (`isInitializationComplete` in management/setting/onboarding/
 * initialization.ts). The locator file is outside the managed-root
 * snapshot, so this case holds it aside and restores it in `finally` —
 * the same file sandbox prepare/teardown already rewrites, so the write
 * path is proven on the target machine.
 *
 * Scope honesty: this is the smoke leg of UC-A01 — "shown → step
 * transition → not shown again". The full 10-step completion writes
 * settings + presets + layouts through native folder dialogs and is NOT
 * driven here; that remains manual/semi coverage.
 */
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { resolveLocaleKey, surfaceLang } from "./i18n";
import { reloadPanel1, waitForDom } from "./shared";

const LOCATOR_NAME = "ty-plus-init.json";
const HELD_SUFFIX = ".e2e-held";

const normalizeSlashes = (p: string): string => p.replace(/\\/g, "/");

const managedRootOf = (supportRoot: string): string =>
	`${normalizeSlashes(supportRoot).replace(/\/+$/, "")}/ty-plus`;

/**
 * Locate the `ty-plus-init.json` that governs the *current* managed root.
 *
 * `findLocator` (sandbox.ts) validates `supportRoot → managedRoot`, which
 * fails mid-suite in sandbox mode because the locator was already
 * repointed at the sandbox copy. This variant walks up from the REAL
 * managed root (where the file physically lives) and validates against
 * the EFFECTIVE managed root (`ctx.managedRoot()` — sandbox or real).
 */
const findGoverningLocator = async (
	ctx: E2EContext,
): Promise<{ initPath: string; raw: string } | null> => {
	const effective = normalizeSlashes(ctx.managedRoot()).replace(/\/+$/, "");
	const real = normalizeSlashes(
		ctx.options.realManagedRoot ?? ctx.managedRoot(),
	).replace(/\/+$/, "");
	let dir = path.dirname(real);
	for (let depth = 0; depth < 3; depth++) {
		const candidate = path.join(dir, LOCATOR_NAME);
		try {
			const raw = await readFile(candidate, "utf8");
			const parsed = JSON.parse(raw) as { supportRoot?: unknown };
			if (
				typeof parsed.supportRoot === "string" &&
				(managedRootOf(parsed.supportRoot) === effective ||
					managedRootOf(parsed.supportRoot) === real)
			) {
				return { initPath: candidate, raw };
			}
		} catch {
			// not here — walk up
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
};

export const onboardingCases: E2ECase[] = [
	{
		uc: "UC-A01",
		title:
			"first-run: missing locator shows onboarding shell + step transition; restored locator hides it",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const locator = await findGoverningLocator(typed);
				if (!locator) {
					return "ty-plus-init.json governing the managed root not found";
				}
				return null;
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const locator = await findGoverningLocator(ctx);
			if (!locator) {
				return {
					detail: "locator vanished between precondition and run",
					checks: [check("locator resolved", false, "not found")],
				};
			}
			const heldPath = `${locator.initPath}${HELD_SUFFIX}`;
			let held = false;

			try {
				// Hold the locator aside: boot then sees "not initialized"
				// and panel-1 renders the onboarding overlay.
				await rename(locator.initPath, heldPath);
				held = true;

				const panel = await reloadPanel1(ctx, 60_000);
				const shellSeen = await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector('[data-testid="onboarding-shell"]'))`,
					60_000,
				);
				checks.push(
					check(
						"onboarding shell shown while locator is missing",
						Boolean(shellSeen),
						`shell=${String(shellSeen).slice(0, 60)}`,
					),
				);
				if (!shellSeen) return { detail: "onboarding did not appear", checks };

				// Intro step: localized title + progress indicator.
				const lang = await surfaceLang(ctx, panel);
				const introTitle = await resolveLocaleKey(
					lang,
					"onboarding:step.intro.title",
				);
				const nextLabel = await resolveLocaleKey(
					lang,
					"onboarding:actions.next",
				);
				const languageTitle = await resolveLocaleKey(
					lang,
					"onboarding:step.language.title",
				);

				const titleText = (await ctx.evalJs(
					panel,
					`(() => {
						const el = document.querySelector('[data-testid="onboarding-title"]');
						return el ? el.textContent : null;
					})()`,
				)) as string | null;
				const progressText = (await ctx.evalJs(
					panel,
					`(() => {
						const el = document.querySelector('[data-testid="onboarding-progress"]');
						return el ? el.textContent : null;
					})()`,
				)) as string | null;
				checks.push(
					check(
						"intro step title rendered",
						introTitle !== null && (titleText ?? "").includes(introTitle),
						`title=${JSON.stringify(titleText)} expected~${JSON.stringify(introTitle)}`,
					),
					check(
						"step progress indicator rendered",
						progressText !== null && /\d+\s*\/\s*\d+/.test(progressText),
						`progress=${JSON.stringify(progressText)}`,
					),
				);

				// Next → language step (proves the step machine advances
				// without completing onboarding).
				if (nextLabel) {
					const clicked = await ctx.evalJs(
						panel,
						`(() => {
							const shell = document.querySelector('[data-testid="onboarding-shell"]');
							const btn = [...(shell?.querySelectorAll('button') ?? [])]
								.find((b) => (b.textContent ?? '').trim() === ${JSON.stringify(nextLabel)});
							if (btn && !btn.disabled) { btn.click(); return 'clicked'; }
							return btn ? 'disabled' : 'missing';
						})()`,
					);
					checks.push(
						check(
							"next button clicked",
							clicked === "clicked",
							`result=${String(clicked)}`,
						),
					);
					if (languageTitle) {
						const advancedTitle = await waitForDom(
							ctx,
							panel,
							`(() => {
								const el = document.querySelector('[data-testid="onboarding-title"]');
								return el && el.textContent.includes(${JSON.stringify(languageTitle)})
									? el.textContent : null;
							})()`,
							15_000,
						);
						checks.push(
							check(
								"step advanced to language step",
								Boolean(advancedTitle),
								`title=${JSON.stringify(advancedTitle)}`,
							),
						);
					} else {
						checks.push(
							check(
								"step advanced to language step",
								false,
								"onboarding:step.language.title unresolved for locale",
							),
						);
					}
				}
			} finally {
				// Restore the locator BEFORE reloading: a panel booted without
				// it stays in onboarding state, so the restore must land first.
				if (held) {
					try {
						const original = await readFile(heldPath, "utf8");
						await writeFile(locator.initPath, original, "utf8");
						await rm(heldPath, { force: true });
						held = false;
					} catch (error) {
						checks.push(
							check(
								"locator restored",
								false,
								`restore failed: ${error instanceof Error ? error.message : String(error)} — held copy at ${heldPath}`,
							),
						);
					}
				}
				try {
					const restoredPanel = await reloadPanel1(ctx, 60_000);
					const hidden = await waitForDom(
						ctx,
						restoredPanel,
						`!document.querySelector('[data-testid="onboarding-shell"]') &&
							Boolean(document.querySelector('[data-workspace-grid], footer, [data-ty-shell]'))`,
						30_000,
					);
					checks.push(
						check(
							"onboarding not shown again after locator restore",
							Boolean(hidden),
							`workspace=${String(hidden).slice(0, 60)}`,
						),
					);
				} catch (error) {
					checks.push(
						check(
							"panel reload after restore",
							false,
							error instanceof Error ? error.message : String(error),
						),
					);
				}
			}

			// Locator bytes must be identical to what the run started with.
			if (!held) {
				try {
					const now = await readFile(locator.initPath, "utf8");
					checks.push(
						check(
							"ty-plus-init.json bytes restored",
							now === locator.raw,
							`${locator.initPath} ${now.length} bytes`,
						),
					);
				} catch {
					checks.push(
						check("ty-plus-init.json bytes restored", false, "unreadable"),
					);
				}
			} else {
				checks.push(
					check(
						"ty-plus-init.json bytes restored",
						false,
						`still held at ${heldPath} — manual restore required`,
					),
				);
			}
			return {
				detail: `locator=${locator.initPath}; full 10-step completion deferred (native dialogs)`,
				checks,
				evidence: [locator.initPath],
			};
		},
	},
];
