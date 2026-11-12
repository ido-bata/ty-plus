#!/usr/bin/env bun
/**
 * Prepare platform-specific GitHub Release assets for manual publication.
 *
 * This script never creates tags, GitHub Releases or public artifacts.
 * The release operator uploads the staged files only after authorization.
 *
 * All tag / channel / asset-name rules come from `release-version.ts`; this
 * module only performs the staging. The update client matches the same asset
 * names (`releaseAssetNames`), so staging and discovery cannot drift apart.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	assertReleaseIdentity,
	isReleasePlatform,
	type ReleaseChannel,
	type ReleasePlatform,
	releaseAssetNames,
} from "./release-version";

type ArtifactRecord = { file: string; sha256: string; bytes: number };
type ReleaseManifest = {
	version: string;
	releaseVersion: string;
	channel: ReleaseChannel;
	sourceCommit: string;
	trustMode: string;
	artifacts: ArtifactRecord[];
};

const digest = (file: string): string =>
	createHash("sha256").update(readFileSync(file)).digest("hex");

export type StageInput = Readonly<{
	/** Directory holding the verified build artifacts. */
	distRoot: string;
	manifest: ReleaseManifest;
	workerPlatforms: readonly string[];
	head: string;
}>;

export type StagedAsset = Readonly<{
	file: string;
	sha256: string;
	bytes: number;
}>;

export type StagedRelease = Readonly<{
	directory: string;
	version: ReturnType<typeof assertReleaseIdentity>;
	platform: ReleasePlatform;
	assets: readonly StagedAsset[];
	names: ReturnType<typeof releaseAssetNames>;
}>;

/**
 * Stages the verified build's zip/ZXP under the public GitHub asset names.
 *
 * Pure with respect to the network and to git state (the caller supplies
 * `head`), so it can be exercised against real bytes. Every claim is
 * re-derived: the manifest must be release-trust, the bundle must hold exactly
 * one platform, and each copied artifact's bytes must still hash to what the
 * manifest recorded.
 */
export const stageGitHubRelease = async (
	input: StageInput,
): Promise<StagedRelease> => {
	const { manifest } = input;
	if (manifest.trustMode !== "release" || !Array.isArray(manifest.artifacts)) {
		throw new Error("only release-trust manifests may be staged");
	}
	if (input.workerPlatforms.length !== 1) {
		throw new Error("expected exactly one platform in this release bundle");
	}
	const [declaredPlatform] = input.workerPlatforms;
	if (!isReleasePlatform(declaredPlatform)) {
		throw new Error(
			`unsupported release platform "${String(declaredPlatform)}" in this bundle`,
		);
	}
	const platform: ReleasePlatform = declaredPlatform;
	// Re-derive the identity from the manifest rather than trusting it: the
	// channel and the numeric core must both agree with the release version.
	const version = assertReleaseIdentity({
		releaseVersion: manifest.releaseVersion,
		packageVersion: manifest.version,
		channel: String(manifest.channel),
	});
	if (input.head !== manifest.sourceCommit) {
		throw new Error("source SHA differs from the verified release manifest");
	}
	const names = releaseAssetNames(version, platform);

	const prepared = path.join(input.distRoot, "github-release");
	await mkdir(prepared, { recursive: true });
	// Clear everything this release owns before writing. Two distinct stale
	// cases must not survive into upload:
	//   - other versions' assets (a previous channel/version build), and
	//   - *this* version's assets from an earlier build, whose bytes differ.
	// Uploading whatever happens to be in the directory would publish a mix.
	// The manifest is the authority for what "this release" means, so the whole
	// staging directory is rewritten from the verified build.
	if (existsSync(prepared)) {
		for (const entry of await readdir(prepared)) {
			await rm(path.join(prepared, entry), { force: true, recursive: true });
		}
	}
	const rename = new Map([
		["app.ty-plus.zip", names.zip],
		["app.ty-plus.zxp", names.zxp],
	]);
	const assets: StagedAsset[] = [];
	for (const [sourceName, name] of rename) {
		const original = manifest.artifacts.find((a) => a.file === sourceName);
		const sourcePath = path.join(input.distRoot, sourceName);
		const targetPath = path.join(prepared, name);
		if (
			!original ||
			!existsSync(sourcePath) ||
			digest(sourcePath) !== original.sha256 ||
			statSync(sourcePath).size !== original.bytes
		) {
			throw new Error(`missing or invalid release artifact: ${sourceName}`);
		}
		await copyFile(sourcePath, targetPath);
		assets.push({ ...original, file: name });
	}
	const finalManifest: ReleaseManifest = { ...manifest, artifacts: assets };
	const targetManifest = path.join(prepared, names.manifest);
	const manifestBytes = `${JSON.stringify(finalManifest, null, 2)}\n`;
	await writeFile(targetManifest, manifestBytes);
	return { directory: prepared, version, platform, assets, names };
};

const main = async (): Promise<void> => {
	const dist = path.resolve("dist");
	const sourceManifestPath = path.join(dist, "release-manifest.json");
	const workerManifestPath = path.join(
		dist,
		"cep-dev",
		"worker",
		"manifest.json",
	);
	if (!existsSync(sourceManifestPath) || !existsSync(workerManifestPath)) {
		throw new Error(
			"run a verified release-trust build before preparing GitHub assets",
		);
	}
	const worker = JSON.parse(readFileSync(workerManifestPath, "utf8")) as {
		workers?: Record<string, unknown>;
	};
	const revParse = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const sourceCommit = revParse.stdout.toString().trim();
	if (revParse.exitCode !== 0 || !/^[a-f0-9]{40}$/.test(sourceCommit)) {
		throw new Error(
			"cannot resolve the source commit — run this from a git checkout of the release",
		);
	}
	const staged = await stageGitHubRelease({
		distRoot: dist,
		manifest: JSON.parse(
			readFileSync(sourceManifestPath, "utf8"),
		) as ReleaseManifest,
		workerPlatforms: Object.keys(worker.workers ?? {}),
		head: sourceCommit,
	});

	console.log(`[github-release] prepared assets: ${staged.directory}`);
	console.log(
		`[github-release] tag: ${staged.version.tag} (${staged.version.channel})`,
	);
	console.log(
		"[github-release] SHA-256 and source commit checked; publication not performed",
	);
	console.log(
		`[github-release] files: ${staged.assets.map((a) => a.file).join(", ")}`,
	);
	console.log(
		"[github-release] create a DRAFT release only after the owner's explicit authorization",
	);
};

if (import.meta.main) {
	await main();
}
