/**
 * Merge the per-story capture sidecars written by
 * `scripts/verify/storybook/screenshot-capture.ts` into one coverage
 * report and diff it against `storybook-static/index.json`.
 *
 * This is the machine-checkable half of capture requirement 1
 * (docs/architecture/ui-reconstruction/storybook.md): every entry in
 * `index.json` must produce a sidecar, and every sidecar must classify
 * into exactly one bucket. It is also the CI-facing summary for
 * requirements 7–9: render failures, capture failures and missing
 * captures stay distinguishable, and shard splits are safe because
 * sidecar filenames derive only from `storyId`.
 *
 * Usage:
 *
 *   bun scripts/verify/storybook/capture-merge.ts \
 *     [--captures-dir=.tmp/storybook-captures] \
 *     [--index=storybook-static/index.json] \
 *     [--out=.tmp/storybook-captures/report.json] \
 *     [--warn]
 *
 * Exit code is 1 when any story is not `ok` (missing-metadata,
 * capture-error, render-failed, missing-png, invalid-metadata) unless
 * `--warn` is passed. `render-failed` entries normally coincide with an
 * already-red Vitest shard; `capture-error`/`missing-*` entries are the
 * ones only this report can catch.
 *
 * When `storybook-static/index.json` does not exist (e.g. a local run
 * that never built Storybook), coverage is computed against the union
 * of captured storyIds and the report says so — a missing index means
 * "cannot prove full coverage", not "coverage proven".
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
	isCaptureMetadata,
	type StorybookCaptureMetadata,
} from "./capture-metadata";

export type CoverageStatus =
	| "ok"
	| "render-failed"
	| "capture-error"
	| "missing-metadata"
	| "missing-png"
	| "invalid-metadata";

export type CoverageEntry = {
	storyId: string;
	title: string;
	name: string;
	status: CoverageStatus;
	/** False when the sidecar exists but `index.json` does not list it. */
	inIndex: boolean;
	pngPath: string | null;
	byteLength: number | null;
	renderMs: number | null;
	consoleErrorCount: number;
	pageErrorCount: number;
	capturedAt: string | null;
	/** Human-readable reason for non-ok buckets. */
	detail?: string;
};

export type CaptureReport = {
	generatedAt: string;
	/** False when no index.json was available for the coverage diff. */
	indexAvailable: boolean;
	totals: Record<CoverageStatus, number> & { total: number };
	entries: CoverageEntry[];
};

const EMPTY_TOTALS = (): CaptureReport["totals"] => ({
	ok: 0,
	"render-failed": 0,
	"capture-error": 0,
	"missing-metadata": 0,
	"missing-png": 0,
	"invalid-metadata": 0,
	total: 0,
});

type IndexEntry = { id: string; title?: string; name?: string };

export type LoadedCaptures = {
	metas: StorybookCaptureMetadata[];
	/** Files that did not parse/validate, keyed by file name. */
	invalid: { file: string; storyId: string; error: string }[];
};

/**
 * Reads every `*.json` sidecar in `dir`. File names are sorted before
 * parsing so duplicate-storyId resolution is deterministic (first file
 * in sorted order wins and the duplicate is reported as invalid).
 */
export const loadCaptures = (dir: string): LoadedCaptures => {
	const metas: StorybookCaptureMetadata[] = [];
	const invalid: LoadedCaptures["invalid"] = [];
	if (!existsSync(dir)) return { metas, invalid };

	const seen = new Set<string>();
	for (const file of readdirSync(dir).sort()) {
		if (!file.endsWith(".json") || file === "report.json") continue;
		const filePath = join(dir, file);
		const storyId = basename(file, ".json");
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(filePath, "utf8"));
		} catch (error) {
			invalid.push({
				file,
				storyId,
				error: error instanceof Error ? error.message : String(error),
			});
			continue;
		}
		if (!isCaptureMetadata(parsed)) {
			invalid.push({ file, storyId, error: "schema mismatch" });
			continue;
		}
		if (seen.has(parsed.storyId)) {
			invalid.push({
				file,
				storyId: parsed.storyId,
				error: "duplicate storyId across sidecars",
			});
			continue;
		}
		seen.add(parsed.storyId);
		metas.push(parsed);
	}
	return { metas, invalid };
};

