import {
	cp,
	lstat,
	mkdir,
	readdir,
	readFile,
	rm,
	symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function argValue(args, name, fallback) {
	const idx = args.indexOf(name);
	if (idx === -1) return fallback;
	const v = args[idx + 1];
	return v ?? fallback;
}

function resolveCepExtensionsRoot(target) {
	const platform = process.platform;
	if (platform === "win32") {
		if (target === "common") {
			const common = process.env["CommonProgramFiles(x86)"];
			if (!common) throw new Error("Missing env var CommonProgramFiles(x86)");
			return path.join(common, "Adobe", "CEP", "extensions");
		}
		const appdata = process.env.APPDATA;
		if (!appdata) throw new Error("Missing env var APPDATA");
		return path.join(appdata, "Adobe", "CEP", "extensions");
	}
	if (platform === "darwin") {
		const home = os.homedir();
		if (target === "common") {
			return "/Library/Application Support/Adobe/CEP/extensions";
		}
		return path.join(
			home,
			"Library",
			"Application Support",
			"Adobe",
			"CEP",
			"extensions",
		);
	}
	// Linux is not an Adobe CEP target; keep a sensible default for tooling.
	const home = os.homedir();
	return path.join(home, ".adobe", "CEP", "extensions");
}

async function exists(p) {
	try {
		await lstat(p);
		return true;
	} catch {
		return false;
	}
}

const args = process.argv.slice(2);
const srcRoot = argValue(args, "--src", "dist/cep-bundles");
const target = argValue(args, "--target", "user"); // user | common
const mode = argValue(args, "--mode", "copy"); // copy | link
const dstRootOverride = argValue(args, "--dst-root", "");
const keepLegacy = args.includes("--keep-legacy");
const noClean = args.includes("--no-clean");

const srcRootAbs = path.resolve(srcRoot);
const dstRoot = dstRootOverride
	? path.resolve(dstRootOverride)
	: resolveCepExtensionsRoot(target);
await mkdir(dstRoot, { recursive: true });

const entries = (await readdir(srcRootAbs, { withFileTypes: true }))
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort((a, b) => a.localeCompare(b));

if (!entries.length) {
	throw new Error(`No bundles found in ${srcRoot}. Run: bun run build:bundles`);
}

// Clean up conflicting installs across both user/common roots.
// CEP loads extensions from both locations, and duplicate Extension IDs can cause panels to appear blank/unresponsive.
if (!dstRootOverride && !noClean) {
	const packageJsonPath = path.resolve("package.json");
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
	const legacyFolder = String(packageJson.name || "").trim();
	const rootsToClean = [
		resolveCepExtensionsRoot("user"),
		resolveCepExtensionsRoot("common"),
	].filter(Boolean);

	const toRemove = new Set(entries);
	if (!keepLegacy && legacyFolder) toRemove.add(legacyFolder);

	for (const root of rootsToClean) {
		for (const name of toRemove) {
			const p = path.join(root, name);
			if (!(await exists(p))) continue;
			try {
				await rm(p, { recursive: true, force: true });
			} catch (e) {
				console.warn(`[clean] failed to remove: ${p}`);
				console.warn(e?.message ?? e);
			}
		}
	}
}

for (const name of entries) {
	const src = path.join(srcRootAbs, name);
	const dst = path.join(dstRoot, name);

	if (await exists(dst)) {
		try {
			await rm(dst, { recursive: true, force: true });
		} catch (e) {
			console.warn(`[install] failed to remove existing: ${dst}`);
			console.warn(e?.message ?? e);
		}
	}

	if (mode === "link") {
		const type = process.platform === "win32" ? "junction" : "dir";
		await symlink(src, dst, type);
	} else {
		await cp(src, dst, { recursive: true, force: true });
	}
}

console.log(`Installed ${entries.length} CEP bundles to: ${dstRoot}`);
console.log(`Mode: ${mode}`);
