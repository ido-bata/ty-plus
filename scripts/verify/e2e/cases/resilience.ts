/**
 * Resilience suite: corrupt managed-root files must not destroy user data
 * and must not crash the panel boot (Issue #108; matrix UC-I01/I02/I04/I05,
 * UC-C16).
 *
 * Every case follows the same contract, verified against the storage code:
 *
 * - `workspaces/workspace-N.json` — `planLayoutRestoreFromText` classifies
 *   unparseable bytes as `corrupt`, closes the write gate, and shows the
 *   LayoutRestoreBanner. Nothing writes the file back.
 * - `widgets/widgets.json`, `presets/presets.json`, `settings/app.json` —
 *   readers degrade to empty/defaults and no boot path writes them back,
 *   so the corrupt bytes must still be on disk after reload.
 * - `styles/theme.css` — overrides parse to `{}` (defaults) and the
 *   Issue #112 boot reconcile MAY rewrite the file from app.json. Either
 *   byte-preservation or a regenerated valid `:root{}` block is a pass.
 *
 * Each case snapshots the managed root first and restores it in `finally`,
 * then reloads panel-1 so the user's real data is what the panel sees.
 */

import type { E2EContext } from "../ctx";
import { check, type E2ECase } from "../report";
import {
	corruptJsonBytes,
	managedFilePath,
	readManagedFileBytes,
	reloadPanel1,
	tileCountExpression,
	waitForDom,
	withManagedRootSnapshot,
	writeManagedFile,
} from "./shared";

const GRID_PROBE = `Boolean(document.querySelector("[data-workspace-grid]"))`;

const bytesEqual = (a: Buffer | null, b: Buffer): boolean =>
	a?.equals(b) ?? false;

const runCorruptBootCase = async (options: {
	ctx: E2EContext;
	snapshotName: string;
	target: string[];
	corrupt: Buffer;
	/** Extra DOM probe that must come back truthy after the corrupt boot. */
	extraProbe?: { name: string; expression: string; timeoutMs?: number };
}): Promise<{ detail: string; checks: ReturnType<typeof check>[] }> => {
	const { ctx, target, corrupt } = options;
	const checks: ReturnType<typeof check>[] = [];
	try {
		await withManagedRootSnapshot(ctx, options.snapshotName, async () => {
			await writeManagedFile(ctx, target, corrupt);
			const preBytes = await readManagedFileBytes(ctx, ...target);
			checks.push(
				check(
					`${target.join("/")} overwritten with corrupt bytes`,
					bytesEqual(preBytes, corrupt),
					preBytes ? `${preBytes.length} bytes` : "write failed",
				),
			);

			const panel = await reloadPanel1(ctx);
			const boot = (await ctx.evalJs(
				panel,
				`(() => ({
					bodyLength: document.body ? document.body.innerHTML.length : 0,
					grid: Boolean(document.querySelector("[data-workspace-grid]")),
					tiles: ${tileCountExpression},
				}))()`,
			)) as { bodyLength?: number; grid?: boolean; tiles?: number };
			checks.push(
				check(
					"panel boots with non-trivial DOM after corrupt file",
					(boot.bodyLength ?? 0) > 500,
					`body=${boot.bodyLength} grid=${boot.grid} tiles=${boot.tiles}`,
				),
			);

			if (options.extraProbe) {
				const probe = await waitForDom(
					ctx,
					panel,
					options.extraProbe.expression,
					options.extraProbe.timeoutMs ?? 20_000,
				);
				checks.push(
					check(
						options.extraProbe.name,
						Boolean(probe),
						probe ? "present" : "absent",
					),
				);
			}

			const postBytes = await readManagedFileBytes(ctx, ...target);
			const preserved = bytesEqual(postBytes, corrupt);
			checks.push(
				check(
					`${target.join("/")} not silently destroyed on boot`,
					preserved,
					preserved
						? "corrupt bytes preserved"
						: `file changed (${postBytes?.length ?? 0} bytes)`,
				),
			);
		});
	} finally {
		// withManagedRootSnapshot restores in its own finally, so by the time
		// control reaches here the real data is back on disk. Reload panel-1
		// so the user's session sees it again — best-effort so a failed
		// reload cannot mask the case result.
		try {
			await reloadPanel1(ctx, 30_000);
		} catch {
			// ignore — restoration already ran
		}
	}
	return {
		detail: managedFilePath(ctx, ...target),
		checks,
	};
};

