import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function argValue(args, name, fallback) {
	const idx = args.indexOf(name);
	if (idx === -1) return fallback;
	const v = args[idx + 1];
	return v ?? fallback;
}

function argFlag(args, name) {
	return args.includes(name);
}

function extractOne(text, re, label) {
	const m = text.match(re);
	if (!m) throw new Error(`Failed to extract ${label}`);
	return m[1];
}

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectExtensionIds(manifestXml) {
	const ids = [];
	const re = /<Extension\s+Id="([^"]+)"\s+Version="[^"]+"\s*\/>/g;
	for (const m of manifestXml.matchAll(re)) ids.push(m[1]);
	return ids;
}

function panelNumberFromId(id) {
	const m = id.match(/panel(\d+)\s*$/);
	if (!m) return null;
	return Number.parseInt(m[1], 10);
}

function buildManifestForId({
	originalManifestXml,
	extensionId,
	bundleId,
	bundleName,
}) {
	const bundleVersion = extractOne(
		originalManifestXml,
		/ExtensionBundleVersion="([^"]+)"/,
		"ExtensionBundleVersion",
	);
	const manifestVersion = extractOne(
		originalManifestXml,
		/<ExtensionManifest\s+[\s\S]*?Version="([^"]+)"/,
		"ExtensionManifest Version",
	);
	const xsi = originalManifestXml.match(/xmlns:xsi="([^"]+)"/)?.[1];
	const executionEnv = extractOne(
		originalManifestXml,
		/(<ExecutionEnvironment>[\s\S]*?<\/ExecutionEnvironment>)/,
		"ExecutionEnvironment block",
	);

	const dispatchBlockRe = new RegExp(
		`(<Extension\\s+Id="${escapeRegExp(extensionId)}">[\\s\\S]*?<\\/Extension>)`,
	);
	const dispatchBlock = extractOne(
		originalManifestXml,
		dispatchBlockRe,
		`DispatchInfo block for ${extensionId}`,
	);

	const xmlns = xsi ? `\nxmlns:xsi="${xsi}"` : "";
	return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<ExtensionManifest\nVersion="${manifestVersion}"\nExtensionBundleId="${bundleId}"\nExtensionBundleVersion="${bundleVersion}"\nExtensionBundleName="${bundleName}"${xmlns}\n>\n<ExtensionList>\n  <Extension Id="${extensionId}" Version="${bundleVersion}" />\n</ExtensionList>\n${executionEnv}\n<DispatchInfoList>\n${dispatchBlock}\n</DispatchInfoList>\n</ExtensionManifest>\n`;
}

function buildDebugForId({ extensionId, port }) {
	return `<?xml version="1.0" encoding="UTF-8"?>\n<ExtensionList>\n  <Extension Id="${extensionId}">\n    <HostList>\n      <Host Name="AEFT" Port="${port}"/>\n    </HostList>\n  </Extension>\n</ExtensionList>\n`;
}

function detectPorts(debugXml) {
	const map = new Map();
	const re =
		/<Extension\s+Id="([^"]+)">[\s\S]*?<Host\s+Name="AEFT"\s+Port="(\d+)"\s*\/>[\s\S]*?<\/Extension>/g;
	for (const m of debugXml.matchAll(re)) {
		map.set(m[1], Number.parseInt(m[2], 10));
	}
	return map;
}

const args = process.argv.slice(2);
const src = argValue(args, "--src", "dist/cep-dev");
const out = argValue(args, "--out", "dist/cep-bundles");
const folderPrefix = argValue(args, "--prefix", "ty-plus");
const count = Number.parseInt(argValue(args, "--count", "5"), 10);
const basePort = Number.parseInt(argValue(args, "--base-port", "8860"), 10);
const keepAllFiles = argFlag(args, "--keep-all-files");

const manifestPath = path.join(src, "CSXS", "manifest.xml");
const debugPath = path.join(src, ".debug");

const [manifestXml, debugXml] = await Promise.all([
	readFile(manifestPath, "utf-8"),
	readFile(debugPath, "utf-8").catch(() => ""),
]);

const ids = detectExtensionIds(manifestXml);
if (!ids.length) throw new Error(`No Extension IDs found in ${manifestPath}`);

const ports = debugXml ? detectPorts(debugXml) : new Map();

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (let i = 1; i <= count; i++) {
	const extensionId = ids.find((id) => panelNumberFromId(id) === i);
	if (!extensionId) throw new Error(`Missing extensionId for panel${i}`);

	const bundleId = `${extensionId}.bundle`;
	const bundleName = `${folderPrefix} ${i}`;
	const folderName = `${folderPrefix}-${i}`;
	const dst = path.join(out, folderName);

	await mkdir(dst, { recursive: true });

	// Copy everything so each bundle is standalone and can be installed independently.
	// (If you need a lighter dev setup, add junction/symlink logic later.)
	await cp(src, dst, { recursive: true, force: true });

	// Overwrite multi-extension files with single-extension versions.
	await mkdir(path.join(dst, "CSXS"), { recursive: true });
	await writeFile(
		path.join(dst, "CSXS", "manifest.xml"),
		buildManifestForId({
			originalManifestXml: manifestXml,
			extensionId,
			bundleId,
			bundleName,
		}),
		"utf-8",
	);

	const port = ports.get(extensionId) ?? basePort + (i - 1);
	await writeFile(
		path.join(dst, ".debug"),
		buildDebugForId({ extensionId, port }),
		"utf-8",
	);

	if (!keepAllFiles) {
		// Optional future: prune other panel folders here.
		// For now keep everything to avoid any hidden runtime dependencies.
	}
}

console.log(`Created ${count} CEP bundles in ${out}`);
