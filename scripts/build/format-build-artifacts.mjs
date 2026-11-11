/**
 * Post-process CEP build output: Biome (HTML/JS bundles) + prettify-xml (manifest / .debug).
 * Main `biome.json` ignores `dist/**`; this step uses `biome.build-artifacts.json` only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettifyXml from "prettify-xml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const cepDev = path.join(repoRoot, "dist", "cep-dev");
const biomeConfig = path.join(__dirname, "biome.build-artifacts.json");

if (!existsSync(cepDev)) {
	console.warn("[format-build-artifacts] skip: dist/cep-dev missing");
	process.exit(0);
}

if (!existsSync(biomeConfig)) {
	console.error("[format-build-artifacts] missing", biomeConfig);
	process.exit(1);
}

const r = spawnSync(
	"bun",
	[
		"run",
		"biome",
		"format",
		"--write",
		`--config-path=${biomeConfig}`,
		"--files-max-size=20971520",
		"dist/cep-dev",
	],
	{ cwd: repoRoot, stdio: "inherit", shell: false },
);

if (r.status !== 0 && r.status !== null) {
	process.exit(r.status);
}

const xmlTargets = [
	path.join(cepDev, "CSXS", "manifest.xml"),
	path.join(cepDev, ".debug"),
];

for (const filePath of xmlTargets) {
	if (!existsSync(filePath)) continue;
	const raw = readFileSync(filePath, "utf8").trim();
	if (!raw.length) continue;
	try {
		writeFileSync(
			filePath,
			`${prettifyXml(raw, { indent: 2, newline: "\n" })}\n`,
			"utf8",
		);
	} catch (e) {
		console.warn("[format-build-artifacts] xml prettify skipped:", filePath, e);
	}
}

console.log("[format-build-artifacts] ok");