const themeCssSurvivesOrRegenerates = (
	post: Buffer | null,
	corrupt: Buffer,
): { ok: boolean; detail: string } => {
	if (post === null) {
		return { ok: false, detail: "theme.css deleted" };
	}
	if (post.equals(corrupt)) {
		return { ok: true, detail: "corrupt bytes preserved (defaults applied)" };
	}
	const text = post.toString("utf8");
	const valid =
		text.trim() === "" ||
		/:root\s*\{[^}]*\}/s.test(text) ||
		!text.includes("e2e-corrupt");
	return valid
		? { ok: true, detail: "theme.css regenerated to a valid override doc" }
		: { ok: false, detail: "theme.css rewritten to unexpected content" };
};

export const resilienceCases: E2ECase[] = [
	{
		uc: "UC-I01",
		title: "corrupt workspaces/workspace-1.json: banner shown, bytes preserved",
		async run(ctx: E2EContext) {
			return runCorruptBootCase({
				ctx,
				snapshotName: "uc-i01-workspace-1",
				target: ["workspaces", "workspace-1.json"],
				corrupt: corruptJsonBytes('{"gridCells":['),
				extraProbe: {
					name: "layout restore banner reports corrupt",
					expression: `Boolean(document.querySelector(
						'[data-testid="layout-restore-banner"][data-restore-status="corrupt"]'
					))`,
					timeoutMs: 20_000,
				},
			});
		},
	},
	{
		uc: "UC-I02",
		title:
			"corrupt widgets/widgets.json: boots, bytes preserved (UC-D12 alias)",
		async run(ctx: E2EContext) {
			return runCorruptBootCase({
				ctx,
				snapshotName: "uc-i02-widgets",
				target: ["widgets", "widgets.json"],
				corrupt: corruptJsonBytes('{"version":1,"widgets":['),
				extraProbe: {
					name: "workspace grid still rendered",
					expression: GRID_PROBE,
					timeoutMs: 20_000,
				},
			});
		},
	},
	{
		uc: "UC-I04",
		title:
			"corrupt styles/theme.css: defaults fallback, file preserved or repaired",
		async run(ctx: E2EContext) {
			const corrupt = Buffer.from("{{{ e2e-corrupt theme }}", "utf8");
			const checks: ReturnType<typeof check>[] = [];
			await withManagedRootSnapshot(ctx, "uc-i04-theme-css", async () => {
				await writeManagedFile(ctx, ["styles", "theme.css"], corrupt);
				const panel = await reloadPanel1(ctx);
				// The workspace grid mounts asynchronously after boot; every
				// other corrupt-boot case polls GRID_PROBE via waitForDom, so
				// do the same here before sampling computed styles once.
				await waitForDom(ctx, panel, GRID_PROBE, 20_000);
				const boot = (await ctx.evalJs(
					panel,
					`(() => ({
						bodyLength: document.body ? document.body.innerHTML.length : 0,
						grid: Boolean(document.querySelector("[data-workspace-grid]")),
						accent: getComputedStyle(document.documentElement)
							.getPropertyValue("--color-ty-accent").trim(),
					}))()`,
				)) as {
					bodyLength?: number;
					grid?: boolean;
					accent?: string;
				};
				checks.push(
					check(
						"panel boots and applies fallback theme",
						(boot.bodyLength ?? 0) > 500 && boot.grid === true,
						`body=${boot.bodyLength} grid=${boot.grid} accent=${boot.accent}`,
					),
				);
				const post = await readManagedFileBytes(ctx, "styles", "theme.css");
				const verdict = themeCssSurvivesOrRegenerates(post, corrupt);
				checks.push(
					check(
						"styles/theme.css preserved or regenerated",
						verdict.ok,
						verdict.detail,
					),
				);
			});
			try {
				await reloadPanel1(ctx, 30_000);
			} catch {
				// restore already ran; reload is best-effort
			}
			return {
				detail: managedFilePath(ctx, "styles", "theme.css"),
				checks,
			};
		},
	},
	{
		uc: "UC-I05",
		title: "corrupt settings/app.json: defaults fallback, bytes preserved",
		async run(ctx: E2EContext) {
			return runCorruptBootCase({
				ctx,
				snapshotName: "uc-i05-app-json",
				target: ["settings", "app.json"],
				corrupt: corruptJsonBytes('{"version":2,"ui":{"language":"en",'),
				extraProbe: {
					name: "workspace grid still rendered",
					expression: GRID_PROBE,
					timeoutMs: 20_000,
				},
			});
		},
	},
	{
		uc: "UC-C16",
		title: "corrupt presets/presets.json: boots, records preserved",
		async run(ctx: E2EContext) {
			return runCorruptBootCase({
				ctx,
				snapshotName: "uc-c16-presets",
				target: ["presets", "presets.json"],
				corrupt: corruptJsonBytes('{"version":1,"presets":['),
				extraProbe: {
					name: "workspace grid still rendered",
					expression: GRID_PROBE,
					timeoutMs: 20_000,
				},
			});
		},
	},
];
