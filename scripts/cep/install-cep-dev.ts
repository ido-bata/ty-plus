import { existsSync, realpathSync } from "node:fs";
import {
	cp,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	symlink,
} from "node:fs/promises";
import path from "node:path";
import {
	canonicalMethods,
	protocolVersion,
} from "../../src/management/ipc/generated/wire";
import type { OperationWorkerManifest } from "../../src/management/ipc/operation-worker-binary";
import { resolveOperationWorkerBinary } from "../../src/management/ipc/operation-worker-binary";
import { createNodeOperationWorkerRuntime } from "../../src/management/ipc/operation-worker-node-runtime";
import { resolveCepExtensionsRoot } from "../lib/cep-paths";
import { ensurePlayerDebugMode } from "../lib/write-debug-mode";
import {
	NativeInstallLeaseProvider,
	updateExtension,
} from "./operation-worker-update";

const DIST_ROOT = path.resolve("dist", "cep-dev");
/**
 * Dev bundles install under their own folder name, matching the
 * `app.ty-plus.dev` Extension Bundle Id (#86), so this folder must not
 * collide with a release install at `app.ty-plus`.
 */
const INSTALL_DIR_NAME = "app.ty-plus.dev";

export type InstallCepDevBundleOptions = {
	mode?: "copy" | "junction";
};

const currentPlatform = () => {
	if (process.platform === "win32") return "windows" as const;
	if (process.platform === "darwin") return "macos" as const;
	throw new Error("CEP development worker requires Windows or macOS");
};

export const validateCepDevWorker = async (): Promise<{
	manifest: OperationWorkerManifest;
	binaryPath: string;
}> => {
	const manifestPath = path.join(DIST_ROOT, "worker", "manifest.json");
	if (!existsSync(manifestPath)) {
		throw new Error(
			`Missing development operation-worker manifest: ${manifestPath}`,
		);
	}
	const packageJson = JSON.parse(
		await readFile(path.resolve("package.json"), "utf8"),
	) as { version?: unknown };
	if (typeof packageJson.version !== "string") {
		throw new Error(
			"Package version is required for development worker validation",
		);
	}
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const resolved = await resolveOperationWorkerBinary(
		{
			extensionRoot: DIST_ROOT,
			manifest,
			platform: currentPlatform(),
			expectedProductVersion: packageJson.version,
			expectedExtensionVersion: packageJson.version,
			expectedProtocolVersion: protocolVersion,
			expectedCapabilities: [...canonicalMethods],
			expectedTrustMode: "development-unsigned",
		},
		createNodeOperationWorkerRuntime(),
	);
	return { manifest, binaryPath: resolved.absolutePath };
};

const recoverInterruptedBundleReplacement = async (
	destination: string,
	next: string,
): Promise<void> => {
	if (existsSync(destination)) {
		await rm(next, { force: true, recursive: true });
		return;
	}
	if (existsSync(next)) {
		await rename(next, destination);
		return;
	}
	const parent = path.dirname(destination);
	const prefix = `${path.basename(destination)}.previous-`;
	const previous = (
		await readdir(parent, { withFileTypes: true }).catch(() => [])
	)
		.filter((entry) => entry.name.startsWith(prefix))
		.sort((left, right) => right.name.localeCompare(left.name))[0];
	if (previous !== undefined) {
		await rename(path.join(parent, previous.name), destination);
	}
};

export const replaceBundleUnderLease = async (
	destination: string,
	source: string,
	mode: "copy" | "junction",
	pair: OperationWorkerManifest,
): Promise<void> => {
	const next = `${destination}.next`;
	const digest = pair.workers[currentPlatform()]?.sha256 ?? "unknown";
	const previousBase = `${destination}.previous-${digest}`;
	let previous = previousBase;
	let suffix = 0;
	while (existsSync(previous)) {
		suffix += 1;
		previous = `${previousBase}-${suffix}`;
	}
	await recoverInterruptedBundleReplacement(destination, next);
	await rm(next, { force: true, recursive: true });
	if (mode === "copy") {
		await cp(source, next, { recursive: true, force: true });
	} else {
		await symlink(
			source,
			next,
			process.platform === "win32" ? "junction" : "dir",
		);
	}
	const hadDestination = existsSync(destination);
	try {
		if (hadDestination) await rename(destination, previous);
		await rename(next, destination);
	} catch (error) {
		await rm(next, { force: true, recursive: true });
		if (!existsSync(destination) && existsSync(previous)) {
			await rename(previous, destination);
		}
		throw error;
	}
};

export const installCepDevBundle = async ({
	mode = "junction",
}: InstallCepDevBundleOptions = {}) => {
	const dstRoot = resolveCepExtensionsRoot("user");
	const dst = path.join(dstRoot, INSTALL_DIR_NAME);

	if (!existsSync(DIST_ROOT)) {
		throw new Error(
			`[ty-plus] Missing ${DIST_ROOT}. Run \`bun run build:cep\` (Vite CEP bundle) or \`bun run host\` / \`bun run host:deploy\`, then \`bun run symlink\`.`,
		);
	}
	const validated = await validateCepDevWorker();
	const manifestPath = path.join(DIST_ROOT, "CSXS", "manifest.xml");
	if (!existsSync(manifestPath)) {
		throw new Error(
			`[ty-plus] Incomplete CEP bundle (no ${manifestPath}). Run \`bun run build:cep\` first.`,
		);
	}

	await mkdir(dstRoot, { recursive: true });

	ensurePlayerDebugMode();
	const leases = new NativeInstallLeaseProvider(
		validated.binaryPath,
		validated.manifest.workers[currentPlatform()].sha256,
		async (pair) => replaceBundleUnderLease(dst, DIST_ROOT, mode, pair),
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
	if (result.kind !== "replaced")
		throw new Error("CEP development install lease expired");

	console.log(`Installed CEP dev bundle to ${dst}`);
	console.log(`Mode: ${mode}`);
	try {
		const resolved = realpathSync(dst);
		console.log(`Resolved bundle path (what AE should load): ${resolved}`);
	} catch {
		// ignore
	}

	const commonDup = path.join(
		resolveCepExtensionsRoot("common"),
		INSTALL_DIR_NAME,
	);
	if (existsSync(commonDup)) {
		console.warn(
			`[ty-plus] Another copy exists at:\n  ${commonDup}\nIf manifest changes never show up, remove/rename that folder — AE may prefer it over the user dev install.`,
		);
	}

	const releaseDup = path.join(dstRoot, "app.ty-plus");
	try {
		if (realpathSync(releaseDup) === realpathSync(DIST_ROOT)) {
			console.warn(
				`[ty-plus] ${releaseDup} resolves into the dev bundle. Rename or remove it — the release install folder must stay free for release builds.`,
			);
		}
	} catch {
		// release folder absent or unreadable — nothing to warn about
	}

	if (mode === "copy") {
		console.warn(
			"[ty-plus] copy mode: you must run `bun run symlink` (or `host`) again after every `bun run build`.",
		);
	}
};

if (import.meta.main) {
	const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
	const mode = modeArg?.split("=")[1] === "copy" ? "copy" : "junction";
	await installCepDevBundle({ mode });
}
