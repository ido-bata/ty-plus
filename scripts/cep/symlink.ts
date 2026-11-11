import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { installCepDevBundle } from "./install-cep-dev";

const manifestPath = path.resolve("dist", "cep-dev", "CSXS", "manifest.xml");

if (!existsSync(manifestPath)) {
	console.log(
		"[ty-plus] dist/cep-dev に manifest がありません。`bun run build` を先に実行します。",
	);
	const r = spawnSync("bun", ["run", "build"], {
		cwd: process.cwd(),
		stdio: "inherit",
		shell: true,
	});
	if (r.status !== 0) {
		process.exit(r.status ?? 1);
	}
}

await installCepDevBundle();
