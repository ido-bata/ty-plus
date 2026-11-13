/** bolt-cep unlink: %s: remove unit */
import { rm } from "node:fs/promises";
import path from "node:path";

import { resolveCepExtensionsRoot } from "../lib/cep-paths";

// Dev installs live under `app.ty-plus.dev`; release installs under
// `app.ty-plus`. Remove both so no ty-plus surface is left behind (#86).
// `org.loginc.ty-plus` is the pre-#86 dev folder name; remove it too so
// stale dev installs do not linger.
const FOLDER_NAMES = [
	"app.ty-plus",
	"app.ty-plus.dev",
	"org.loginc.ty-plus",
] as const;

for (const name of FOLDER_NAMES) {
	const dst = path.join(resolveCepExtensionsRoot("user"), name);
	await rm(dst, { recursive: true, force: true });
	console.log(`Removed ${dst}`);
}
