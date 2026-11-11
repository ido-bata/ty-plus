/**
 * Walk every Storybook story and capture a full-page PNG.
 *
 * Why this exists:
 *   `bun run storybook` dev server is unreliable (known "loading forever"
 *   gap documented in docs/architecture/ui-reconstruction/storybook.md
 *   §"Verification status"). For visual review without a live server, we
 *   serve the static `bunx storybook build` output on http://localhost:6007
 *   and drive every story through a dedicated playwright worker.
 *
 * Why manual renderToScreen (not addon channel events):
 *   Storybook 10's headless preview reports `currentRender.phase ===
 *   "finished"` and emits `storyRendered` on the addon channel, but
 *   `#storybook-root` stays empty — the React mount step never fires in
 *   headless Chromium. We confirmed by hand that calling
 *   `currentRender.renderToScreen({storyContext, unboundStoryFn,
 *   showMain, showException, forceRemount: true}, canvasElement)` does
 *   mount React correctly. See the renderStoryManually() body for the
 *   five-stage flow and docs/architecture/ui-reconstruction/storybook.md
 *   §"Verification status" for the diagnostic trail.
 *
 * Why direct playwright (not @storybook/test-runner):
 *   `@storybook/test-runner@0.24.x` loads `.storybook/test-runner.ts` via
 *   Jest's `serverRequire`, which goes through a Storybook internal chunk
 *   that calls `module.register()` for ESM hooks. Jest does not support
 *   `module.register()` and throws `throwHooksUnsupported`, taking down
 *   every story's test suite. So we cannot use the official `postVisit`
 *   hook. We replicate the relevant behaviour directly via playwright.
 *
 * Why python http.server (not `bunx serve`):
 *   `bunx serve` rewrites `iframe.html?id=...` to `/iframe` and drops the
 *   query string. python's `http.server` serves files verbatim, which
 *   storybook's story id resolution needs.
 *
 * Pipeline:
 *   1. Ensure `storybook-static/` exists (run `bunx storybook build` if not).
 *   2. Serve `storybook-static/` on http://localhost:6007 via
 *      `python3 -m http.server` (background).
 *   3. For each entry in `storybook-static/index.json`, launch one
 *      chromium page, navigate to `iframe.html?id=<id>&viewMode=story`,
 *      wait for `__STORYBOOK_PREVIEW__` to be ready, call
 *      `renderStoryManually()` to drive `currentRender.renderToScreen`,
 *      screenshot fullPage to `.tmp/storybook-screenshots/<id>.png`.
 *   4. Stop the static server.
 *   5. Generate `.tmp/storybook-screenshots/index.html` grouped gallery.
 *
 * Output:
 *   - `.tmp/storybook-screenshots/<story-id>.png` (one per story)
 *   - `.tmp/storybook-screenshots/index.html` (local browser gallery)
 *
 * WSL note:
 *   Chromium under WSL needs libnspr4 / libnss3 / libasound2. Set
 *   `LD_LIBRARY_PATH=~/chrome-libs/usr/lib/x86_64-linux-gnu` before
 *   running, or this script will exit non-zero from playwright.
 *
 * Usage:
 *   bun scripts/verify/sb-snapshot-all.ts                # full pipeline
 *   bun scripts/verify/sb-snapshot-all.ts --skip-build   # use existing
 *                                                        # storybook-static
 *   bun scripts/verify/sb-snapshot-all.ts --port 6008   # different port
 *   bun scripts/verify/sb-snapshot-all.ts --shard 0/3    # run only the
 *                                                        # first third
 *                                                        # (CI sharding; N
 *                                                        # is 0-indexed)
 *   bun scripts/verify/sb-snapshot-all.ts --id shared-controls-button--default
 *                                                        # single story
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, chromium, type Page } from "playwright";

type Args = {
	skipBuild: boolean;
	port: number;
	shard: { index: number; count: number } | null;
	singleId: string | null;
	timeoutMs: number;
};

const parseArgs = (argv: readonly string[]): Args => {
	const out: Args = {
		skipBuild: false,
		port: 6007,
		shard: null,
		singleId: null,
		timeoutMs: 15_000,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === "--skip-build") out.skipBuild = true;
		else if (a === "--port") {
			const next = argv[i + 1];
			if (!next) throw new Error("--port requires a value");
			const n = Number.parseInt(next, 10);
			if (!Number.isFinite(n))
				throw new Error(`--port must be numeric: ${next}`);
			out.port = n;
			i += 1;
		} else if (a === "--shard") {
			const next = argv[i + 1];
			if (!next) throw new Error("--shard requires <index>/<count>");
			const [idxStr, countStr] = next.split("/");
			const idx = Number.parseInt(idxStr ?? "", 10);
			const count = Number.parseInt(countStr ?? "", 10);
			if (!Number.isFinite(idx) || !Number.isFinite(count) || count <= 0) {
				throw new Error(`--shard must be <index>/<count>: ${next}`);
			}
			out.shard = { index: idx, count };
			i += 1;
		} else if (a === "--id") {
			const next = argv[i + 1];
			if (!next) throw new Error("--id requires a story id");
			out.singleId = next;
			i += 1;
		} else if (a === "--timeout-ms") {
			const next = argv[i + 1];
			if (!next) throw new Error("--timeout-ms requires a value");
			const n = Number.parseInt(next, 10);
			if (!Number.isFinite(n))
				throw new Error(`--timeout-ms must be numeric: ${next}`);
			out.timeoutMs = n;
			i += 1;
		} else {
			throw new Error(`unknown arg: ${a}`);
		}
	}
	return out;
};

const projectRoot = resolve(import.meta.dirname, "..", "..");
const staticDir = join(projectRoot, "storybook-static");
const indexJsonPath = join(staticDir, "index.json");
const outDir = join(projectRoot, ".tmp", "storybook-screenshots");

const log = (msg: string): void => {
	console.log(`[sb-snapshot] ${msg}`);
};

const runBuild = (): void => {
	log("building storybook-static (bunx storybook build)...");
	const result = spawnSync("bunx", ["storybook", "build"], {
		cwd: projectRoot,
		stdio: "inherit",
		env: process.env,
	});
	if (result.status !== 0) {
		throw new Error(`storybook build exited with status ${result.status}`);
	}
};

const startStaticServer = (port: number): ReturnType<typeof spawn> => {
	log(`starting python http.server on :${port} (serving storybook-static)`);
	const proc = spawn(
		"python3",
		["-m", "http.server", String(port), "--directory", staticDir],
		{
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		},
	);
	proc.stdout?.on("data", () => {
		/* swallow */
	});
	proc.stderr?.on("data", (chunk) => {
		const text = chunk.toString();
		if (!text.includes("Serving HTTP")) {
			process.stderr.write(`[http.server] ${text}`);
		}
	});
	return proc;
};

