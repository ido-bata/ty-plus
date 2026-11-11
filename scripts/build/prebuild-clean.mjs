/**
 * Pre-build script to remove installed CEP extension
 * This prevents vite-cep-plugin symlink errors when using copy mode
 */

import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const extensionPath = path.join(
	process.env.APPDATA || "~/AppData/Roaming",
	"Adobe",
	"CEP",
	"extensions",
	"app.ty-plus",
);

try {
	if (existsSync(extensionPath)) {
		rmSync(extensionPath, { recursive: true, force: true });
		console.log("[prebuild] Removed existing CEP extension");
	}
} catch (error) {
	// Ignore errors - directory might not exist or be in use
	console.log("[prebuild] No existing extension to remove (or in use)");
}
