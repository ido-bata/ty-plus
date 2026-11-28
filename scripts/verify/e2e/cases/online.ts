/**
 * Online surfaces suite (Issue #784; matrix UC-F01, UC-F02, UC-F04, UC-F05,
 * UC-E07).
 *
 * Covers the operation units that had zero e2e coverage (product-model §2
 * "更新/通知"): the preset-library dialog, the notification center, and the
 * Settings → Updates section.
 *
 * Environment honesty:
 * - UC-F01 download → local catalog needs a live cloud gateway + network;
 *   this case asserts the browse chrome (search, view switch, degraded
 *   empty state) only. The download leg stays manual/semi.
 * - UC-F02 seeds `cache/notifications.json` inside the managed-root
 *   snapshot so list/detail/read-state round-trips are deterministic and
 *   offline-safe. Remote sync is only asserted to reach a settled state.
 * - UC-F04/F05 hit the real GitHub Releases / notification feeds. Both
 *   accept the degraded terminal states (`unavailable` / empty list) —
 *   the check proves the fetch path runs and resolves, not that the
 *   network was up.
 * - UC-E07 persists `ui.updateChannel` through the same settings write
 *   path the dialog uses; verified at the file level inside a snapshot.
 */
import { mkdir, writeFile } from "node:fs/promises";

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import type { LiveSurface } from "../surfaces";
import { listLiveSurfaces } from "../surfaces";
import { resolveLocaleKey, surfaceLang, templateAffixes } from "./i18n";
import { openSettingsDialog } from "./settings";
import {
	closeLiveSurface,
	closeSurfaceSettled,
	managedFilePath,
	readManagedFileBytes,
	sleep,
	waitForDom,
	withManagedRootSnapshot,
} from "./shared";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Open a workspace shell tool dialog (`presetLibrary` / `messages` /
 * `settings`) via the panel-1 status-bar button. Same retry discipline as
 * `openSettingsDialog`: the button can exist before React attaches its
 * delegated handler, so the click is re-issued until the pooled surface
 * mounts.
 */