const probeServer = async (port: number): Promise<void> => {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://localhost:${port}/index.json`);
			if (res.ok) return;
		} catch {
			/* retry */
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`http.server on :${port} did not become reachable`);
};

type CaptureOutcome =
	| { id: string; status: "ok"; bytes: number; ms: number }
	| { id: string; status: "failed"; reason: string; ms: number }
	| { id: string; status: "empty"; reason: string; ms: number };

/**
 * Wait for Storybook's preview to be initialized and the currentRender
 * to be ready (so canvasElement and renderToScreen are available). Then
 * manually invoke `renderToScreen` with the unboundStoryFn extracted from
 * the CSF module, bypassing the broken headless auto-render flow.
 *
 * Why manual renderToScreen (not addon channel events):
 *   Storybook 10's headless preview reports `currentRender.phase ===
 *   "finished"` and emits `storyRendered` on the channel, but `#storybook-root`
 *   stays empty — the React mount step never fires. We confirmed by hand
 *   that calling `currentRender.renderToScreen({storyContext, unboundStoryFn,
 *   showMain, showException, forceRemount: true}, canvasElement)` does mount
 *   React correctly. See docs/architecture/ui-reconstruction/storybook.md
 *   §"Verification status" for the full diagnostic trail.
 *
 * Returns the rendered root innerHTML length and preview, or a `{error}`
 * object describing the failure.
 */
