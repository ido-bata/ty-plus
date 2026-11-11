import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const allowed = new Set([
	"src/shared/universals.d.ts",
	"src/icons.d.ts",
	"src/packages/host-scripts/src/types/extendscript.d.ts",
	"src/management/ae/scripts/types/extendscript.d.ts",
	"src/cep-shell/src/typings/css-text.d.ts",
]);

const root = process.cwd();
const violations: string[] = [];

function walk(dir: string) {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === "dist" || entry === ".git")
			continue;
		const path = join(dir, entry);
		const rel = relative(root, path).replaceAll("\\", "/");
		const stat = statSync(path);
		if (stat.isDirectory()) {
			walk(path);
			continue;
		}
		if (rel.endsWith(".d.ts.map")) violations.push(rel);
		if (rel.startsWith("src/") && rel.endsWith(".d.ts") && !allowed.has(rel)) {
			violations.push(rel);
		}
	}
}

walk(join(root, "src"));

if (violations.length > 0) {
	console.error("Generated declaration artifacts are committed:");
	for (const file of violations) console.error(`- ${file}`);
	process.exit(1);
}
