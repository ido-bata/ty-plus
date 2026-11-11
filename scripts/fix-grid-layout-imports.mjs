import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const targetAbs = path.resolve(
	"src/management/workspace/layout/grid-layout-document.ts",
);
const exts = new Set([".ts", ".tsx"]);

function walk(dir, out = []) {
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			if (ent.name === "node_modules") continue;
			walk(p, out);
		} else if (exts.has(path.extname(ent.name))) {
			out.push(p);
		}
	}
	return out;
}

function posixRel(fromFile) {
	let rel = path.relative(path.dirname(fromFile), targetAbs);
	rel = rel.split(path.sep).join("/");
	if (!rel.startsWith(".")) rel = `./${rel}`;
	return rel.replace(/\.tsx?$/, "");
}

let fixed = 0;
const re = /from\s+["']([^"']*grid-layout-document[^"']*)["']/g;
for (const file of walk(root)) {
	const s = fs.readFileSync(file, "utf8");
	if (!s.includes("grid-layout-document")) continue;
	const spec = posixRel(file);
	const next = s.replace(re, `from "${spec}"`);
	if (next !== s) {
		fs.writeFileSync(file, next);
		fixed++;
	}
}
console.log("fixed imports in", fixed, "files");