const renderStoryManually = async (
	page: Page,
	id: string,
	timeoutMs: number,
): Promise<
	| { ok: true; rootBytes: number; rootPreview: string }
	| { ok: false; error: string; stage: string }
> => {
	const result = await page.evaluate(
		async (args: { storyId: string; ms: number }) => {
			const deadline = Date.now() + args.ms;
			const storyId = args.storyId;
			const w = window as unknown as {
				__STORYBOOK_PREVIEW__?: {
					currentRender?: {
						canvasElement?: HTMLElement;
						renderToScreen?: (
							args: unknown,
							el: HTMLElement,
						) => Promise<unknown>;
					};
					storyStoreValue?: {
						importFn?: (path: string) => Promise<unknown>;
						storyIndex?: {
							entries?: Record<
								string,
								{
									id?: string;
									importPath: string;
									exportName?: string;
									name: string;
									title: string;
								}
							>;
						};
					};
				};
			};
			const sleep = (t: number): Promise<void> =>
				new Promise((r) => setTimeout(r, t));

			// Stage 1: preview must exist
			while (!w.__STORYBOOK_PREVIEW__) {
				if (Date.now() > deadline) {
					return {
						ok: false,
						error: "no __STORYBOOK_PREVIEW__",
						stage: "init",
					};
				}
				await sleep(50);
			}
			const preview = w.__STORYBOOK_PREVIEW__;
			const store = preview.storyStoreValue;
			if (!store?.importFn || !store.storyIndex?.entries) {
				return {
					ok: false,
					error: "no storyStoreValue/importFn/storyIndex",
					stage: "init",
				};
			}

			// Stage 2: entry must be present
			const entry = store.storyIndex.entries[storyId];
			if (!entry) {
				return {
					ok: false,
					error: `no entry for ${storyId} in storyIndex`,
					stage: "index",
				};
			}

			// Stage 3: importFn + extract unboundStoryFn.
			// Race importFn against the deadline — some CSF modules load
			// Monaco / WASM chains that can hang in headless.
			const csfModule = (await Promise.race([
				store.importFn(entry.importPath),
				new Promise<undefined>((_, rej) =>
					setTimeout(
						() => rej(new Error(`importFn timeout ${args.ms}ms`)),
						args.ms,
					),
				),
			])) as Record<string, unknown> | undefined;
			if (!csfModule) {
				return {
					ok: false,
					error: `importFn returned undefined for ${entry.importPath}`,
					stage: "import",
				};
			}
			const exportName = entry.exportName ?? entry.name;
			const named = csfModule[exportName] as
				| { render?: (...a: unknown[]) => unknown }
				| undefined;
			const meta = csfModule.default as
				| {
						component?: unknown;
						render?: (...a: unknown[]) => unknown;
				  }
				| undefined;
			const unboundStoryFn =
				(typeof named?.render === "function" ? named.render : null) ??
				(typeof meta?.component === "function" ? meta.component : null) ??
				(typeof meta?.render === "function" ? meta.render : null);
			if (typeof unboundStoryFn !== "function") {
				return {
					ok: false,
					error: `no renderable unboundStoryFn in ${entry.importPath} (module keys: ${Object.keys(csfModule).join(", ")})`,
					stage: "extract",
				};
			}

			// Stage 4: currentRender + canvasElement + renderToScreen.
			// Poll until currentRender is populated AND its canvasElement is a
			// real, attached HTMLElement (Storybook may briefly expose a
			// canvasElement that is detached, which causes React error #299
			// "Target container is not a DOM element").
			let cr = preview.currentRender as
				| {
						canvasElement?: HTMLElement;
						renderToScreen?: (
							args: unknown,
							el: HTMLElement,
						) => Promise<unknown>;
				  }
				| undefined;
			const isAttachedCanvas = (el: unknown): el is HTMLElement =>
				el instanceof HTMLElement && document.body.contains(el);
			while (!cr?.renderToScreen || !isAttachedCanvas(cr.canvasElement)) {
				if (Date.now() > deadline) {
					return {
						ok: false,
						error:
							"no currentRender.renderToScreen / attached canvasElement after init",
						stage: "renderRef",
					};
				}
				cr = preview.currentRender as typeof cr;
				if (!cr?.renderToScreen || !isAttachedCanvas(cr.canvasElement)) {
					await sleep(50);
				}
			}
			const canvas = cr.canvasElement as HTMLElement;
			const rts = cr.renderToScreen;

			const storyContext = {
				id: storyId,
				name: entry.name,
				title: entry.title,
				parameters: {},
				args: {},
				argTypes: {},
				initialArgs: {},
				globals: {},
			};
			const showMain = (): void => {};
			const showException = (err: unknown): void => {
				console.error("[showException]", err);
			};

			try {
				// Race the manual renderToScreen against the deadline so that
				// any single story that hangs inside the page never stalls the
				// whole pipeline.
				const renderResult = (await Promise.race([
					rts(
						{
							storyContext,
							unboundStoryFn,
							showMain,
							showException,
							forceRemount: true,
						},
						canvas,
					),
					new Promise<never>((_, rej) =>
						setTimeout(
							() => rej(new Error(`renderToScreen timeout ${args.ms}ms`)),
							args.ms,
						),
					),
				])) as unknown;
				void renderResult;
				await sleep(200);
				const root = document.getElementById("storybook-root");
				return {
					ok: true as const,
					rootBytes: root?.innerHTML.length ?? -1,
					rootPreview: root?.innerHTML.slice(0, 400) ?? "",
				};
			} catch (e) {
				return {
					ok: false as const,
					error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
					stage: "render",
				};
			}
		},
		{ storyId: id, ms: timeoutMs },
	);
	return result;
};

