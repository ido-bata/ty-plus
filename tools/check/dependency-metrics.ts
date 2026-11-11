import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getImportEntries } from "./lib/extract.js";

const ROOT = resolve("src");

const getImportSpecifiers = (
	filePath: string,
	sourceText: string,
): { specifier: string; lineNumber: number }[] => {
	return getImportEntries(filePath, sourceText).map((e) => ({
		specifier: e.specifier,
		lineNumber: e.lineNumber,
	}));
};

const resolveModuleOwner = (
	specifier: string,
	fromFilePath: string,
): string | null => {
	if (!specifier.startsWith(".")) {
		if (specifier.startsWith("@ty-plus/shared")) return "shared";
		if (
			specifier.startsWith("@ty-plus/management") ||
			specifier.startsWith("@ty-plus/workspace") ||
			specifier.startsWith("@ty-plus/licensing") ||
			specifier.startsWith("@ty-plus/cloud")
		) {
			return "management";
		}
		if (
			specifier.startsWith("@ty-plus/function") ||
			specifier.startsWith("@ty-plus/widgets") ||
			specifier.startsWith("@ty-plus/host-ae")
		) {
			return "function";
		}
		return null;
	}

	const normalizedFrom = fromFilePath.replace(/\\/g, "/");
	const fromDir = dirname(normalizedFrom);
	const resolved = resolve(fromDir, specifier);
	const normalizedResolved = resolved.replace(/\\/g, "/");
	if (!normalizedResolved.includes("/src/")) return null;
	const srcMatch = normalizedResolved.match(/\/src\/([^/]+)/);
	if (!srcMatch) return null;
	const owner = srcMatch[1];
	if (owner !== "shared" && owner !== "management" && owner !== "function") {
		return null;
	}
	return owner;
};

const scanDirectory = (dir: string, extensions: string[]): string[] => {
	const files: string[] = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					!entry.name.includes("node_modules") &&
					!entry.name.includes("dist") &&
					!entry.name.includes(".git")
				) {
					files.push(...scanDirectory(fullPath, extensions));
				}
			} else if (extensions.some((ext) => entry.name.endsWith(ext))) {
				files.push(fullPath);
			}
		}
	} catch {
		// skip
	}
	return files;
};

const counts: Record<string, number> = {
	"function->management": 0,
	"function->shared": 0,
	"management->function": 0,
	"management->shared": 0,
	"shared->management": 0,
	"shared->function": 0,
};

const tsFiles = scanDirectory(ROOT, [".ts", ".tsx"]);
for (const file of tsFiles) {
	const content = readFileSync(file, "utf-8");
	const specifiers = getImportSpecifiers(file, content);
	const normalized = file.replace(/\\/g, "/");
	const srcOwnerMatch = normalized.match(/\/src\/([^/]+)/);
	const fromOwner = srcOwnerMatch ? srcOwnerMatch[1] : null;

	for (const { specifier } of specifiers) {
		const toOwner = resolveModuleOwner(specifier, file);
		if (fromOwner && toOwner && fromOwner !== toOwner) {
			const edge = `${fromOwner}->${toOwner}`;
			if (edge in counts) {
				counts[edge]++;
			}
		}
	}
}

for (const [edge, count] of Object.entries(counts)) {
	console.log(`${edge}: ${count}`);
}
