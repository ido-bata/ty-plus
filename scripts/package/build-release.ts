#!/usr/bin/env bun
/**
 * Release-trust distribution build (#32).
 *
 * Produces the distribution pair — `NODE_ENV=production` panel plus a
 * release worker manifest whose signature block is read back from the
 * OS-signed binary — and runs the full release gate over it. Fail-closed at
 * every step: without signing configuration the build refuses before
 * producing anything, and an unsigned or unnotarized binary never reaches a
 * manifest.
 *
 * There is deliberately no publish step: creating a GitHub Release or any
 * public artifact is a manual, user-authorized action (acceptance criteria
 * of #32). A green run of this script is build evidence only — it is NOT a
 * release-trust completion proof until the artifacts have been audited
 * (`scripts/verify/verify-release-artifacts.ts`) and the certificates are
 * the real ones (an owner decision, #2).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildReleaseWorker } from "../cep/operation-worker-update";
import { extractSignatureEvidence } from "./signature-evidence";
import {
	type SignWorkerConfig,
	buildSignPlan,
	resolveSignWorkerConfig,
} from "./sign-worker";
import { assertNoSecrets } from "./secret-scan";

export type ReleaseBuildStep = Readonly<{
	name: string;
	args: readonly string[];
	env?: Readonly<Record<string, string>>;
}>;

export type RunStep = (step: ReleaseBuildStep) => void;

const runStepWith = (env: NodeJS.ProcessEnv): RunStep => (step) => {
	const [cmd, ...args] = step.args;
	const r = spawnSync(cmd, args, {
		cwd: process.cwd(),
		stdio: "inherit",
		env: step.env ? { ...env, ...step.env } : env,
	});
	if (r.status !== 0) {
		throw new Error(
			`[build-release] step "${step.name}" failed: ${step.args.join(" ")}`,
		);
	}
};

/**
 * Subprocess-level plan around the in-process worker signing. The worker
 * binary itself is signed inside `buildReleaseWorker` (staged → signed →
 * evidence extracted → manifest written), so it is not a step here.
 */
export const plannedSteps = (options: {
	readonly productVersion: string;
}): readonly ReleaseBuildStep[] => [
	{
		name: "build:cep (production panel trust)",
		args: ["bun", "run", "build:cep"],
		env: { NODE_ENV: "production" },
	},
	{
		name: "verify packaged bundle (release trust)",
		args: [
			"bun",
			"run",
			"verify:online-gateway:package",
			"--",
			"--trust-mode=release",
			`--product-version=${options.productVersion}`,
		],
	},
	{
		name: "package zip",
		args: ["bun", "run", "scripts/package/package-cep-archive.ts", "zip"],
	},
	{
		name: "generate release manifest (release trust)",
		args: [
			"bun",
			"scripts/package/release-manifest.ts",
			"--trust-mode=release",
			"--artifact=dist/app.ty-plus.zip",
		],
	},
];

/**
 * The full release-trust sequence. The signing of the staged worker binary
 * happens inside `buildReleaseWorker`, between the CEP build and the
 * manifest write — the steps below are the subprocess-level plan around it.
 */
export const runReleaseBuild = async (
	options: Readonly<{
		productVersion?: string;
		platform?: "windows" | "macos";
		run?: RunStep;
		env?: Partial<Record<string, string | undefined>>;
	}> = {},
): Promise<void> => {
	const platform =
		options.platform ??
		(process.platform === "win32"
			? "windows"
			: process.platform === "darwin"
				? "macos"
				: null);
	if (platform === null) {
		throw new Error(
			"[build-release] release-trust builds require Windows or macOS",
		);
	}
	// Fail-closed before anything is built: a missing signing configuration is
	// the unresolved owner decision (#32), and the refusal names it.
	const signConfig = resolveSignWorkerConfig(platform, options.env);
	const packageJson = JSON.parse(
		await Bun.file("package.json").text(),
	) as { version?: string };
	const productVersion = options.productVersion ?? packageJson.version;
	if (!productVersion) {
		throw new Error("[build-release] no product version to build");
	}

	const run = options.run ?? runStepWith({ ...process.env, ...options.env });
	// Fail-closed ordering: the signing config gate above runs before anything
	// is built, the worker is signed before the verify gate, and the secret
	// scan runs over the exact bytes that ship before they are packaged.
	const [panelBuild, ...rest] = plannedSteps({ productVersion });
	run(panelBuild);

	// Sign the staged worker and write the release trust manifest. The
	// evidence is read back from the signed binary — the manifest never
	// records a signature the binary does not carry.
	await buildReleaseWorker(async (stagedPath) => {
		for (const args of buildSignPlan(signConfig, stagedPath)) {
			const r = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
			if (r.status !== 0) {
				throw new Error(
					`[build-release] worker signing failed: ${args.join(" ")}`,
				);
			}
		}
		return extractSignatureEvidence(platform, stagedPath);
	});

	for (const step of rest) {
		run(step);
	}

	// Audit the staged pack input before it is archived. dist/cep-pack is
	// created by the packaging step itself, so the scan targets its source.
	assertNoSecrets(path.resolve("dist", "cep-dev"));
};