/** Reads `index.json` entries; returns null when the file is absent. */
export const loadIndex = (
	indexPath: string,
): Map<string, IndexEntry> | null => {
	if (!existsSync(indexPath)) return null;
	const raw = JSON.parse(readFileSync(indexPath, "utf8")) as {
		entries?: Record<string, IndexEntry>;
	};
	const map = new Map<string, IndexEntry>();
	for (const entry of Object.values(raw.entries ?? {})) {
		if (entry && typeof entry.id === "string") map.set(entry.id, entry);
	}
	return map;
};

export type BuildReportOptions = {
	indexEntries?: ReadonlyMap<string, IndexEntry> | null;
	/** Predicate for "does the PNG referenced by pngPath exist". */
	pngExists?: (pngPath: string) => boolean;
	now?: () => Date;
};

const toEntry = (
	storyId: string,
	title: string,
	name: string,
	status: CoverageStatus,
	extra: Partial<CoverageEntry> = {},
): CoverageEntry => ({
	storyId,
	title,
	name,
	status,
	inIndex: extra.inIndex ?? true,
	pngPath: extra.pngPath ?? null,
	byteLength: extra.byteLength ?? null,
	renderMs: extra.renderMs ?? null,
	consoleErrorCount: extra.consoleErrorCount ?? 0,
	pageErrorCount: extra.pageErrorCount ?? 0,
	capturedAt: extra.capturedAt ?? null,
	...(extra.detail !== undefined ? { detail: extra.detail } : {}),
});

/**
 * Pure classification core — separated from fs access so unit tests can
 * drive it with in-memory fixtures.
 */
export const buildCoverageReport = (
	metas: readonly StorybookCaptureMetadata[],
	invalid: LoadedCaptures["invalid"],
	options: BuildReportOptions = {},
): CaptureReport => {
	const indexEntries = options.indexEntries ?? null;
	const inIndex = (id: string): boolean =>
		indexEntries === null || indexEntries.has(id);
	const indexTitleName = (id: string): { title: string; name: string } => {
		const entry = indexEntries?.get(id);
		return { title: entry?.title ?? "", name: entry?.name ?? "" };
	};

	const metaById = new Map(metas.map((m) => [m.storyId, m]));
	const invalidById = new Map<string, LoadedCaptures["invalid"][number]>();
	for (const bad of invalid) {
		if (!invalidById.has(bad.storyId)) invalidById.set(bad.storyId, bad);
	}
	// The coverage universe is the union of index.json ids, captured
	// storyIds and invalid-file stems: index ids without sidecars become
	// `missing-metadata`, sidecars absent from index.json are kept and
	// flagged `inIndex: false`, and invalid files become
	// `invalid-metadata`. Without index.json the universe degrades to the
	// captured ids only — coverage against the full story list cannot be
	// proven, which the report states via `indexAvailable: false`.
	const expectedIds = new Set<string>([
		...(indexEntries?.keys() ?? []),
		...metaById.keys(),
		...invalidById.keys(),
	]);

	const entries: CoverageEntry[] = [];

	for (const storyId of [...expectedIds].sort()) {
		const meta = metaById.get(storyId);
		const bad = invalidById.get(storyId);
		const idx = indexTitleName(storyId);
		if (!meta) {
			entries.push(
				toEntry(
					storyId,
					idx.title,
					idx.name,
					bad ? "invalid-metadata" : "missing-metadata",
					{
						inIndex: inIndex(storyId),
						detail: bad
							? `${bad.file}: ${bad.error}`
							: "no capture sidecar found for this story",
					},
				),
			);
			continue;
		}
		const base = {
			inIndex: inIndex(storyId),
			pngPath: meta.pngPath,
			byteLength: meta.byteLength,
			renderMs: meta.renderMs,
			consoleErrorCount: meta.consoleErrors.length,
			pageErrorCount: meta.pageErrors.length,
			capturedAt: meta.capturedAt,
		};
		if (meta.status === "render-failed" || meta.status === "capture-error") {
			entries.push(
				toEntry(
					storyId,
					meta.title || idx.title,
					meta.name || idx.name,
					meta.status,
					{
						...base,
						detail:
							meta.status === "render-failed"
								? "story test failed; PNG (if any) is a post-mortem capture"
								: (meta.captureError ?? "page.screenshot() failed"),
					},
				),
			);
			continue;
		}
		// status === "ok" in the sidecar — verify the PNG is actually there.
		if (meta.pngPath === null) {
			entries.push(
				toEntry(
					storyId,
					meta.title || idx.title,
					meta.name || idx.name,
					"missing-png",
					{
						...base,
						detail: "sidecar claims ok but pngPath is null",
					},
				),
			);
			continue;
		}
		if (options.pngExists && !options.pngExists(meta.pngPath)) {
			entries.push(
				toEntry(
					storyId,
					meta.title || idx.title,
					meta.name || idx.name,
					"missing-png",
					{
						...base,
						detail: `PNG not found on disk: ${meta.pngPath}`,
					},
				),
			);
			continue;
		}
		entries.push(
			toEntry(
				storyId,
				meta.title || idx.title,
				meta.name || idx.name,
				"ok",
				base,
			),
		);
	}

	// A valid sidecar wins over an invalid file with the same storyId
	// (duplicate-stem collisions are already reported by `loadCaptures`).

	entries.sort((a, b) => a.storyId.localeCompare(b.storyId));

	const totals = EMPTY_TOTALS();
	for (const entry of entries) {
		totals[entry.status] += 1;
	}
	totals.total = entries.length;

	return {
		generatedAt: (options.now ?? (() => new Date()))().toISOString(),
		indexAvailable: indexEntries !== null,
		totals,
		entries,
	};
};

