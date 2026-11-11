import fs from "node:fs";
import { cp, lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
	canonicalMethods,
	protocolVersion,
} from "../../src/management/ipc/generated/wire.ts";
import { resolveOperationWorkerBinary } from "../../src/management/ipc/operation-worker-binary.ts";
import {
	addDataMainToScripts,
	patchCepNativeRequireMainPath,
	stripCepDevRedirect,
} from "../utils/vite-plugin-strip-cep-dev-redirect.js";
import { replaceBundleUnderLease } from "./install-cep-dev.ts";
import {
	NativeInstallLeaseProvider,
	updateExtension,
} from "./operation-worker-update.ts";

const CEP_TARGET_HTMLS = ["panel/index.html", "modeless/index.html"];

function argValue(args, name, fallback) {
	const idx = args.indexOf(name);
	if (idx === -1) return fallback;
	const v = args[idx + 1];
	return v ?? fallback;
}

function argFlag(args, name) {
	return args.includes(name);
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
		if (target === "common")
			return "/Library/Application Support/Adobe/CEP/extensions";
		return path.join(
			home,
			"Library",
			"Application Support",
			"Adobe",
			"CEP",
			"extensions",
		);
	}
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

async function safeRemove(p, label) {
	if (!(await exists(p))) return;
	try {
		await rm(p, { recursive: true, force: true });
	} catch (e) {
		console.warn(`[${label}] failed to remove: ${p}`);
		console.warn(e?.message ?? e);
	}
}

async function safeRemoveIfManifestMatches(folderPath, idNeedle, label) {
	try {
		const manifestPath = path.join(folderPath, "CSXS", "manifest.xml");
		const xml = await readFile(manifestPath, "utf-8").catch(() => "");
		if (!xml.includes(idNeedle)) return;
		await safeRemove(folderPath, label);
	} catch {}
}

async function validateReleaseWorkerManifest(rootDir) {
	const workerManifestPath = path.join(rootDir, "worker", "manifest.json");
	if (!(await exists(workerManifestPath)))
		throw new Error("Missing operation-worker release manifest");
	let manifest;
	try {
		manifest = JSON.parse(await readFile(workerManifestPath, "utf8"));
	} catch {
		throw new Error("Malformed operation-worker manifest");
	}
	if (manifest?.trust?.mode !== "release") {
		throw new Error(
			"Release CEP installation rejects a development-unsigned operation-worker manifest",
		);
	}
	const packageJson = JSON.parse(
		await readFile(path.resolve("package.json"), "utf8"),
	);
	const platform = process.platform === "win32" ? "windows" : "macos";
	const resolved = await resolveOperationWorkerBinary({
		extensionRoot: path.resolve(rootDir),
		manifest,
		platform,
		expectedProductVersion: packageJson.version,
		expectedExtensionVersion: packageJson.version,
		expectedProtocolVersion: protocolVersion,
		expectedCapabilities: [...canonicalMethods],
		expectedTrustMode: "release",
	});
	return { manifest, binaryPath: resolved.absolutePath };
}

export function sanitizeInstalledHtml(rootDir) {
	let changed = 0;
	for (const relativePath of CEP_TARGET_HTMLS) {
		const filePath = path.join(rootDir, relativePath);
		if (!fs.existsSync(filePath)) continue;
		const before = fs.readFileSync(filePath, "utf8");
		const after = patchCepNativeRequireMainPath(
			addDataMainToScripts(stripCepDevRedirect(before), relativePath),
		);
		if (after !== before) {
			fs.writeFileSync(filePath, after, "utf8");
			changed += 1;
		}
	}
	return { changed };
}

export async function runInstall(rawArgs = process.argv.slice(2)) {
	const args = rawArgs;
	const src = path.resolve(argValue(args, "--src", "dist/cep-dev"));
	const target = argValue(args, "--target", "user"); // user | common
	const mode = argValue(args, "--mode", "link"); // link | copy
	const dstRootOverride = argValue(args, "--dst-root", "");
	const doClean = !argFlag(args, "--no-clean");
	if (argFlag(args, "--clean-all")) {
		throw new Error(
			"--clean-all is disabled: install each CEP root separately so every mutation has its own native lease",
		);
	}

	const packageJson = JSON.parse(
		await readFile(path.resolve("package.json"), "utf-8"),
	);
	const extensionFolderName = String(
		argValue(args, "--id", packageJson.name || ""),
	).trim();
	if (!extensionFolderName)
		throw new Error("Missing extension folder name (package.json name / --id)");

	// Make install output CEP-runtime-safe even when the source bundle was built in dev mode.
	const validated = await validateReleaseWorkerManifest(src);
	const sanitized = sanitizeInstalledHtml(src);

	const dstRoot = dstRootOverride
		? path.resolve(dstRootOverride)
		: resolveCepExtensionsRoot(target);
	await mkdir(dstRoot, { recursive: true });

	const dst = path.join(dstRoot, extensionFolderName);
	const leases = new NativeInstallLeaseProvider(
		validated.binaryPath,
		validated.manifest.workers[
			process.platform === "win32" ? "windows" : "macos"
		].sha256,
		async (pair) => {
			await replaceBundleUnderLease(
				dst,
				src,
				mode === "link" ? "junction" : "copy",
				pair,
			);
			if (!doClean || dstRootOverride) return;
			for (const root of [dstRoot]) {
				for (let i = 1; i <= 5; i++)
					await safeRemove(path.join(root, `ty-plus-${i}`), "clean");
				if (extensionFolderName !== "ty-plus")
					await safeRemoveIfManifestMatches(
						path.join(root, "ty-plus"),
						`${String(packageJson.name || "").trim()}.panel`,
						"clean",
					);
			}
		},
	);
	const result = await updateExtension({
		installationRoot: dst,
		oldPair: validated.manifest,
		newPair: validated.manifest,
		deadlineMs: 5_000,
		leases,
		massKill: () => {
			throw new Error("mass kill is not part of operation-worker installation");
		},
	});
	if (result.kind !== "replaced") throw new Error("CEP install lease expired");

	console.log(`Installed CEP extension to: ${dst}`);
	console.log(`Mode: ${mode}`);
	console.log(`Sanitized HTML files: ${sanitized.changed}`);
}

const isEntry =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
	await runInstall();
}
