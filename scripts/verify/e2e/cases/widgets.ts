/**
 * Widget suite (Issue #108; matrix UC-D11).
 *
 * Widget state lives in `widgets/state/<name>.json`. The easing widget is
 * the cleanest round-trip: it reads its per-instance row at mount
 * (`readWidgetStateJson(window, "easing", { instanceId })` in
 * `function/widget/core/easing/Component.tsx`) and renders the mode
 * segmented control from the restored state, so a file-level write is
 * observable in the DOM after a real panel reload — no widget UI driving
 * required.
 *
 * File shape (written by `writeWidgetStateJson` with `instanceId`):
 * `{ version: 1, instances: [{ id, mode, ... }] }`.
 *
 * The legacy `"loop"` mode was split into its own widget; a stored loop
 * state must coerce to `"curve"` (the mode it was based on) and the mode
 * strip must expose only curve/bounce/elastic.
 */

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import {
	managedFilePath,
	readManagedFileBytes,
	reloadPanel1,
	waitForDom,
	withManagedRootSnapshot,
	writeManagedFile,
} from "./shared";

type WidgetRecord = { id?: string; type?: string };
type WidgetRecordsFile = { widgets?: WidgetRecord[] };

type EasingStateFile = {
	version?: number;
	instances?: Record<string, unknown>[];
};

const EASING_STATE = ["widgets", "state", "easing.json"] as const;

const findEasingInstanceId = async (
	ctx: E2EContext,
): Promise<string | null> => {
	const doc = await ctx.readManagedJson<WidgetRecordsFile>(
		"widgets",
		"widgets.json",
	);
	const record = (doc?.widgets ?? []).find((w) => w.type === "easing");
	const id = typeof record?.id === "string" ? record.id.trim() : "";
	return id || null;
};

export const widgetCases: E2ECase[] = [
	{
		uc: "UC-D11",
		title:
			"easing widget state file restores mode after reload (legacy loop coerces to curve)",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const instanceId = await findEasingInstanceId(typed);
				if (!instanceId) {
					return "no easing widget record in widgets/widgets.json";
				}
				const panel = await typed.requireSurface({ surfaceId: "panel-1" });
				const mounted = await typed.evalJs(
					panel,
					`Boolean(document.querySelector('[data-widget-instance-id="${instanceId}"]'))`,
				);
				return mounted
					? null
					: `easing widget ${instanceId} not mounted on panel-1`;
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const instanceId = (await findEasingInstanceId(ctx)) as string;

			await withManagedRootSnapshot(ctx, "uc-d11-widget-state", async () => {
				// Merge into any existing catalog rows for other instances.
				const existingText = await ctx.readManagedText(...EASING_STATE);
				let instances: Record<string, unknown>[] = [];
				if (existingText) {
					try {
						const parsed = JSON.parse(existingText) as EasingStateFile;
						if (Array.isArray(parsed.instances)) {
							instances = parsed.instances.filter(
								(row): row is Record<string, unknown> =>
									Boolean(row) && typeof row === "object",
							);
						}
					} catch {
						instances = [];
					}
				}
				instances = instances.filter((row) => row.id !== instanceId);
				instances.push({
					id: instanceId,
					mode: "loop",
					applyMode: "pair",
					backgroundPattern: "dot",
					autoApply: true,
					labelColor: 0,
					customColors: {},
				});
				await writeManagedFile(
					ctx,
					[...EASING_STATE],
					`${JSON.stringify({ version: 1, instances }, null, 2)}\n`,
				);

				const panel = await reloadPanel1(ctx);
				const scope = `[data-widget-instance-id="${instanceId}"]`;
				const probe = `(() => {
					const host = document.querySelector(${JSON.stringify(scope)});
					if (!host) return { mounted: false };
					const buttons = [...host.querySelectorAll("[role='toolbar'] button")];
					return {
						mounted: true,
						modeCount: buttons.length,
						pressed: buttons.findIndex(
							(b) => b.getAttribute("aria-pressed") === "true"
						),
					};
				})()`;
				const state = (await waitForDom(
					ctx,
					panel,
					`(() => { const r = ${probe}; return r.mounted && r.modeCount === 3 ? r : null; })()`,
					30_000,
				)) as {
					mounted?: boolean;
					modeCount?: number;
					pressed?: number;
				} | null;

				checks.push(
					check(
						"easing widget tile mounted after reload",
						Boolean(state?.mounted),
						state ? "mounted" : "tile absent",
					),
				);
				checks.push(
					check(
						"mode strip exposes only curve/bounce/elastic (3 segments)",
						state?.modeCount === 3,
						`modeCount=${state?.modeCount ?? "absent"} expected=3`,
					),
				);
				checks.push(
					check(
						"stored loop mode coerced to curve (first segment pressed)",
						state?.pressed === 0,
						`pressedIndex=${state?.pressed ?? "none"} expected=0`,
					),
				);
			});
			try {
				await reloadPanel1(ctx, 30_000);
			} catch {
				// restore already ran; reload is best-effort
			}
			const restored = await readManagedFileBytes(ctx, ...EASING_STATE);
			checks.push(
				check(
					"widgets/state/easing.json restored after case",
					restored !== null,
					managedFilePath(ctx, ...EASING_STATE),
				),
			);
			return {
				detail: `instance=${instanceId}`,
				checks,
			};
		},
	},
];
