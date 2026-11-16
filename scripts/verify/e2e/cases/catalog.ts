/**
 * Preset catalog suite (Issue #108; matrix UC-C15).
 *
 * Contract verified against `management/preset/asset-verification.ts` and
 * `panel/boot.tsx`: there is deliberately NO boot-time catalog scan
 * (Issue #131 — `Promise.race` was not true cancellation and flooded the
 * AE host). Stale detection is lazy: `verifyPresetAsset` on the host
 * returns a typed `{exists:false}` and the execute/run path disables the
 * affordance. So this case asserts the implemented contract:
 *
 * - a preset record pointing at a nonexistent asset survives boot intact
 *   (the app does not silently drop or quarantine it),
 * - sibling records are unaffected,
 * - the host-side `verifyPresetAsset` probe reports `exists:false` for the
 *   bogus path — the typed failure the lazy gate consumes.
 */
import { randomUUID } from "node:crypto";
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

type PresetRow = {
	id?: string;
	type?: string;
	title?: string;
	filePath?: string;
};
type PresetCatalog = { version?: number; presets?: PresetRow[] };

const readCatalog = async (ctx: E2EContext): Promise<PresetCatalog | null> => {
	const text = await ctx.readManagedText("presets", "presets.json");
	if (text === null) return null;
	try {
		return JSON.parse(text) as PresetCatalog;
	} catch {
		return null;
	}
};

export const catalogCases: E2ECase[] = [
	{
		uc: "UC-C15",
		title:
			"preset with missing asset: record survives boot, host verify reports missing",
		async run(ctx: E2EContext) {
			const checks: ReturnType<typeof check>[] = [];
			const staleId = randomUUID();
			const stalePath = `/tmp/ty-plus-e2e-missing-${randomUUID()}.ffx`;
			const catalogPath = managedFilePath(ctx, "presets", "presets.json");

			const before = await readCatalog(ctx);
			const beforeCount = before?.presets?.length ?? 0;

			await withManagedRootSnapshot(ctx, "uc-c15-stale-preset", async () => {
				const doc: PresetCatalog = before ?? { version: 1, presets: [] };
				doc.presets = [
					...(doc.presets ?? []),
					{
						id: staleId,
						type: "preset",
						title: "e2e-stale-asset",
						filePath: stalePath,
					},
				];
				await writeManagedFile(
					ctx,
					["presets", "presets.json"],
					`${JSON.stringify(doc, null, 2)}\n`,
				);

				const panel = await reloadPanel1(ctx);
				await waitForDom(
					ctx,
					panel,
					`Boolean(document.querySelector("[data-workspace-grid]"))`,
					20_000,
				);
				const boot = (await ctx.evalJs(
					panel,
					`(() => ({
						bodyLength: document.body ? document.body.innerHTML.length : 0,
						grid: Boolean(document.querySelector("[data-workspace-grid]")),
						tiles: document.querySelectorAll(
							"[data-workspace-preset-tile], [data-workspace-widget-tile]"
						).length,
					}))()`,
				)) as { bodyLength?: number; grid?: boolean; tiles?: number };
				checks.push(
					check(
						"panel boots with workspace grid after stale record added",
						(boot.bodyLength ?? 0) > 500 && boot.grid === true,
						`body=${boot.bodyLength} grid=${boot.grid} tiles=${boot.tiles}`,
					),
				);

				const after = await readCatalog(ctx);
				const rows = after?.presets ?? [];
				const staleRow = rows.find((r) => r.id === staleId);
				checks.push(
					check(
						"stale preset record not dropped or rewritten on boot",
						staleRow?.filePath === stalePath,
						staleRow ? `filePath=${staleRow.filePath}` : "record missing",
					),
				);
				checks.push(
					check(
						"sibling preset records unaffected",
						rows.length === beforeCount + 1,
						`before=${beforeCount} after=${rows.length}`,
					),
				);

				// Host-side detection primitive the lazy gate consumes.
				const hostPath = `${ctx.options.extensionDir}/jsx/ty-plus-host.jsx`;
				const verifyRaw = await ctx.evalScriptOnPanel1(
					`(function(){
						try {
							var h = $.global && $.global.__TY_PLUS_HOST__;
							if (!h || typeof h.verifyPresetAsset !== "function") {
								$.evalFile(${JSON.stringify(hostPath)});
								h = $.global && $.global.__TY_PLUS_HOST__;
							}
							if (!h || typeof h.verifyPresetAsset !== "function") {
								return "contract-missing";
							}
							return h.verifyPresetAsset(${JSON.stringify(JSON.stringify([stalePath]))});
						} catch (e) { return "error:" + e.toString(); }
					})()`,
				);
				type VerifyResult = {
					ok?: boolean;
					value?: { exists?: boolean; path?: string };
				};
				let verify: VerifyResult | null = null;
				try {
					verify = JSON.parse(String(verifyRaw)) as VerifyResult;
				} catch {
					verify = null;
				}
				checks.push(
					check(
						"host verifyPresetAsset reports exists:false for stale path",
						verify?.ok === true && verify?.value?.exists === false,
						`raw=${String(verifyRaw).slice(0, 200)}`,
					),
				);
			});
			try {
				await reloadPanel1(ctx, 30_000);
			} catch {
				// restore already ran; reload is best-effort
			}
			const restoredBytes = await readManagedFileBytes(
				ctx,
				"presets",
				"presets.json",
			);
			checks.push(
				check(
					"presets/presets.json restored after case",
					restoredBytes !== null,
					`${catalogPath} ${restoredBytes?.length ?? 0} bytes`,
				),
			);
			return {
				detail: `stale record ${staleId} → ${stalePath}`,
				checks,
			};
		},
	},
];
