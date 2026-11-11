/**
 * Build the Storybook snapshot gallery HTML from existing PNG files on disk
 * plus `storybook-static/index.json`. Does NOT capture new screenshots — use
 * `scripts/verify/sb-snapshot-all.ts` for that. Useful after sweeping across
 * multiple shards to produce a single merged gallery.
 *
 * Why this exists:
 *   `sb-snapshot-all.ts` only knows about stories it captured within a
 *   single run (one shard). When stories are captured across multiple
 *   shards or the user manually runs `--id` for select stories, the
 *   per-run gallery will mark the other stories as "skipped". This
 *   utility regenerates the gallery based on what's actually present on
 *   disk so the union of all captures shows in one place.
 *
 * Usage:
 *   bun scripts/verify/sb-snapshot-gallery.ts                # default dirs
 *   bun scripts/verify/sb-snapshot-gallery.ts --port 6007   # diff server
 */

import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

type IndexEntry = {
	id: string;
	title: string;
	name: string;
	tags?: readonly string[];
};

const projectRoot = resolve(import.meta.dirname, "..", "..");
const staticDir = join(projectRoot, "storybook-static");
const indexJsonPath = join(staticDir, "index.json");
const outDir = join(projectRoot, ".tmp", "storybook-screenshots");

const log = (msg: string): void => {
	console.log(`[sb-gallery] ${msg}`);
};

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

const buildGallery = (): void => {
	if (!existsSync(indexJsonPath)) {
		log("no index.json found; cannot build gallery");
		return;
	}
	const raw = JSON.parse(readFileSync(indexJsonPath, "utf8")) as {
		entries: Record<string, IndexEntry>;
	};
	const entries = Object.values(raw.entries);

	const existingPngs = new Set<string>(
		existsSync(outDir)
			? readdirSync(outDir)
					.filter((f) => f.endsWith(".png"))
					.map((f) => f.slice(0, -".png".length))
			: [],
	);

	const statusOf = (id: string): "ok" | "empty" | "missing" => {
		const target = join(outDir, `${id}.png`);
		if (!existsSync(target)) return "missing";
		const size = statSync(target).size;
		// Real component renders are 6-50KB. An empty `#storybook-root` after
		// the manual renderToScreen call still produces a ~5851-byte page
		// screenshot of the iframe chrome (no React content). Use 6500 as the
		// floor — anything smaller is "empty".
		if (size < 6500) return "empty";
		return "ok";
	};

	const groups = new Map<string, IndexEntry[]>();
	for (const e of entries) {
		const list = groups.get(e.title) ?? [];
		list.push(e);
		groups.set(e.title, list);
	}
	const sortedTitles = [...groups.keys()].sort();

	const counts = { ok: 0, empty: 0, missing: 0 };
	for (const e of entries) {
		const s = statusOf(e.id);
		if (s === "ok") counts.ok += 1;
		else if (s === "empty") counts.empty += 1;
		else counts.missing += 1;
	}

	const sectionsHtml = sortedTitles
		.map((title) => {
			const items = groups
				.get(title)!
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((e) => {
					const status = statusOf(e.id);
					const imgSrc = `./${e.id}.png`;
					const statusLabel =
						status === "ok"
							? "captured"
							: status === "empty"
								? "empty"
								: "missing";
					return `<li class="${status}">
  <a href="${imgSrc}" target="_blank" rel="noopener">
    <img src="${imgSrc}" alt="${escapeHtml(e.title)} / ${escapeHtml(e.name)}" loading="lazy">
  </a>
  <div class="meta">
    <code>${escapeHtml(e.id)}</code>
    <span class="name">${escapeHtml(e.name)}</span>
    <span class="status">${statusLabel}</span>
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
<title>Storybook snapshots — ${counts.ok} captured / ${entries.length} total</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #1f1f1f; color: #e8e8e8; margin: 0; padding: 24px; }
  header { position: sticky; top: 0; background: #1f1f1f; padding-bottom: 12px; border-bottom: 1px solid #333; margin-bottom: 24px; z-index: 10; }
  h1 { margin: 0 0 4px 0; font-size: 20px; }
  .summary { color: #aaa; font-size: 14px; }
  .summary .ok { color: #8ecf8e; }
  .summary .empty { color: #f7c97d; }
  .summary .missing { color: #f78c8c; }
  section { margin-bottom: 32px; }
  h2 { font-size: 16px; margin: 0 0 12px 0; color: #b8b8b8; border-left: 3px solid #4a90e2; padding-left: 8px; }
  h2 .count { color: #777; font-weight: normal; font-size: 12px; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  li { background: #2a2a2a; border-radius: 6px; overflow: hidden; border: 1px solid #333; }
  li.missing, li.empty { opacity: 0.4; }
  li img { width: 100%; display: block; background: #111; aspect-ratio: 16 / 10; object-fit: contain; }
  .meta { padding: 8px 10px; font-size: 12px; }
  .meta code { display: block; color: #888; font-family: ui-monospace, monospace; font-size: 11px; margin-bottom: 4px; word-break: break-all; }
  .meta .name { color: #ccc; }
  .meta .status { display: inline-block; margin-left: 8px; padding: 1px 6px; border-radius: 3px; font-size: 10px; text-transform: uppercase; }
  li.ok .meta .status { background: #2d5a2d; color: #b8e6b8; }
  li.empty .meta .status { background: #5a4a2d; color: #f7d8a6; }
  li.missing .meta .status { background: #5a2d2d; color: #f7a6a6; }
</style>
</head>
<body>
<header>
  <h1>Storybook snapshots</h1>
  <div class="summary">${counts.ok} captured · ${counts.empty} empty · ${counts.missing} missing · of ${entries.length} stories · ${existingPngs.size} PNGs on disk · generated by scripts/verify/sb-snapshot-gallery.ts</div>
</header>
<main>
${sectionsHtml}
</main>
</body>
</html>
`;
	writeFileSync(join(outDir, "index.html"), html);
	log(
		`gallery written: ${join(outDir, "index.html")} — ${counts.ok}/${entries.length} captured`,
	);
};

buildGallery();
