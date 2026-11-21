/**
 * Removes stale CEP output so incremental builds do not leave mixed layouts:
 * - legacy `management/...` tree from older shell paths
 * - previous `assets/` tree (Vite uses `emptyOutDir: false` on cep-dev)
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const cepDev = path.resolve("dist", "cep-dev");
const staleRelPaths = ["management", "assets"];

for (const rel of staleRelPaths) {
	const p = path.join(cepDev, rel);
	if (existsSync(p)) {
		rmSync(p, { recursive: true, force: true });
		console.log("[clean-cep-stale-dirs] removed", p);
	}
}
