#!/usr/bin/env bun
/**
 * Generate the machine-readable release manifest for built distribution
 * artifacts (Issue #6).
 *
 * Contract (docs/architecture/distribution.md):
 *   - version / extensionId / sourceCommit / trustMode identify the build
 *   - every packaged artifact file is listed with its sha256
 *   - the manifest is written next to the artifacts and is itself part of
 *     the released set, so its own hash is not self-referential
 *
 * Trust modes (see the distribution doc):
 *   - `development-unsigned`: internal verification builds. The panel and
 *     the worker manifest agree on unsigned trust; no certificate involved.
 *   - `release`: distribution builds. Requires OS-signed worker binaries
 *     (Authenticode / codesign) and a signed ZXP — blocked on the signing
 *     identity decision (#6 / #2 blockers). This script fails closed rather
 *     than emitting a release manifest without the signature evidence.
 *
 * Usage:
 *   bun scripts/package/release-manifest.ts --trust-mode=development-unsigned \
 *     --artifact=dist/app.ty-plus-internal-macos.zip
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { assertReleaseIdentity } from "./release-version";

const fail = (message: string): never => {
	console.error(`[release-manifest] ${message}`);
	process.exit(1);
};

const args = process.argv.slice(2);
const trustMode = args
	.find((arg) => arg.startsWith("--trust-mode="))
	?.split("=")[1];
const artifacts = args
	.filter((arg) => arg.startsWith("--artifact="))
	.map((arg) => path.resolve(arg.split("=")[1]));

if (trustMode !== "development-unsigned" && trustMode !== "release") {
	fail("--trust-mode must be development-unsigned or release");
}
if (artifacts.length === 0) fail("at least one --artifact is required");

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
	version?: unknown;
};
if (typeof packageJson.version !== "string" || !packageJson.version) {
	fail("package.json has no version");
}

// CEP needs X.Y.Z, but preview release identity uses the full SemVer tag.
// The channel is derived from the version, never taken from the environment
// independently: an operator cannot label an insider build as stable.
const releaseVersion =
	process.env.TY_PLUS_RELEASE_VERSION?.trim() || packageJson.version;
const requestedChannel = process.env.TY_PLUS_RELEASE_CHANNEL?.trim();
let identity: ReturnType<typeof assertReleaseIdentity>;
try {
	identity = assertReleaseIdentity({
		releaseVersion,
		packageVersion: packageJson.version,
		...(requestedChannel ? { channel: requestedChannel } : {}),
	});
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
const releaseChannel = identity.channel;

const commitResult = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
	stdout: "pipe",
});
const sourceCommit = commitResult.stdout.toString().trim();
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
	fail("cannot resolve the source commit");
}

// The trust mode is only honest when the worker manifest inside the built
// bundle agrees with it — a pack whose panel expects one mode while its
// worker manifest declares the other fails at boot (binary_manifest_mismatch).
const workerManifestPath = path.resolve(
	"dist",
	"cep-dev",
	"worker",
	"manifest.json",
);
if (!existsSync(workerManifestPath)) {
	fail("missing dist/cep-dev/worker/manifest.json — run the CEP build first");
}
const workerManifest = JSON.parse(readFileSync(workerManifestPath, "utf8")) as {
	trust?: { mode?: unknown };
};
if (workerManifest.trust?.mode !== trustMode) {
	fail(
		`worker manifest trust mode (${String(workerManifest.trust?.mode)}) does not match --trust-mode (${trustMode})`,
	);
}

for (const artifact of artifacts) {
	if (!existsSync(artifact) || !statSync(artifact).isFile()) {
		fail(`artifact not found: ${artifact}`);
	}
}

const manifest = {
	version: packageJson.version,
	releaseVersion,
	channel: releaseChannel,
	extensionId: "app.ty-plus",
	sourceCommit,
	trustMode,
	generatedAt: new Date().toISOString(),
	artifacts: artifacts.map((artifact) => ({
		file: path.basename(artifact),
		sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
		bytes: statSync(artifact).size,
	})),
};

const outFile = path.resolve("dist", "release-manifest.json");
await Bun.write(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[release-manifest] wrote ${outFile}`);
