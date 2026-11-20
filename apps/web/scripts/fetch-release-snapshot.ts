/**
 * Regenerates `src/server/releases.snapshot.json` from the live GitHub
 * Releases API. The snapshot is the fallback shown when the API is
 * unreachable or rate-limited at runtime.
 *
 * Run from the repo root: `bun run --filter @ty-plus/web snapshot:releases`
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGitHubReleases } from "../src/server/releases";

const outPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../src/server/releases.snapshot.json",
);

const releases = await fetchGitHubReleases();
const payload = {
	generatedAt: new Date().toISOString(),
	releases,
};
await writeFile(outPath, `${JSON.stringify(payload, null, "\t")}\n`);
console.log(`wrote ${releases.length} releases to ${outPath}`);