const parseArgs = (argv: readonly string[]) => {
	const args = {
		capturesDir: ".tmp/storybook-captures",
		indexPath: "storybook-static/index.json",
		outPath: "",
		warn: false,
	};
	for (const arg of argv) {
		if (arg === "--warn") args.warn = true;
		else if (arg.startsWith("--captures-dir="))
			args.capturesDir = arg.slice("--captures-dir=".length);
		else if (arg.startsWith("--index="))
			args.indexPath = arg.slice("--index=".length);
		else if (arg.startsWith("--out="))
			args.outPath = arg.slice("--out=".length);
		else throw new Error(`unknown argument: ${arg}`);
	}
	if (!args.outPath) {
		args.outPath = join(args.capturesDir, "report.json");
	}
	return args;
};

const main = (): void => {
	const args = parseArgs(process.argv.slice(2));
	const projectRoot = resolve(import.meta.dirname, "..", "..");
	const capturesDir = resolve(projectRoot, args.capturesDir);
	const indexPath = resolve(projectRoot, args.indexPath);
	const outPath = resolve(projectRoot, args.outPath);

	const indexEntries = loadIndex(indexPath);
	const { metas, invalid } = loadCaptures(capturesDir);
	const report = buildCoverageReport(metas, invalid, {
		indexEntries,
		pngExists: (pngPath) => existsSync(resolve(projectRoot, pngPath)),
	});

	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

	const t = report.totals;
	const summary =
		`[capture-merge] ${t.ok}/${t.total} ok` +
		(t["render-failed"] ? `, ${t["render-failed"]} render-failed` : "") +
		(t["capture-error"] ? `, ${t["capture-error"]} capture-error` : "") +
		(t["missing-metadata"]
			? `, ${t["missing-metadata"]} missing-metadata`
			: "") +
		(t["missing-png"] ? `, ${t["missing-png"]} missing-png` : "") +
		(t["invalid-metadata"]
			? `, ${t["invalid-metadata"]} invalid-metadata`
			: "");
	// eslint-disable-next-line no-console
	console.log(
		`${summary} — report: ${outPath}` +
			(report.indexAvailable
				? ""
				: " (WARNING: index.json absent — coverage is against captured ids only)"),
	);
	for (const bad of report.entries.filter((e) => e.status !== "ok")) {
		// eslint-disable-next-line no-console
		console.log(
			`[capture-merge] ${bad.status} ${bad.storyId} — ${bad.detail ?? ""}`,
		);
	}

	const nonOk =
		t["render-failed"] +
		t["capture-error"] +
		t["missing-metadata"] +
		t["missing-png"] +
		t["invalid-metadata"];
	if (nonOk > 0 && !args.warn) {
		process.exitCode = 1;
	}
};

// Only run when executed directly (`bun scripts/verify/...`), not when
// imported by the unit test.
if (import.meta.main) {
	main();
}