const captureOne = async (
	page: Page,
	id: string,
	port: number,
	timeoutMs: number,
): Promise<CaptureOutcome> => {
	const url = `http://localhost:${port}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`;
	const t0 = Date.now();
	try {
		await page.goto(url, {
			waitUntil: "domcontentloaded",
			timeout: 10_000,
		});
		// Wait for stylesheets to finish loading (PandaCSS layers).
		await page
			.waitForFunction(() => Array.from(document.styleSheets).length > 0, {
				timeout: 10_000,
			})
			.catch(() => {
				/* CSS may be in <style> tags only; continue */
			});
		await page
			.waitForFunction(
				() => document.fonts.ready.then(() => true).catch(() => true),
				{
					timeout: 5_000,
				},
			)
			.catch(() => {
				/* fonts may not be configured; continue */
			});

		// Wait for the preview's natural auto-render: #storybook-root must
		// exist and have mounted content with phase "finished". The earlier
		// manual `renderToScreen` path passed an empty `args: {}` story
		// context, which dropped every story's args and produced blank
		// screenshots; headless auto-render works, so use it directly.
		await page.waitForFunction(
			() =>
				window.__STORYBOOK_PREVIEW__?.currentRender?.phase === "finished" &&
				(document.getElementById("storybook-root")?.childElementCount ?? 0) > 0,
			{ timeout: timeoutMs },
		);
		// Give React + decorators a beat for layout effects.
		await page.waitForTimeout(300);
		const innerLen = await page.evaluate(
			() => document.getElementById("storybook-root")?.innerHTML.length ?? -1,
		);
		const target = join(outDir, `${id}.png`);
		await page.screenshot({ path: target, fullPage: true });
		const stat = existsSync(target);
		if (innerLen <= 0) {
			return {
				id,
				status: "empty",
				reason: `#storybook-root empty after manual render`,
				ms: Date.now() - t0,
			};
		}
		return {
			id,
			status: "ok",
			bytes: stat ? readFileSync(target).byteLength : 0,
			ms: Date.now() - t0,
		};
	} catch (err) {
		return {
			id,
			status: "failed",
			reason:
				err instanceof Error ? `${err.name}: ${err.message}` : String(err),
			ms: Date.now() - t0,
		};
	}
};

