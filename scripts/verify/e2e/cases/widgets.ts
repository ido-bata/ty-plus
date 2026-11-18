/**
 * Widget suite (Issue #108; matrix UC-D11).
 *
 * Widget state lives in `widgets/state/<name>.json`. The easing widget is
 * the cleanest round-trip: it reads its per-instance row at mount
 * (`readWidgetStateJson(window, "easing", { instanceId })` in
 * `function/widget/core/easing/Component.tsx`) and renders the loop-count
 * input only in `loop` mode, so a file-level write is observable in the DOM
 * after a real panel reload — no widget UI driving required.
 *
 * File shape (written by `writeWidgetStateJson` with `instanceId`):
 * `{ version: 1, instances: [{ id, mode, loopCount, ... }] }`.
 */

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import { clickFirst, findLive } from "./journey";
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

const listEasingInstanceIds = async (ctx: E2EContext): Promise<string[]> => {
	const doc = await ctx.readManagedJson<WidgetRecordsFile>(
		"widgets",
		"widgets.json",
	);
	return (doc?.widgets ?? [])
		.filter((w) => w.type === "easing")
		.map((w) => (typeof w.id === "string" ? w.id.trim() : ""))
		.filter((id) => id.length > 0);
};

const listMountedInstanceIds = async (ctx: E2EContext): Promise<string[]> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	const raw = await ctx.evalJs(
		panel,
		`[...document.querySelectorAll('[data-widget-instance-id]')]
			.map((el) => el.getAttribute('data-widget-instance-id') ?? '')
			.filter((id) => id.length > 0)`,
	);
	return Array.isArray(raw) ? (raw as string[]) : [];
};

/**
 * Resolve an easing widget instance that is actually mounted on panel-1.
 * `widgets/widgets.json` keeps records for widgets whose tile was removed,
 * so a record alone is not proof of a mounted tile — intersect record ids
 * with the live DOM.
 */
const findMountedEasingInstanceId = async (
	ctx: E2EContext,
): Promise<string | null> => {
	const recordIds = await listEasingInstanceIds(ctx);
	if (recordIds.length === 0) return null;
	const mounted = await listMountedInstanceIds(ctx);
	return recordIds.find((id) => mounted.includes(id)) ?? null;
};

/**
 * Place an easing widget through the real user path (toolbar → Add Widget
 * dialog → activate the easing entry) when no easing tile is mounted.
 * Returns an error string on failure, null on success.
 */
const placeEasingWidgetViaUi = async (
	ctx: E2EContext,
): Promise<string | null> => {
	const panel = await ctx.requireSurface({ surfaceId: "panel-1" });
	const clicked = await clickFirst(
		ctx,
		panel,
		'[data-ws-action="ty.ctx.add-widget"]',
	);
	if (clicked !== "clicked") {
		return `add-widget toolbar button: ${String(clicked)} (control panel may be collapsed)`;
	}
	const dialog = await findLive(
		ctx,
		(s) => s.surfaceId === "dialog-widget-selector",
		30_000,
	);
	if (!dialog) return "dialog-widget-selector surface did not open";
	await waitForDom(
		ctx,
		dialog,
		`document.querySelectorAll('[data-add-widget-type]').length > 0`,
		30_000,
	);
	const activated = await ctx.evalJs(
		dialog,
		`(() => {
			const el = document.querySelector('[data-add-widget-type="easing"]');
			if (!el) return "missing:easing-entry";
			el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
			return "activated";
		})()`,
	);
	if (activated !== "activated") {
		return `easing catalog entry: ${String(activated)}`;
	}
	// The new tile must appear in the DOM and its record in widgets.json;
	// poll the mounted∩record intersection rather than any tile count.
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (await findMountedEasingInstanceId(ctx)) return null;
		await new Promise((r) => setTimeout(r, 500));
	}
	return "easing widget tile did not mount after catalog activation";
};

export const widgetCases: E2ECase[] = [
	{
		uc: "UC-D11",
		title: "easing widget state file restores mode/loopCount after reload",
		precondition: async (ctx) => {
			const typed = ctx as E2EContext;
			try {
				const mountedId = await findMountedEasingInstanceId(typed);
				if (mountedId) return null;
				const recordCount = (await listEasingInstanceIds(typed)).length;
				if (recordCount === 0) {
					return "no easing widget record in widgets/widgets.json";
				}
				// Record exists but the tile is not mounted (e.g. removed from
				// the workspace). Re-place it through the real Add Widget flow
				// instead of skipping — the catalog path is the user contract.
				const placed = await placeEasingWidgetViaUi(typed);
				if (placed) return placed;
				return (await findMountedEasingInstanceId(typed))
					? null
					: "easing widget still not mounted after Add Widget flow";
			} catch (error) {
				return `precondition failed: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const instanceId = (await findMountedEasingInstanceId(ctx)) as string;
			const loopCount = 7; // inside MIN_LOOP_COUNT(2)..MAX_LOOP_COUNT(16)

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
					loopCount,
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
					const input = host.querySelector(
						'[data-ws-action="easing-loop-count-input"]'
					);
					return {
						mounted: true,
						loopInput: input ? String(input.value) : null,
					};
				})()`;
				const state = (await waitForDom(
					ctx,
					panel,
					`(() => { const r = ${probe}; return r.mounted && r.loopInput !== null ? r : null; })()`,
					30_000,
				)) as { mounted?: boolean; loopInput?: string | null } | null;

				checks.push(
					check(
						"easing widget tile mounted after reload",
						Boolean(state?.mounted),
						state ? "mounted" : "tile absent",
					),
				);
				checks.push(
					check(
						"loop mode + loopCount restored from widgets/state/easing.json",
						state?.loopInput === String(loopCount),
						`loopCount input=${state?.loopInput ?? "absent"} expected=${loopCount}`,
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
				detail: `instance=${instanceId} loopCount=${loopCount}`,
				checks,
			};
		},
	},
];
