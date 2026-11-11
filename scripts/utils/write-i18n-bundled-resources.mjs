import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const base = path.join(repoRoot, "src/shared/i18n/locales");
const locales = ["en", "ja", "de", "fr", "zh", "es", "ko", "pt", "it", "ru"];
const ns = [
	"common",
	"contextMenu",
	"onboarding",
	"presets",
	"workspace",
	"settings",
	"widgets",
	"dialogs",
];

const imports = [];
const importName = (loc, n) => `${loc}_${n.replace(/[^a-zA-Z0-9]/g, "_")}`;
const namespacePath = (loc, n) =>
	n === "common" && (loc === "en" || loc === "ja")
		? `core/${n}.json`
		: `${n}.json`;

for (const loc of locales) {
	for (const n of ns) {
		const rel = namespacePath(loc, n);
		const f = path.join(base, loc, rel);
		if (fs.existsSync(f)) {
			const name = importName(loc, n);
			imports.push(`import ${name} from "./locales/${loc}/${rel}";`);
		}
	}
}

const lines = [];
lines.push("/**");
lines.push(
	" * CEP Bun.build single bundle does not resolve dynamic imports at runtime.",
);
lines.push(
	" * Bundle translation JSON via static import and pass to i18n.init({ resources }).",
);
lines.push(" * Regenerate: node scripts/write-i18n-bundled-resources.mjs");
lines.push(" */");
lines.push("");
lines.push(`import type { Resource } from "i18next";`);
lines.push("");
lines.push(...imports);
lines.push("");
lines.push("export const BUNDLED_I18N_RESOURCES: Resource = {");

for (const loc of locales) {
	const block = [];
	for (const n of ns) {
		const f = path.join(base, loc, namespacePath(loc, n));
		if (fs.existsSync(f)) {
			block.push(`    ${n}: ${importName(loc, n)},`);
		} else if (n === "common") {
			block.push("    common: en_common,");
		}
	}
	lines.push(`  ${loc}: {`);
	lines.push(...block);
	lines.push("  },");
}

lines.push("};");
lines.push("");

const out = path.join(repoRoot, "src/shared/i18n/bundled-resources.ts");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log("Wrote", out);
