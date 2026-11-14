import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { installCepDevBundle } from "./install-cep-dev";

const manifestPath = path.resolve("dist", "cep-dev", "CSXS", "manifest.xml");

if (!existsSync(manifestPath)) {
	console.log(
		"[ty-plus] dist/cep-dev に manifest がありません。`bun run build:cep:dev` を先に実行します。",
	);
	// Must build the *development* flavor: `bun run build` produces a
	// production manifest (ExtensionBundleId `app.ty-plus`, release debug
	// port) which must never be installed into the `app.ty-plus.dev` slot
	// (#86).
	const r = spawnSync("bun", ["run", "build:cep:dev"], {
		cwd: process.cwd(),
		stdio: "inherit",
		shell: true,
	});
	if (r.status !== 0) {
		process.exit(r.status ?? 1);
	}
}

await installCepDevBundle();
