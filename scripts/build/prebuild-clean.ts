/**
 * Pre-build script to remove installed CEP extension
 * This prevents vite-cep-plugin symlink errors when using copy mode
 */

import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const extensionsRoot = path.join(
	process.env.APPDATA || "~/AppData/Roaming",
	"Adobe",
	"CEP",
	"extensions",
);

for (const name of ["app.ty-plus", "app.ty-plus.dev", "org.loginc.ty-plus"]) {
	const extensionPath = path.join(extensionsRoot, name);
	try {
		if (existsSync(extensionPath)) {
			rmSync(extensionPath, { recursive: true, force: true });
			console.log(`[prebuild] Removed existing CEP extension ${name}`);
		}
	} catch (error) {
		// Ignore errors - directory might not exist or be in use
		console.log(
			`[prebuild] No existing extension ${name} to remove (or in use)`,
		);
	}
}
