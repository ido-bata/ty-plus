import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const DIST_ROOT = path.resolve("dist", "cep-dev");
const PANEL_ENTRY_PATH = path.join(
	DIST_ROOT,
	"assets",
	"js",
	"panel.entry.cjs",
);
const DEFAULT_MAX_GZIP_BYTES = 600 * 1024;
const DEFAULT_CHUNK_WARN_GZIP_BYTES = 200 * 1024;

const toKiB = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

const readMaxBytes = (envName: string, fallback: number): number => {
	const raw = Bun.env[envName]?.trim();
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || parsed <= 0) return fallback;
	return parsed;
};

const collectCjsFiles = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectCjsFiles(full)));
			continue;
		}
		if (entry.isFile() && full.endsWith(".cjs")) {
			out.push(full);
		}
	}
	return out;
};

const main = async (): Promise<void> => {
	const maxBytes = readMaxBytes(
		"TY_PLUS_PANEL_GZIP_MAX_BYTES",
		DEFAULT_MAX_GZIP_BYTES,
	);
	const chunkWarnBytes = readMaxBytes(
		"TY_PLUS_CHUNK_GZIP_WARN_BYTES",
		DEFAULT_CHUNK_WARN_GZIP_BYTES,
	);

	let panelSource: Uint8Array;
	try {
		panelSource = await readFile(PANEL_ENTRY_PATH);
	} catch {
		console.error(
			`[check-bundle-size] Missing ${PANEL_ENTRY_PATH}. Run "bun run build" first.`,
		);
		process.exit(1);
		return;
	}

	const panelRawBytes = panelSource.byteLength;
	const panelGzipBytes = gzipSync(panelSource, { level: 9 }).byteLength;
	console.log(
		`[check-bundle-size] panel.entry.cjs raw=${toKiB(panelRawBytes)} gzip=${toKiB(panelGzipBytes)} max=${toKiB(maxBytes)}`,
	);

	let failed = false;
	if (panelGzipBytes > maxBytes) {
		console.error(
			`[check-bundle-size] FAILED: panel.entry.cjs gzip size ${panelGzipBytes} bytes exceeds max ${maxBytes} bytes.`,
		);
		failed = true;
	}

	// Per-chunk size scan: any chunk whose gzip exceeds the warn threshold
	// is flagged. This catches creeping chunk bloat even when the panel
	// entry stays under its cap.
	const cjsFiles = await collectCjsFiles(path.join(DIST_ROOT, "assets"));
	const sizes: Array<{ file: string; raw: number; gzip: number }> = [];
	for (const file of cjsFiles) {
		if (path.resolve(file) === path.resolve(PANEL_ENTRY_PATH)) continue;
		const buf = await readFile(file);
		sizes.push({
			file: path.relative(DIST_ROOT, file),
			raw: buf.byteLength,
			gzip: gzipSync(buf, { level: 9 }).byteLength,
		});
	}

	sizes.sort((a, b) => b.gzip - a.gzip);

	const oversized = sizes.filter((s) => s.gzip > chunkWarnBytes);
	if (oversized.length > 0) {
		console.log(
			`[check-bundle-size] chunks exceeding ${toKiB(chunkWarnBytes)} gzip:`,
		);
		for (const s of oversized) {
			console.log(`  - ${s.file} raw=${toKiB(s.raw)} gzip=${toKiB(s.gzip)}`);
		}
	}

	if (failed) process.exit(1);
};

await main();
