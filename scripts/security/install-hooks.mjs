#!/usr/bin/env node

/**
 * Install Security Git Hooks
 *
 * Copies security check scripts to .git/hooks
 */

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, "../..");
const hooksDir = join(projectRoot, ".git/hooks");

// Ensure hooks directory exists
if (!existsSync(hooksDir)) {
	mkdirSync(hooksDir, { recursive: true });
}

// Copy pre-commit hook
const targetHook = join(hooksDir, "pre-commit");

const hookBody = `#!/usr/bin/env sh
node "$(dirname "$0")/../../scripts/security/pre-commit-security-check.mjs"
`;

try {
	writeFileSync(targetHook, hookBody, "utf-8");
	chmodSync(targetHook, 0o755);
	console.log("✓ Installed pre-commit hook");

	console.log("");
	console.log("Security git hooks installed successfully!");
	console.log("The pre-commit hook will now scan for:");
	console.log("  - Suspicious install hook files (preinstall.js, etc.)");
	console.log("  - Obfuscated code patterns");
	console.log("  - Malicious package.json scripts");
} catch (err) {
	console.log("Failed to install git hooks:", err.message);
	process.exit(1);
}
