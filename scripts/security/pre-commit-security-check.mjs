#!/usr/bin/env node

/**
 * Git Pre-Commit Hook: Security Scanner
 *
 * Prevents commits containing:
 * - Suspicious install hooks (preinstall/postinstall scripts)
 * - Obfuscated code patterns (eval, Buffer.from with Unicode)
 * - Malicious package.json scripts
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function error(msg) {
	console.log(`${RED}✖ SECURITY ALERT:${RESET} ${msg}`);
}

function warn(msg) {
	console.warn(`${YELLOW}⚠ WARNING:${RESET} ${msg}`);
}

// Get list of staged files
let stagedFiles;
try {
	stagedFiles = execSync("git diff --cached --name-only --diff-filter=ACM", {
		encoding: "utf-8",
	})
		.split("\n")
		.filter(Boolean);
} catch (err) {
	console.log("Failed to get staged files:", err.message);
	process.exit(1);
}

let hasErrors = false;

// Check 1: Block suspicious install hook files
const suspiciousFiles = [
	"preinstall.js",
	"postinstall.js",
	"prepack.js",
	"postpack.js",
];
const blockedFiles = stagedFiles.filter((file) =>
	suspiciousFiles.some((sus) => file.endsWith(sus)),
);

if (blockedFiles.length > 0) {
	error("Attempting to commit suspicious install hook files:");
	for (const file of blockedFiles) {
		console.log(`  - ${file}`);
	}
	error("These files are commonly used in supply chain attacks.");
	error("If legitimate, add them explicitly with --no-verify");
	hasErrors = true;
}

// Check 2: Scan package.json for suspicious scripts
const packageJsonFiles = stagedFiles.filter((f) => f.endsWith("package.json"));

for (const pkgFile of packageJsonFiles) {
	try {
		const content = readFileSync(pkgFile, "utf-8");
		const pkg = JSON.parse(content);

		if (pkg.scripts) {
			const suspiciousScripts = [
				"preinstall",
				"postinstall",
				"prepack",
				"postpack",
			];
			const foundSuspicious = suspiciousScripts.filter((s) => pkg.scripts[s]);

			if (foundSuspicious.length > 0) {
				warn(`${pkgFile} contains install hook scripts:`);
				for (const script of foundSuspicious) {
					console.warn(`  - "${script}": "${pkg.scripts[script]}"`);
				}
				warn("Verify these scripts are legitimate before committing.");
				warn(
					"Install hooks can execute arbitrary code during package install.",
				);
				// Warning only, not blocking
			}
		}
	} catch (err) {
		// Ignore parse errors
	}
}

// Check 3: Scan JavaScript files for obfuscated patterns
const ignoredJsFiles = new Set([
	"scripts/security/pre-commit-security-check.mjs",
]);

const jsFiles = stagedFiles
	.filter((f) => f.endsWith(".js") || f.endsWith(".mjs") || f.endsWith(".cjs"))
	.filter((f) => !ignoredJsFiles.has(f));

for (const jsFile of jsFiles) {
	try {
		const content = readFileSync(jsFile, "utf-8");

		// Pattern 1: Unicode Variation Selectors (used in the malware)
		const hasVariationSelectors =
			/(?:\uFE00|\uFE01|\uFE02|\uFE03|\uFE04|\uFE05|\uFE06|\uFE07|\uFE08|\uFE09|\uFE0A|\uFE0B|\uFE0C|\uFE0D|\uFE0E|\uFE0F)/.test(
				content,
			) || /\u{E0100}/u.test(content);

		// Pattern 2: eval(Buffer.from(...))
		const hasEvalBuffer = /eval\s*\(\s*Buffer\.from\s*\(/i.test(content);

		// Pattern 3: Suspicious character encoding
		const hasUnicodeEscape = /\\u\{[eE]0[0-9a-fA-F]{3,}\}/i.test(content);

		if (hasVariationSelectors || hasEvalBuffer || hasUnicodeEscape) {
			error(`${jsFile} contains suspicious obfuscation patterns:`);
			if (hasVariationSelectors)
				error("  - Unicode Variation Selectors detected");
			if (hasEvalBuffer) error("  - eval(Buffer.from(...)) pattern detected");
			if (hasUnicodeEscape) error("  - Suspicious Unicode escapes detected");
			error("This file may contain malicious code.");
			hasErrors = true;
		}
	} catch (err) {
		// Ignore read errors
	}
}

if (hasErrors) {
	console.log("");
	error("Commit blocked due to security concerns.");
	error("To bypass (NOT RECOMMENDED): git commit --no-verify");
	process.exit(1);
}

console.log("✓ Security check passed");
process.exit(0);
