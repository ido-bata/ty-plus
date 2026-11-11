/**
 * Enforces management/storage read/write ownership.
 *
 * - `storage/read/**` must not import or call write-side mutation APIs.
 * - Legacy mixed root modules must stay compatibility barrels only.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const storageRoot = path.join(repoRoot, "src", "management", "storage");
const readRoot = path.join(storageRoot, "read");

type Violation = {
	file: string;
	message: string;
};

const toPosix = (value: string): string => value.replace(/\\/g, "/");

const walkFiles = (dir: string): string[] => {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			out.push(...walkFiles(full));
		} else if (/\.(ts|tsx)$/.test(entry)) {
			out.push(full);
		}
	}
	return out;
};

const violations: Violation[] = [];

const forbiddenReadPatterns: Array<{ pattern: RegExp; message: string }> = [
	{
		pattern: /@\/management\/storage\/write\//,
		message: "read-side storage must not import storage/write",
	},
	{
		pattern:
			/\b(writeJsonFileText|writeFileWithElevation|writeBytesToFile|ensureDir|requestFolderWriteElevation)\b/,
		message: "read-side storage must not call write-side mutation APIs",
	},
	{
		pattern: /\b(writeFile|writeFileSync|mkdir|mkdirSync)\b/,
		message: "read-side storage must not perform filesystem mutations",
	},
];

for (const file of walkFiles(readRoot)) {
	const text = readFileSync(file, "utf8");
	for (const rule of forbiddenReadPatterns) {
		if (rule.pattern.test(text)) {
			violations.push({ file, message: rule.message });
		}
	}
}

const compatibilityBarrels = [
	path.join(storageRoot, "cache-store.ts"),
	path.join(storageRoot, "json-file-store.ts"),
].filter((p) => existsSync(p));

for (const file of compatibilityBarrels) {
	const text = readFileSync(file, "utf8");
	const withoutExportBlocks = text.replace(
		/export\s*{[\s\S]*?}\s*from\s*["'][^"']+["'];?/g,
		"",
	);
	const withoutComments = withoutExportBlocks
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "")
		.trim();
	if (withoutComments.length > 0) {
		violations.push({
			file,
			message: "legacy root storage module must remain a re-export-only barrel",
		});
	}
}

if (violations.length > 0) {
	console.error("check-storage-read-write-split: FAIL");
	for (const violation of violations) {
		console.error(
			`  ${toPosix(path.relative(repoRoot, violation.file))}: ${violation.message}`,
		);
	}
	process.exit(1);
}

console.log("check-storage-read-write-split: PASS");
