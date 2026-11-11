#!/usr/bin/env bun
/**
 * Release-trust distribution build (#32).
 *
 * Produces the distribution set — `NODE_ENV=production` panel, a release
 * worker manifest whose signature block is read back from the OS-signed
 * binary, and a signed ZXP — and runs the full release gate over it.
 * Fail-closed at every step: without signing configuration the build
 * refuses before producing anything, an unsigned or unnotarized binary
 * never reaches a manifest, and the secret scan runs **before** any
 * distributable artifact is packaged.
 *
 * Two distinct signatures exist and must not be conflated:
 * - the worker binary's OS signature (Authenticode / codesign + notarization),
 *   recorded in the worker manifest's release trust block;
 * - the ZXP's Adobe signature (ZXPSignCmd), verified with `-verify`.
 *
 * There is deliberately no publish step: creating a GitHub Release or any
 * public artifact is a manual, user-authorized action (acceptance criteria
 * of #32). A green run of this script is build evidence only — it is NOT a
 * release-trust completion proof until the artifacts have been audited
 * (`scripts/verify/verify-release-artifacts.ts`) and the certificates are
 * the real ones (an owner decision, #2).
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildReleaseWorker } from "../cep/operation-worker-update";
import { extractSignatureEvidence } from "./signature-evidence";
import {
	type SignWorkerConfig,
	buildSignPlan,
	redactSignArgs,
	resolveSignWorkerConfig,
} from "./sign-worker";
import {
	resolveReleaseSignZxpConfig,
	signZxp,
	verifyZxp,
} from "./sign-zxp";
import { assertNoSecrets } from "./secret-scan";

export type ReleaseBuildStep = Readonly<{
	name: string;
	args: readonly string[];
	env?: Readonly<Record<string, string>>;
}>;

export type RunStep = (step: ReleaseBuildStep) => void;

export const runStepWith =
	(env: NodeJS.ProcessEnv): RunStep =>
	(step) => {
		const [cmd, ...args] = step.args;
		const r = spawnSync(cmd, args, {
			cwd: process.cwd(),
			stdio: "inherit",
			env: step.env ? { ...env, ...step.env } : env,
		});
		if (r.status !== 0) {
			// Args can carry certificate passwords; never render them raw.
			throw new Error(
				`[build-release] step "${step.name}" failed: ${redactSignArgs(step.args).join(" ")}`,
			);
		}
	};

/**
 * Subprocess-level plan. The worker binary is signed in-process between the
 * panel build and the verify gate (staged → signed → evidence extracted →
 * release manifest written), so signing is not a step here. The ZXP is
 * signed in-process after the zip packaging (same staged pack input).
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
		// Runs only after the secret scan has passed — see runReleaseBuild.
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
			"--artifact=dist/app.ty-plus.zxp",
		],
	},
];

export type RunSignCommand = (args: readonly string[]) => void;

const runSignCommandWith = (args: readonly string[]): void => {
	const r = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
	if (r.status !== 0) {
		// Args can carry certificate passwords; never render them raw.
		throw new Error(
			`[build-release] worker signing failed: ${redactSignArgs(args).join(" ")}`,
		);
	}
};

/**
 * The full release-trust sequence. Fail-closed ordering:
 *
 * 1. resolve the signing configs — a missing configuration refuses before
 *    anything is built (owner decision #32);
 * 2. production panel build;
 * 3. worker: staged → OS-signed → evidence read back → release manifest;
 * 4. release-trust verify gate over the built bundle;
 * 5. secret scan over the exact bytes that ship — **before** packaging;
 * 6. zip + signed ZXP (signature verified) + machine-readable manifest.
 */
export const runReleaseBuild = async (
	options: Readonly<{
		productVersion?: string;
		platform?: "windows" | "macos";
		run?: RunStep;
		runSign?: RunSignCommand;
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
	const signConfig = resolveSignWorkerConfig(platform, options.env);
	const zxpConfig = resolveReleaseSignZxpConfig(options.env);
	const packageJson = JSON.parse(
		readFileSync("package.json", "utf8"),
	) as { version?: string };
	const productVersion = options.productVersion ?? packageJson.version;
	if (!productVersion) {
		throw new Error("[build-release] no product version to build");
	}

	const run = options.run ?? runStepWith({ ...process.env, ...options.env });
	const [panelBuild, verifyGate, packageZip, releaseManifest] =
		plannedSteps({ productVersion });
	run(panelBuild);

	// Sign the staged worker and write the release trust manifest. The
	// evidence is read back from the signed binary — the manifest never
	// records a signature the binary does not carry.
	const runSign = options.runSign ?? runSignCommandWith;
	await buildReleaseWorker(async (stagedPath) => {
		const submissionZipPath = `${stagedPath}.notarization.zip`;
		for (const args of buildSignPlan(signConfig, stagedPath, submissionZipPath)) {
			runSign(args);
		}
		return extractSignatureEvidence(platform, stagedPath);
	});

	run(verifyGate);

	// Audit the staged pack input before it is archived. dist/cep-pack is
	// created by the packaging step itself, so the scan targets its source:
	// nothing distributable exists until this has passed.
	assertNoSecrets(path.resolve("dist", "cep-dev"));

	run(packageZip);

	// Sign the ZXP from the same staged pack and verify the embedded
	// signature — the Adobe trust chain, independent of the worker's OS
	// signature above.
	signZxp(
		{
			...zxpConfig,
			inputDir: path.resolve("dist", "cep-pack", "app.ty-plus"),
			outputFile: path.resolve("dist", "app.ty-plus.zxp"),
		},
		{ generateIfMissing: false },
	);
	verifyZxp({
		...zxpConfig,
		outputFile: path.resolve("dist", "app.ty-plus.zxp"),
	});

	run(releaseManifest);
};

if (import.meta.main) {
	await runReleaseBuild();
}