const captureAll = async (
	browser: Browser,
	ids: readonly string[],
	port: number,
	timeoutMs: number,
): Promise<CaptureOutcome[]> => {
	const out: CaptureOutcome[] = [];
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
	});
	const page = await context.newPage();
	// Hard page-level timeout: any evaluate() that doesn't resolve within
	// (timeoutMs + 5s) gets aborted by playwright, so a single hung story
	// cannot stall the entire sweep.
	page.setDefaultTimeout(timeoutMs + 5_000);
	for (let i = 0; i < ids.length; i += 1) {
		const id = ids[i]!;
		const result = await captureOne(page, id, port, timeoutMs);
		out.push(result);
		const stamp = new Date().toISOString().slice(11, 19);
		const statusLabel = result.status.toUpperCase().padEnd(7);
		log(
			`[${i + 1}/${ids.length}] ${stamp} ${statusLabel} ${id} (${result.ms}ms)` +
				(result.status === "ok" ? "" : ` — ${result.reason}`),
		);
	}
	await context.close();
	return out;
};

type IndexEntry = {
	id: string;
	title: string;
	name: string;
	tags?: readonly string[];
};

const buildGallery = (outcomes: readonly CaptureOutcome[]): void => {
	if (!existsSync(indexJsonPath)) {
		log("no index.json found; skipping gallery generation");
		return;
	}
	const raw = JSON.parse(readFileSync(indexJsonPath, "utf8")) as {
		entries: Record<string, IndexEntry>;
	};
	const entries = Object.values(raw.entries);
	const outcomeById = new Map(outcomes.map((o) => [o.id, o]));
	const statusOf = (id: string): "ok" | "empty" | "failed" | "skipped" => {
		const o = outcomeById.get(id);
		if (!o) return "skipped";
		return o.status;
	};

	const groups = new Map<string, IndexEntry[]>();
	for (const e of entries) {
		const list = groups.get(e.title) ?? [];
		list.push(e);
		groups.set(e.title, list);
	}
	const sortedTitles = [...groups.keys()].sort();

	const escapeHtml = (s: string): string =>
		s.replace(/[&<>"']/g, (c) => {
			switch (c) {
				case "&":
					return "&amp;";
				case "<":
					return "&lt;";
				case ">":
					return "&gt;";
				case '"':
					return "&quot;";
				default:
					return "&#39;";
			}
		});

	const counts = { ok: 0, empty: 0, failed: 0, skipped: 0 };
	for (const o of outcomes) counts[o.status] += 1;
	const totalTried = outcomes.length;
	const totalPresent = counts.ok;

	const sectionsHtml = sortedTitles
		.map((title) => {
			const items = groups
				.get(title)!
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((e) => {
					const status = statusOf(e.id);
					const isPresent = status === "ok";
					return `<li class="${status}">
  <a href="./${e.id}.png" target="_blank" rel="noopener">
    <img src="./${e.id}.png" alt="${escapeHtml(e.title)} / ${escapeHtml(e.name)}" loading="lazy">
  </a>
  <div class="meta">
    <code>${escapeHtml(e.id)}</code>
    <span class="name">${escapeHtml(e.name)}</span>
    <span class="status">${status}</span>
  </div>
</li>`;
				})
				.join("\n");
			return `<section>
  <h2>${escapeHtml(title)} <span class="count">(${groups.get(title)!.length})</span></h2>
  <ul>${items}</ul>
</section>`;
		})
		.join("\n");

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Storybook snapshots — ${totalPresent}/${entries.length} ok</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #1f1f1f; color: #e8e8e8; margin: 0; padding: 24px; }
  header { position: sticky; top: 0; background: #1f1f1f; padding-bottom: 12px; border-bottom: 1px solid #333; margin-bottom: 24px; z-index: 10; }
  h1 { margin: 0 0 4px 0; font-size: 20px; }
  .summary { color: #aaa; font-size: 14px; }
  .summary .ok { color: #8ecf8e; }
  .summary .empty { color: #f7c97d; }
  .summary .failed { color: #f78c8c; }
  section { margin-bottom: 32px; }
  h2 { font-size: 16px; margin: 0 0 12px 0; color: #b8b8b8; border-left: 3px solid #4a90e2; padding-left: 8px; }
  h2 .count { color: #777; font-weight: normal; font-size: 12px; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  li { background: #2a2a2a; border-radius: 6px; overflow: hidden; border: 1px solid #333; }
  li.failed, li.empty, li.skipped { opacity: 0.5; }
  li img { width: 100%; display: block; background: #111; aspect-ratio: 16 / 10; object-fit: contain; }
  .meta { padding: 8px 10px; font-size: 12px; }
  .meta code { display: block; color: #888; font-family: ui-monospace, monospace; font-size: 11px; margin-bottom: 4px; word-break: break-all; }
  .meta .name { color: #ccc; }
  .meta .status { display: inline-block; margin-left: 8px; padding: 1px 6px; border-radius: 3px; font-size: 10px; text-transform: uppercase; }
  li.ok .meta .status { background: #2d5a2d; color: #b8e6b8; }
  li.empty .meta .status { background: #5a4a2d; color: #f7d8a6; }
  li.failed .meta .status { background: #5a2d2d; color: #f7a6a6; }
  li.skipped .meta .status { background: #444; color: #bbb; }
</style>
</head>
<body>
<header>
  <h1>Storybook snapshots</h1>
  <div class="summary">${totalPresent} of ${totalPresent + counts.empty + counts.failed} attempted · ${entries.length} total stories${counts.skipped > 0 ? ` · ${counts.skipped} skipped (this shard)` : ""} · generated by scripts/verify/sb-snapshot-all.ts</div>
</header>
<main>
${sectionsHtml}
</main>
</body>
</html>
`;
	writeFileSync(join(outDir, "index.html"), html);
	log(`gallery written: ${join(outDir, "index.html")}`);
	log(
		`summary: ${counts.ok} ok · ${counts.empty} empty · ${counts.failed} failed · ${counts.skipped} skipped`,
	);
};

const main = async (): Promise<void> => {
	const args = parseArgs(process.argv.slice(2));
	mkdirSync(outDir, { recursive: true });

	if (!args.skipBuild) {
		if (existsSync(staticDir) && existsSync(indexJsonPath)) {
			log(`storybook-static/ exists (use --skip-build to skip build)`);
		} else {
			runBuild();
		}
	} else {
		if (!existsSync(indexJsonPath)) {
			throw new Error(
				`--skip-build passed but ${indexJsonPath} does not exist; run without --skip-build first`,
			);
		}
		log("skipping build (using existing storybook-static)");
	}

	const raw = JSON.parse(readFileSync(indexJsonPath, "utf8")) as {
		entries: Record<string, IndexEntry>;
	};
	const allIds = Object.keys(raw.entries);
	let ids = allIds;
	if (args.singleId) {
		if (!allIds.includes(args.singleId)) {
			throw new Error(
				`--id ${args.singleId} not in index.json (have ${allIds.length} entries)`,
			);
		}
		ids = [args.singleId];
	} else if (args.shard) {
		const start = Math.floor(
			(allIds.length * args.shard.index) / args.shard.count,
		);
		const end = Math.floor(
			(allIds.length * (args.shard.index + 1)) / args.shard.count,
		);
		ids = allIds.slice(start, end);
		log(
			`shard ${args.shard.index + 1}/${args.shard.count} → ${ids.length} stories (indexes ${start}..${end - 1})`,
		);
	}
	log(`will capture ${ids.length} stories`);

	const server = startStaticServer(args.port);
	const cleanup = (): void => {
		if (!server.killed) {
			server.kill("SIGTERM");
		}
	};
	process.on("SIGINT", () => {
		cleanup();
		process.exit(130);
	});
	process.on("SIGTERM", () => {
		cleanup();
		process.exit(143);
	});

	const chromePath =
		process.env.CHROME_PATH ??
		`${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
	const browser = await chromium.launch({
		executablePath: chromePath,
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-dev-shm-usage",
			"--disable-gpu",
			"--disable-setuid-sandbox",
		],
	});

	let outcomes: CaptureOutcome[];
	try {
		await probeServer(args.port);
		outcomes = await captureAll(browser, ids, args.port, args.timeoutMs);
	} finally {
		await browser.close();
		cleanup();
	}

	buildGallery(outcomes);

	const failures = outcomes.filter((o) => o.status !== "ok");
	if (failures.length > 0) {
		log(
			`${failures.length}/${outcomes.length} stories did not produce a usable PNG (gallery still written)`,
		);
		process.exit(1);
	}
};

main().catch((err) => {
	console.error("[sb-snapshot] failed:", err);
	process.exit(2);
});
