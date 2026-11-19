/**
 * Build an HTML gallery from the Storybook capture sidecars in
 * `.tmp/storybook-captures/` — the successor to
 * `sb-snapshot-gallery.ts` for the official capture path.
 *
 * Requirement 10 of docs/architecture/ui-reconstruction/storybook.md:
 * status comes from the per-story metadata (`status`, `consoleErrors`,
 * `pageErrors`), never from PNG byte-size heuristics. The legacy
 * `sb-snapshot-gallery.ts` stays for the `sb-snapshot-all.ts`
 * diagnostic pipeline, which has no metadata at all.
 *
 * Usage:
 *
 *   bun scripts/verify/storybook/capture-gallery.ts \
 *     [--captures-dir=.tmp/storybook-captures] \
 *     [--index=storybook-static/index.json]
 *
 * Writes `<captures-dir>/index.html`. PNGs are referenced relative to
 * that directory (they live in `.tmp/vitest-screenshots/`), so serve
 * `.tmp/` (e.g. `python3 -m http.server --directory .tmp`) to browse.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
	buildCoverageReport,
	type CoverageStatus,
	loadCaptures,
	loadIndex,
} from "./capture-merge";
import type { StorybookCaptureMetadata } from "./capture-metadata";

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

const STATUS_LABEL: Record<CoverageStatus, string> = {
	ok: "captured",
	"render-failed": "render failed",
	"capture-error": "capture error",
	"missing-metadata": "missing",
	"missing-png": "missing png",
	"invalid-metadata": "invalid",
};

const parseArgs = (argv: readonly string[]) => {
	const args = {
		capturesDir: ".tmp/storybook-captures",
		indexPath: "storybook-static/index.json",
	};
	for (const arg of argv) {
		if (arg.startsWith("--captures-dir=")) {
			args.capturesDir = arg.slice("--captures-dir=".length);
		} else if (arg.startsWith("--index=")) {
			args.indexPath = arg.slice("--index=".length);
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}
	return args;
};

const main = (): void => {
	const args = parseArgs(process.argv.slice(2));
	const projectRoot = resolve(import.meta.dirname, "..", "..");
	const capturesDir = resolve(projectRoot, args.capturesDir);
	const indexPath = resolve(projectRoot, args.indexPath);

	if (!existsSync(capturesDir)) {
		// eslint-disable-next-line no-console
		console.log(
			`[sb-capture-gallery] no captures dir at ${capturesDir}; run the storybook project first`,
		);
		return;
	}

	const indexEntries = loadIndex(indexPath);
	const { metas, invalid } = loadCaptures(capturesDir);
	const metaById = new Map<string, StorybookCaptureMetadata>(
		metas.map((m) => [m.storyId, m]),
	);
	const report = buildCoverageReport(metas, invalid, {
		indexEntries,
		pngExists: (pngPath) => existsSync(resolve(projectRoot, pngPath)),
	});

	// Group by title for the gallery layout; entries are already sorted
	// by storyId, titles inherit index.json order where available.
	const groups = new Map<string, typeof report.entries>();
	for (const entry of report.entries) {
		const title = entry.title || "(untitled)";
		const list = groups.get(title) ?? [];
		list.push(entry);
		groups.set(title, list);
	}
	const sortedTitles = [...groups.keys()].sort((a, b) => a.localeCompare(b));

	const counts = { ...report.totals };
	const sectionsHtml = sortedTitles
		.map((title) => {
			const group = groups.get(title) ?? [];
			const items = group
				.map((e) => {
					const meta = metaById.get(e.storyId);
					const imgSrc =
						e.pngPath === null
							? null
							: `./${relative(capturesDir, resolve(projectRoot, e.pngPath)).split("\\").join("/")}`;
					const errorBits: string[] = [];
					if (meta) {
						if (meta.consoleErrors.length > 0) {
							errorBits.push(`${meta.consoleErrors.length} console.error`);
						}
						if (meta.pageErrors.length > 0) {
							errorBits.push(`${meta.pageErrors.length} pageerror`);
						}
					}
					const detail =
						e.status !== "ok"
							? escapeHtml(e.detail ?? "")
							: errorBits.length > 0
								? escapeHtml(errorBits.join(" · "))
								: "";
					const img =
						imgSrc === null
							? `<div class="noimg">no capture</div>`
							: `<a href="${escapeHtml(imgSrc)}" target="_blank" rel="noopener"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(e.storyId)}" loading="lazy"></a>`;
					return `<li class="${e.status}">
  ${img}
  <div class="meta">
    <code>${escapeHtml(e.storyId)}</code>
    <span class="name">${escapeHtml(e.name || e.storyId)}</span>
    <span class="status">${STATUS_LABEL[e.status]}</span>
    ${detail ? `<span class="detail">${detail}</span>` : ""}
  </div>
</li>`;
				})
				.join("\n");
			return `<section>
  <h2>${escapeHtml(title)} <span class="count">(${group.length})</span></h2>
  <ul>${items}</ul>
</section>`;
		})
		.join("\n");

	const statusSummary = (
		[
			["ok", counts.ok],
			["render-failed", counts["render-failed"]],
			["capture-error", counts["capture-error"]],
			["missing", counts["missing-metadata"] + counts["missing-png"]],
			["invalid", counts["invalid-metadata"]],
		] as const
	)
		.filter(([, n]) => n > 0)
		.map(([label, n]) => `<span class="${label}">${n} ${label}</span>`)
		.join(" · ");

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Storybook captures — ${counts.ok}/${counts.total} ok</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #1f1f1f; color: #e8e8e8; margin: 0; padding: 24px; }
  header { position: sticky; top: 0; background: #1f1f1f; padding-bottom: 12px; border-bottom: 1px solid #333; margin-bottom: 24px; z-index: 10; }
  h1 { margin: 0 0 4px 0; font-size: 20px; }
  .summary { color: #aaa; font-size: 14px; }
  .summary span { margin-right: 10px; }
  .summary .ok { color: #8ecf8e; }
  .summary .render-failed, .summary .capture-error, .summary .missing, .summary .invalid { color: #f7c97d; }
  section { margin-bottom: 32px; }
  h2 { font-size: 16px; margin: 0 0 12px 0; color: #b8b8b8; border-left: 3px solid #4a90e2; padding-left: 8px; }
  h2 .count { color: #777; font-weight: normal; font-size: 12px; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  li { background: #2a2a2a; border-radius: 6px; overflow: hidden; border: 1px solid #333; }
  li:not(.ok) { opacity: 0.75; }
  li img, li .noimg { width: 100%; display: block; background: #111; aspect-ratio: 16 / 9; object-fit: contain; }
  li .noimg { display: flex; align-items: center; justify-content: center; color: #666; font-size: 12px; }
  .meta { padding: 8px 10px; font-size: 12px; }
  .meta code { display: block; color: #888; font-family: ui-monospace, monospace; font-size: 11px; margin-bottom: 4px; word-break: break-all; }
  .meta .name { color: #ccc; }
  .meta .status { display: inline-block; margin-left: 8px; padding: 1px 6px; border-radius: 3px; font-size: 10px; text-transform: uppercase; }
  .meta .detail { display: block; margin-top: 4px; color: #f0a8a8; font-size: 11px; word-break: break-word; }
  li.ok .meta .status { background: #2d5a2d; color: #b8e6b8; }
  li.render-failed .meta .status { background: #5a3d2d; color: #f7d8a6; }
  li.capture-error .meta .status, li.invalid-metadata .meta .status { background: #5a2d2d; color: #f7a6a6; }
  li.missing-metadata .meta .status, li.missing-png .meta .status { background: #4a4a2d; color: #e6e0a8; }
</style>
</head>
<body>
<header>
  <h1>Storybook captures</h1>
  <div class="summary">${statusSummary} · of ${counts.total} entries · generated by scripts/verify/storybook/capture-gallery.ts${indexEntries === null ? " · index.json absent (coverage vs captured ids only)" : ""}</div>
</header>
<main>
${sectionsHtml}
</main>
</body>
</html>
`;

	const outPath = join(capturesDir, "index.html");
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, html);
	// eslint-disable-next-line no-console
	console.log(
		`[sb-capture-gallery] gallery written: ${outPath} — ${counts.ok}/${counts.total} ok`,
	);
};

if (import.meta.main) {
	main();
}