const openWorkspaceToolDialog = async (
	ctx: E2EContext,
	kind: string,
	surfaceId: string,
	timeoutMs = 30_000,
): Promise<LiveSurface | null> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await ctx.evalJs(
			panel,
			`(() => {
				const btn = document.querySelector(
					'[data-ws-action="open-dialog"][data-dialog-kind="${kind}"]'
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
			const dialog = live.find((s) => s.surfaceId === surfaceId);
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

/** Close a pooled modeless surface by surfaceId and wait out re-open retries. */
const closeDialogBySurfaceId = async (
	ctx: E2EContext,
	surfaceId: string,
): Promise<void> => {
	await closeSurfaceSettled(
		async () => {
			const live = await listLiveSurfaces(await ctx.surfaces());
			return live.find((s) => s.surfaceId === surfaceId) ?? null;
		},
		(s) => closeLiveSurface(ctx, s),
	);
};

const readNotificationStore = async (
	ctx: E2EContext,
): Promise<{
	items?: { notificationId?: string }[];
	readAtById?: Record<string, string>;
} | null> => {
	const text = await ctx.readManagedText("cache", "notifications.json");
	if (text === null) return null;
	try {
		return JSON.parse(text) as {
			items?: { notificationId?: string }[];
			readAtById?: Record<string, string>;
		};
	} catch {
		return null;
	}
};

type NotificationFixture = {
	notificationId: string;
	name: string;
	summary: string;
	publishedAt: string;
};

const NOTIFICATION_FIXTURES: NotificationFixture[] = [
	{
		notificationId: "e2e-n1-alpha",
		name: "E2E Alpha Notice",
		summary: "first fixture notification",
		publishedAt: "2026-01-01T00:00:00.000Z",
	},
	{
		notificationId: "e2e-n2-beta",
		name: "E2E Beta Notice",
		summary: "second fixture notification",
		publishedAt: "2026-01-02T00:00:00.000Z",
	},
];

const writeNotificationStore = async (
	ctx: E2EContext,
	store: {
		items: NotificationFixture[];
		readAtById: Record<string, string>;
	},
): Promise<void> => {
	await mkdir(ctx.managedPath("cache"), { recursive: true });
	await writeFile(
		ctx.managedPath("cache", "notifications.json"),
		`${JSON.stringify(store, null, 2)}\n`,
		"utf8",
	);
};

/** Poll the notifications file until `readAtById[id]` matches `want`. */
const waitForReadState = async (
	ctx: E2EContext,
	id: string,
	want: "read" | "unread",
	timeoutMs = 15_000,
): Promise<boolean> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const store = await readNotificationStore(ctx);
		const has = Boolean(store?.readAtById?.[id]);
		if ((want === "read") === has) return true;
		await sleep(600);
	}
	return false;
};

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

export const onlineCases: E2ECase[] = [
	{
		uc: "UC-F02",
		title:
			"notification center: seeded list → detail auto-marks read → toggle persists to cache",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const storePath = managedFilePath(ctx, "cache", "notifications.json");

			await withManagedRootSnapshot(ctx, "uc-f02-notifications", async () => {
				await writeNotificationStore(ctx, {
					items: NOTIFICATION_FIXTURES,
					readAtById: {},
				});

				let dialog: LiveSurface | null = null;
				try {
					dialog = await openWorkspaceToolDialog(
						ctx,
						"messages",
						"dialog-messages",
					);
					checks.push(
						check(
							"dialog-messages surface opened",
							Boolean(dialog),
							dialog ? `port=${dialog.port}` : "not live",
						),
					);
					if (!dialog) return;

					// List view renders both fixture rows.
					const listed = await waitForDom(
						ctx,
						dialog,
						`document.querySelectorAll('[data-notification-id]').length >= 2`,
						30_000,
					);
					const listState = (await ctx.evalJs(
						dialog,
						`(() => ({
							count: document.querySelectorAll('[data-notification-id]').length,
							names: [...document.querySelectorAll('[data-notification-id]')]
								.map((b) => (b.closest('li')?.textContent ?? '').slice(0, 80)),
						}))()`,
					)) as { count?: number; names?: string[] };
					checks.push(
						check(
							"notification list renders seeded items",
							Boolean(listed) &&
								(listState.names ?? []).some((n) =>
									n.includes("E2E Alpha Notice"),
								),
							`count=${listState.count} listed=${Boolean(listed)}`,
						),
					);

					// Open the first fixture → detail view; opening auto-marks read.
					await ctx.evalJs(
						dialog,
						`(() => {
							const btn = document.querySelector(
								'[data-notification-id="e2e-n1-alpha"]');
							if (btn) btn.click();
							return Boolean(btn);
						})()`,
					);
					const detailTitle = await waitForDom(
						ctx,
						dialog,
						`(() => {
							const h1 = document.querySelector(
								'[data-surface-id="dialog-messages"] h1');
							return h1 && h1.textContent.includes('E2E Alpha Notice')
								? h1.textContent : null;
						})()`,
						20_000,
					);
					checks.push(
						check(
							"detail view shows selected notification",
							Boolean(detailTitle),
							String(detailTitle ?? "no detail title"),
						),
					);

					const markedRead = await waitForReadState(
						ctx,
						"e2e-n1-alpha",
						"read",
					);
					checks.push(
						check(
							"opening detail persisted read state to cache/notifications.json",
							markedRead,
							`readAtById.e2e-n1-alpha=${markedRead}`,
						),
					);

					// Toggle read → unread via the detail header button
					// (`aria-pressed` reflects read state; locale-free hook).
					const toggledOff = await ctx.evalJs(
						dialog,
						`(() => {
							const btn = document.querySelector(
								'[data-surface-id="dialog-messages"] button[aria-pressed="true"]');
							if (!btn) return "missing-toggle";
							btn.click();
							return "clicked";
						})()`,
					);
					const unmarked = await waitForReadState(
						ctx,
						"e2e-n1-alpha",
						"unread",
					);
					checks.push(
						check(
							"mark-unread toggle persisted to cache",
							toggledOff === "clicked" && unmarked,
							`click=${String(toggledOff)} persisted=${unmarked}`,
						),
					);

					// Toggle back to read for a full round-trip.
					await ctx.evalJs(
						dialog,
						`(() => {
							const btn = document.querySelector(
								'[data-surface-id="dialog-messages"] button[aria-pressed="false"]');
							if (btn) btn.click();
							return Boolean(btn);
						})()`,
					);
					const remarked = await waitForReadState(ctx, "e2e-n1-alpha", "read");
					checks.push(
						check(
							"mark-read toggle persisted to cache",
							remarked,
							`persisted=${remarked}`,
						),
					);

					// Back to list via the localized back button.
					const lang = await surfaceLang(ctx, dialog);
					const backLabel = await resolveLocaleKey(
						lang,
						"online:notificationCenter.backToList",
					);
					if (backLabel) {
						await ctx.evalJs(
							dialog,
							`(() => {
								const btn = [...document.querySelectorAll('button')].find(
									(b) => b.getAttribute('aria-label') === ${JSON.stringify(backLabel)});
								if (btn) btn.click();
								return Boolean(btn);
							})()`,
						);
					}
					const backToList = await waitForDom(
						ctx,
						dialog,
						`document.querySelectorAll('[data-notification-id]').length >= 2`,
						15_000,
					);
					checks.push(
						check(
							"back navigation returns to notification list",
							Boolean(backToList),
							`listItems=${backToList ? "restored" : "missing"}`,
						),
					);
				} finally {
					await closeDialogBySurfaceId(ctx, "dialog-messages");
				}
			});
			const restored = await readManagedFileBytes(
				ctx,
				"cache",
				"notifications.json",
			);
			checks.push(
				check(
					"cache/notifications.json restored after case",
					restored !== null,
					`${storePath} ${restored?.length ?? 0} bytes`,
				),
			);
			return {
				detail: "list/detail/read-state round-trip on seeded cache",
				checks,
				evidence: [storePath],
			};
		},
	},
	{
		uc: "UC-F01",
		title:
			"preset library: surface chrome, search field, view-mode switch, degraded empty state",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			let dialog: LiveSurface | null = null;
			try {
				dialog = await openWorkspaceToolDialog(
					ctx,
					"presetLibrary",
					"dialog-preset-library",
				);
				checks.push(
					check(
						"dialog-preset-library surface opened",
						Boolean(dialog),
						dialog ? `port=${dialog.port}` : "not live",
					),
				);
				if (!dialog) return { detail: "surface did not open", checks };

				const mounted = await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('section[data-online-preset-library]'))`,
					30_000,
				);
				checks.push(
					check(
						"preset library root mounted",
						Boolean(mounted),
						String(mounted).slice(0, 80),
					),
				);

				// Chrome: search input + 3-way view toggle (gallery/cards/list).
				const chrome = (await ctx.evalJs(
					dialog,
					`(() => {
						const root = document.querySelector('[data-online-preset-library]');
						if (!root) return { root: false };
						return {
							root: true,
							inputs: root.querySelectorAll('input').length,
							viewButtons: root.querySelectorAll('fieldset button[aria-pressed]').length,
						};
					})()`,
				)) as { root?: boolean; inputs?: number; viewButtons?: number };
				checks.push(
					check(
						"search field rendered",
						(chrome.inputs ?? 0) >= 1,
						`inputs=${chrome.inputs}`,
					),
					check(
						"view-mode toggle exposes gallery/cards/list",
						chrome.viewButtons === 3,
						`viewButtons=${chrome.viewButtons}`,
					),
				);

				// Switch to list view via its localized aria-label.
				const lang = await surfaceLang(ctx, dialog);
				const listLabel = await resolveLocaleKey(
					lang,
					"online:catalog.viewList",
				);
				if (listLabel) {
					await ctx.evalJs(
						dialog,
						`(() => {
							const btn = [...document.querySelectorAll(
								'[data-online-preset-library] fieldset button[aria-pressed]')]
								.find((b) => b.getAttribute('aria-label') === ${JSON.stringify(listLabel)});
							if (btn) btn.click();
							return Boolean(btn);
						})()`,
					);
					const listActive = await waitForDom(
						ctx,
						dialog,
						`(() => {
							const btn = [...document.querySelectorAll(
								'[data-online-preset-library] fieldset button[aria-pressed]')]
								.find((b) => b.getAttribute('aria-label') === ${JSON.stringify(listLabel)});
							return btn && btn.getAttribute('aria-pressed') === 'true';
						})()`,
						10_000,
					);
					checks.push(
						check(
							"list view mode activates",
							Boolean(listActive),
							`aria-label=${JSON.stringify(listLabel)}`,
						),
					);
				}

				// Results area: either catalog items or an honest degraded
				// empty state. The empty state must carry the gateway boot
				// reason attribute so operators can tell *why* it is empty.
				const results = await waitForDom(
					ctx,
					dialog,
					`(() => {
						const root = document.querySelector('[data-online-preset-library]');
						if (!root) return null;
						const empty = root.querySelector('[data-online-preset-empty]');
						const cards = root.querySelectorAll('[data-ws-preset-card]').length;
						const table = root.querySelectorAll('table').length;
						if (!empty && cards === 0 && table === 0) return null;
						return {
							empty: Boolean(empty),
							reason: empty?.getAttribute('data-gateway-boot-reason') ?? null,
							cards,
							table,
						};
					})()`,
					45_000,
				);
				const resultState = results as {
					empty?: boolean;
					reason?: string | null;
					cards?: number;
					table?: number;
				} | null;
				checks.push(
					check(
						"results area settles (items or degraded empty state)",
						Boolean(resultState),
						JSON.stringify(resultState ?? "no results region"),
					),
				);
				if (resultState?.empty) {
					checks.push(
						check(
							"degraded empty state exposes gateway boot reason",
							typeof resultState.reason === "string",
							`reason=${JSON.stringify(resultState.reason)}`,
						),
					);
				}
				return {
					detail:
						"browse chrome verified; download→catalog leg needs live gateway (deferred)",
					checks,
				};
			} finally {
				await closeDialogBySurfaceId(ctx, "dialog-preset-library");
			}
		},
	},
	{
		uc: "UC-F04",
		title:
			"settings → Updates: provided surfaces only, feed check reaches a terminal status",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			let dialog: LiveSurface | null = null;
			try {
				dialog = await openSettingsDialog(ctx);
				checks.push(
					check(
						"dialog-settings surface opened",
						Boolean(dialog),
						dialog ? `port=${dialog.port}` : "not live",
					),
				);
				if (!dialog) return { detail: "settings dialog did not open", checks };

				// Unprovided-surface contract (Issue #82 / product-model §3.3):
				// the dormant cloud-sync "network" section must not be
				// registered in the settings sidebar at all.
				const networkTab = await ctx.evalJs(
					dialog,
					`Boolean(document.querySelector('[data-settings-sidebar-item="network"]'))`,
				);
				checks.push(
					check(
						"unprovided network/cloud-sync section is not presented",
						networkTab === false,
						`present=${networkTab}`,
					),
				);

				// Navigate to the Updates section.
				await ctx.evalJs(
					dialog,
					`(() => {
						const tab = document.querySelector(
							'[data-settings-sidebar-item="update"]');
						if (tab) tab.click();
						return Boolean(tab);
					})()`,
				);
				const sectionMounted = await waitForDom(
					ctx,
					dialog,
					`Boolean(document.querySelector('[data-settings-sidebar-section="update"]'))`,
					15_000,
				);
				checks.push(
					check(
						"Updates section mounted",
						Boolean(sectionMounted),
						String(sectionMounted).slice(0, 80),
					),
				);
				if (!sectionMounted)
					return { detail: "update section missing", checks };

				// Provided surfaces: channel listbox with exactly the 3
				// release channels, a Check-now affordance, and a status line.
				const opened = await ctx.evalJs(
					dialog,
					`(() => {
						const sec = document.querySelector('[data-settings-sidebar-section="update"]');
						const trigger = sec?.querySelector('button[aria-haspopup="listbox"]');
						if (trigger) trigger.click();
						return Boolean(trigger);
					})()`,
				);
				const optionCount = opened
					? await waitForDom(
							ctx,
							dialog,
							`document.querySelectorAll('[role="option"]').length`,
							10_000,
						)
					: 0;
				checks.push(
					check(
						"channel selector offers exactly stable/beta/insider",
						optionCount === 3,
						`options=${optionCount}`,
					),
				);
				// Close the listbox again (Escape or re-click trigger).
				await ctx.evalJs(
					dialog,
					`(() => {
						const sec = document.querySelector('[data-settings-sidebar-section="update"]');
						const trigger = sec?.querySelector('button[aria-haspopup="listbox"]');
						if (trigger) trigger.click();
						return true;
					})()`,
				);

				// Terminal status detection: the check auto-runs on section
				// mount (`runCheck` in UpdateSection). Accept up-to-date /
				// unavailable / update-available — the degraded states prove
				// the fetch path resolved without hanging the dialog.
				const lang = await surfaceLang(ctx, dialog);
				const statusLabels = {
					upToDate: await resolveLocaleKey(lang, "settings:updates.upToDate"),
					unavailable: await resolveLocaleKey(
						lang,
						"settings:updates.unavailable",
					),
					availableTpl: await resolveLocaleKey(
						lang,
						"settings:updates.available",
					),
					checking: await resolveLocaleKey(lang, "settings:updates.checking"),
					notChecked: await resolveLocaleKey(
						lang,
						"settings:updates.notChecked",
					),
				};
				const availableAffix = templateAffixes(statusLabels.availableTpl);
				const statusProbe = `(() => {
					const sec = document.querySelector('[data-settings-sidebar-section="update"]');
					if (!sec) return null;
					return [...sec.querySelectorAll('span')].map((s) => s.textContent ?? '');
				})()`;
				const classify = (texts: string[]): string => {
					for (const t of texts) {
						if (statusLabels.upToDate && t === statusLabels.upToDate)
							return "up-to-date";
						if (statusLabels.unavailable && t === statusLabels.unavailable)
							return "unavailable";
						if (
							availableAffix &&
							t.startsWith(availableAffix.pre) &&
							t.endsWith(availableAffix.post)
						)
							return "update-available";
					}
					return "pending";
				};
				const statusDeadline = Date.now() + 60_000;
				let terminal = "pending";
				while (Date.now() < statusDeadline) {
					const texts = (await ctx.evalJs(dialog, statusProbe)) as
						| string[]
						| null;
					terminal = classify(texts ?? []);
					if (terminal !== "pending") break;
					await sleep(1_000);
				}
				checks.push(
					check(
						"update feed check reaches a terminal status",
						terminal !== "pending",
						`status=${terminal} labels=${JSON.stringify({
							upToDate: statusLabels.upToDate,
							unavailable: statusLabels.unavailable,
						})}`,
					),
				);

				// "Check now" is a provided surface: it must exist as a
				// clickable control inside the Updates section.
				const checkNowLabel = await resolveLocaleKey(
					lang,
					"settings:updates.checkNow",
				);
				const checkNow = checkNowLabel
					? await ctx.evalJs(
							dialog,
							`(() => {
								const sec = document.querySelector('[data-settings-sidebar-section="update"]');
								const btn = [...(sec?.querySelectorAll('button') ?? [])]
									.find((b) => (b.textContent ?? '').includes(${JSON.stringify(checkNowLabel)}));
								if (btn && !btn.disabled) { btn.click(); return 'clicked'; }
								return btn ? 'disabled' : 'missing';
							})()`,
						)
					: "no-label";
				checks.push(
					check(
						"check-now affordance present and clickable",
						checkNow === "clicked",
						`result=${String(checkNow)}`,
					),
				);
				if (checkNow === "clicked") {
					// Re-check resolves to a terminal state again.
					const recheckDeadline = Date.now() + 60_000;
					let recheck = "pending";
					while (Date.now() < recheckDeadline) {
						const texts = (await ctx.evalJs(dialog, statusProbe)) as
							| string[]
							| null;
						recheck = classify(texts ?? []);
						if (recheck !== "pending") break;
						await sleep(1_000);
					}
					checks.push(
						check(
							"manual re-check reaches a terminal status",
							recheck !== "pending",
							`status=${recheck}`,
						),
					);
				}
				return {
					detail: `update check terminal=${terminal}; network-dependent content deferred`,
					checks,
				};
			} finally {
				await closeDialogBySurfaceId(ctx, "dialog-settings");
			}
		},
	},
	{
		uc: "UC-F05",
		title:
			"notification feed: empty cache triggers remote sync and settles to items or empty state",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const storePath = managedFilePath(ctx, "cache", "notifications.json");

			await withManagedRootSnapshot(
				ctx,
				"uc-f05-notification-feed",
				async () => {
					// Empty cache forces the center's auto-sync path
					// (`items.length === 0 → syncRemote`).
					await writeNotificationStore(ctx, { items: [], readAtById: {} });

					let dialog: LiveSurface | null = null;
					try {
						dialog = await openWorkspaceToolDialog(
							ctx,
							"messages",
							"dialog-messages",
						);
						checks.push(
							check(
								"dialog-messages surface opened",
								Boolean(dialog),
								dialog ? `port=${dialog.port}` : "not live",
							),
						);
						if (!dialog) return;

						const lang = await surfaceLang(ctx, dialog);
						const emptyLabel = await resolveLocaleKey(
							lang,
							"online:notificationCenter.empty",
						);
						const loadingLabel = await resolveLocaleKey(
							lang,
							"online:notificationCenter.loading",
						);

						// Settle: remote items rendered OR the localized empty
						// state (offline/degraded feed → cache stays authoritative).
						const settleProbe = `(() => {
						const root = document.querySelector('[data-surface-id="dialog-messages"]');
						if (!root) return null;
						const text = root.textContent ?? '';
						const items = root.querySelectorAll('[data-notification-id]').length;
						return { items, text };
					})()`;
						const deadline = Date.now() + 60_000;
						let settled: "items" | "empty" | "timeout" = "timeout";
						while (Date.now() < deadline) {
							const state = (await ctx.evalJs(dialog, settleProbe)) as {
								items?: number;
								text?: string;
							} | null;
							if (!state) {
								await sleep(1_000);
								continue;
							}
							if ((state.items ?? 0) > 0) {
								settled = "items";
								break;
							}
							const isLoading =
								loadingLabel !== null &&
								(state.text ?? "").includes(loadingLabel);
							const isEmpty =
								emptyLabel !== null && (state.text ?? "").includes(emptyLabel);
							if (isEmpty && !isLoading) {
								settled = "empty";
								break;
							}
							await sleep(1_000);
						}
						checks.push(
							check(
								"notification center settles after feed sync (items or empty)",
								settled !== "timeout",
								`settled=${settled}`,
							),
						);

						// Manual refresh must not wedge the dialog; afterwards the
						// store file must still be valid JSON with an items array.
						const refreshLabel = await resolveLocaleKey(
							lang,
							"online:notificationCenter.refresh",
						);
						if (refreshLabel) {
							await ctx.evalJs(
								dialog,
								`(() => {
								const btn = [...document.querySelectorAll('button')].find(
									(b) => b.getAttribute('aria-label') === ${JSON.stringify(refreshLabel)});
								if (btn && !btn.disabled) { btn.click(); return 'clicked'; }
								return btn ? 'disabled' : 'missing';
							})()`,
							);
						}
						await sleep(3_000);
						const afterRefresh = await readNotificationStore(ctx);
						checks.push(
							check(
								"store remains valid JSON with items array after refresh",
								Array.isArray(afterRefresh?.items),
								`items=${Array.isArray(afterRefresh?.items) ? afterRefresh?.items?.length : "invalid"}`,
							),
						);
					} finally {
						await closeDialogBySurfaceId(ctx, "dialog-messages");
					}
				},
			);
			const restoredBytes = await readManagedFileBytes(
				ctx,
				"cache",
				"notifications.json",
			);
			checks.push(
				check(
					"cache/notifications.json restored after case",
					restoredBytes !== null,
					`${storePath} ${restoredBytes?.length ?? 0} bytes`,
				),
			);
			return {
				detail:
					"feed sync reached a settled state; live feed content needs network",
				checks,
				evidence: [storePath],
			};
		},
	},
	{
		uc: "UC-E07",
		title:
			"update channel change persists ui.updateChannel to settings/app.json",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const appJsonPath = managedFilePath(ctx, "settings", "app.json");
			let dialog: LiveSurface | null = null;

			await withManagedRootSnapshot(ctx, "uc-e07-update-channel", async () => {
				try {
					dialog = await openSettingsDialog(ctx);
					checks.push(
						check(
							"dialog-settings surface opened",
							Boolean(dialog),
							dialog ? `port=${dialog.port}` : "not live",
						),
					);
					if (!dialog) return;

					await ctx.evalJs(
						dialog,
						`(() => {
							const tab = document.querySelector(
								'[data-settings-sidebar-item="update"]');
							if (tab) tab.click();
							return Boolean(tab);
						})()`,
					);
					const sectionMounted = await waitForDom(
						ctx,
						dialog,
						`Boolean(document.querySelector('[data-settings-sidebar-section="update"] button[aria-haspopup="listbox"]'))`,
						15_000,
					);
					checks.push(
						check(
							"Updates section channel selector mounted",
							Boolean(sectionMounted),
							String(sectionMounted).slice(0, 80),
						),
					);
					if (!sectionMounted) return;

					// Read the persisted channel to pick a different target.
					const before = await ctx.readManagedJson<{
						ui?: { updateChannel?: string };
					}>("settings", "app.json");
					const current = before?.ui?.updateChannel ?? "stable";
					const target = current === "beta" ? "insider" : "beta";

					const lang = await surfaceLang(ctx, dialog);
					const targetLabel = await resolveLocaleKey(
						lang,
						`settings:updates.${target}`,
					);
					if (!targetLabel) {
						checks.push(
							check(
								"target channel label resolved",
								false,
								`no settings:updates.${target} for ${lang}`,
							),
						);
						return;
					}

					// Open the listbox and pick the target option by label.
					const picked = await ctx.evalJs(
						dialog,
						`(() => {
							const sec = document.querySelector('[data-settings-sidebar-section="update"]');
							const trigger = sec?.querySelector('button[aria-haspopup="listbox"]');
							if (trigger) trigger.click();
							return Boolean(trigger);
						})()`,
					);
					await waitForDom(
						ctx,
						dialog,
						`document.querySelectorAll('[role="option"]').length === 3`,
						10_000,
					);
					const optionClicked = await ctx.evalJs(
						dialog,
						`(() => {
							const opt = [...document.querySelectorAll('[role="option"]')]
								.find((o) => (o.textContent ?? '').trim() === ${JSON.stringify(targetLabel)});
							if (opt) { opt.click(); return 'clicked'; }
							return 'missing:' + ${JSON.stringify(targetLabel)};
						})()`,
					);
					checks.push(
						check(
							"channel option clicked",
							optionClicked === "clicked" && picked === true,
							`trigger=${String(picked)} option=${String(optionClicked)}`,
						),
					);

					// Settings writes are async; poll app.json for the value.
					let persisted: string | undefined;
					const persistDeadline = Date.now() + 20_000;
					while (Date.now() < persistDeadline) {
						const doc = await ctx.readManagedJson<{
							ui?: { updateChannel?: string };
						}>("settings", "app.json");
						persisted = doc?.ui?.updateChannel;
						if (persisted === target) break;
						await sleep(700);
					}
					checks.push(
						check(
							"ui.updateChannel persisted to settings/app.json",
							persisted === target,
							`before=${current} persisted=${persisted} target=${target}`,
						),
					);
				} finally {
					await closeDialogBySurfaceId(ctx, "dialog-settings");
				}
			});
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
				detail: "channel change → settings persistence round-trip",
				checks,
				evidence: [appJsonPath],
			};
		},
	},
];
